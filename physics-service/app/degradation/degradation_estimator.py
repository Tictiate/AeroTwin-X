"""Interpretable degradation trajectory and prototype RUL estimation."""

from dataclasses import dataclass
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from app.health.health_calculator import HealthEvaluateResponse
from app.ml.inference import MLAnalyzeResponse, ResidualInput
from app.physics.predictions import PhysicsPrediction, TelemetryInput

HEALTH_HISTORY_WINDOW = 60
MIN_RUL_HISTORY_SAMPLES = 5
EOL_HEALTH_THRESHOLD = 50.0
MIN_DEGRADATION_RATE_PER_HOUR = 0.05
MIN_MATERIAL_DEGRADATION_FOR_UNRELIABLE_RUL = 0.10


class DiagnosticHealthInput(BaseModel):
    telemetry: TelemetryInput
    prediction: PhysicsPrediction = Field(alias="physicsPrediction")
    residuals: ResidualInput
    analysis: MLAnalyzeResponse
    health: HealthEvaluateResponse
    runId: int = 0

    model_config = {"populate_by_name": True}


class DegradationEvaluateRequest(BaseModel):
    current: DiagnosticHealthInput
    history: list[DiagnosticHealthInput] = Field(default_factory=list)


class DegradationState(BaseModel):
    timestamp: str
    engineId: str
    overallHealth: float
    overallDegradation: float
    componentDegradation: dict[str, float]
    sensorQualityDegradation: float
    degradationRatePerHour: float
    dominantMechanism: str
    trend: str
    confidence: float
    dataQuality: str
    historySamples: int


class RulEstimate(BaseModel):
    rulHours: float | None
    lowerBoundHours: float | None
    upperBoundHours: float | None
    confidence: float
    status: str
    eolHealthThreshold: float
    degradationRatePerHour: float
    explanation: str


class DegradationEvaluateResponse(BaseModel):
    degradation: DegradationState
    rul: RulEstimate


def _bounded(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _slope(hours: np.ndarray, values: np.ndarray) -> float:
    if len(values) < 2 or np.ptp(hours) <= 0.0:
        return 0.0
    return float(np.polyfit(hours, values, 1)[0])


def _history_points(inputs: list[DiagnosticHealthInput]) -> tuple[np.ndarray, np.ndarray]:
    recent = inputs[-HEALTH_HISTORY_WINDOW:]
    timestamps = np.array([np.datetime64(item.telemetry.timestamp.replace(tzinfo=None)) for item in recent])
    seconds = (timestamps - timestamps[0]).astype("timedelta64[s]").astype(float)
    hours = seconds / 3600.0
    health = np.array([float(item.health.overallHealth) for item in recent])
    return hours, health


def _component_degradation(current: DiagnosticHealthInput) -> tuple[dict[str, float], float, float]:
    health = current.health
    components = {
        name: _bounded((100.0 - float(score)) / 100.0)
        for name, score in health.subsystems.items()
        if name != "sensors"
    }
    sensor_quality = _bounded((100.0 - float(health.subsystems.get("sensors", 100.0))) / 100.0)
    sensor_only_evidence = (
        health.diagnosticType == "SENSOR_FAULT"
        or current.analysis.predictedFault == "SENSOR_DRIFT"
    )
    if sensor_only_evidence:
        # Sensor-only evidence is data-quality degradation, not physical engine degradation.
        components = {name: value * 0.2 for name, value in components.items()}
    physical_degradation = float(np.average(list(components.values()), weights=[
        0.20, 0.20, 0.20, 0.15, 0.10
    ][:len(components)])) if components else 0.0
    return components, sensor_quality, physical_degradation


def _dominant_mechanism(current: DiagnosticHealthInput, components: dict[str, float]) -> str:
    if current.health.diagnosticType == "SENSOR_FAULT" or current.analysis.predictedFault == "SENSOR_DRIFT":
        return "SENSOR_QUALITY_ISSUE"
    if current.health.faultType and current.health.diagnosticType == "PHYSICAL_FAULT":
        return current.health.faultType
    if not components or max(components.values()) < 0.02:
        return "HEALTHY"
    return max(components, key=components.get).upper()


def estimate_degradation(inputs: list[DiagnosticHealthInput]) -> DegradationState:
    current = inputs[-1]
    components, sensor_quality, physical_degradation = _component_degradation(current)
    if len(inputs) >= 2:
        hours, health_values = _history_points(inputs)
        rate = max(0.0, -_slope(hours, health_values))
        previous_rate = max(0.0, -_slope(hours[: max(2, len(hours) // 2)], health_values[: max(2, len(hours) // 2)]))
    else:
        rate = 0.0
        previous_rate = 0.0
    if len(inputs) < MIN_RUL_HISTORY_SAMPLES:
        trend = "INSUFFICIENT_HISTORY"
    elif (
        rate <= MIN_DEGRADATION_RATE_PER_HOUR
        and current.health.diagnosticType == "PHYSICAL_FAULT"
        and physical_degradation >= MIN_MATERIAL_DEGRADATION_FOR_UNRELIABLE_RUL
    ):
        trend = "DEGRADING"
    elif rate <= MIN_DEGRADATION_RATE_PER_HOUR:
        trend = "STABLE"
    elif previous_rate > MIN_DEGRADATION_RATE_PER_HOUR and rate > previous_rate * 1.25:
        trend = "ACCELERATING"
    else:
        trend = "DEGRADING"
    history_factor = _bounded(len(inputs) / 20.0)
    sensor_factor = _bounded(1.0 - sensor_quality)
    confidence = _bounded(history_factor * (0.5 + 0.5 * sensor_factor) * (0.5 + 0.5 * current.health.diagnosticConfidence))
    if current.health.diagnosticType == "SENSOR_FAULT" or current.analysis.predictedFault == "SENSOR_DRIFT":
        confidence *= 0.6
    data_quality = "HIGH" if confidence >= 0.7 else "MEDIUM" if confidence >= 0.4 else "LOW"
    return DegradationState(
        timestamp=current.telemetry.timestamp.isoformat(),
        engineId=current.telemetry.engineId,
        overallHealth=round(100.0 - (physical_degradation * 100.0), 2),
        overallDegradation=round(physical_degradation, 4),
        componentDegradation={name: round(value, 4) for name, value in components.items()},
        sensorQualityDegradation=round(sensor_quality, 4),
        degradationRatePerHour=round(rate, 4),
        dominantMechanism=_dominant_mechanism(current, components),
        trend=trend,
        confidence=round(confidence, 3),
        dataQuality=data_quality,
        historySamples=len(inputs),
    )


def estimate_rul(inputs: list[DiagnosticHealthInput], degradation: DegradationState) -> RulEstimate:
    current = inputs[-1]
    if len(inputs) < MIN_RUL_HISTORY_SAMPLES:
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=degradation.confidence, status="INSUFFICIENT_HISTORY",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="RUL requires more sequential health history before extrapolation.",
        )
    if degradation.dominantMechanism == "HEALTHY":
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=degradation.confidence, status="STABLE",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="Healthy operation does not provide a reliable physical degradation trajectory for RUL extrapolation.",
        )
    if current.analysis.predictedFault == "NORMAL" and current.health.diagnosticType == "NORMAL":
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=degradation.confidence, status="STABLE",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="No corroborated physical fault is active; transient health changes are not extrapolated as RUL.",
        )
    if current.health.diagnosticType == "SENSOR_FAULT" or current.analysis.predictedFault == "SENSOR_DRIFT":
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=round(degradation.confidence * 0.6, 3), status="UNRELIABLE",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="RUL is withheld because sensor consistency is degraded; no physical EOL trajectory is established.",
        )
    if degradation.degradationRatePerHour <= MIN_DEGRADATION_RATE_PER_HOUR:
        if degradation.overallDegradation >= MIN_MATERIAL_DEGRADATION_FOR_UNRELIABLE_RUL:
            return RulEstimate(
                rulHours=None, lowerBoundHours=None, upperBoundHours=None,
                confidence=degradation.confidence, status="UNRELIABLE",
                eolHealthThreshold=EOL_HEALTH_THRESHOLD,
                degradationRatePerHour=degradation.degradationRatePerHour,
                explanation="Physical degradation is present, but its recent noisy trajectory does not support a reliable RUL rate.",
            )
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=degradation.confidence, status="STABLE",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="No reliable measurable physical degradation trend is present; RUL is not estimable.",
        )
    if degradation.trend in {"STABLE", "INSUFFICIENT_HISTORY"}:
        return RulEstimate(
            rulHours=None, lowerBoundHours=None, upperBoundHours=None,
            confidence=degradation.confidence, status="STABLE",
            eolHealthThreshold=EOL_HEALTH_THRESHOLD,
            degradationRatePerHour=degradation.degradationRatePerHour,
            explanation="No reliable measurable physical degradation trend is present; RUL is not estimable.",
        )
    hours, health_values = _history_points(inputs)
    rate = degradation.degradationRatePerHour
    differences = np.diff(health_values) / np.maximum(np.diff(hours), 1.0 / 3600.0)
    rate_variability = float(np.std(-differences)) if len(differences) else 0.0
    rate_low = max(MIN_DEGRADATION_RATE_PER_HOUR / 2.0, rate - (1.96 * rate_variability))
    rate_high = max(rate_low, rate + (1.96 * rate_variability))
    current_health = degradation.overallHealth
    point = max(0.0, (current_health - EOL_HEALTH_THRESHOLD) / rate)
    lower = max(0.0, (current_health - EOL_HEALTH_THRESHOLD) / rate_high)
    upper = max(lower, (current_health - EOL_HEALTH_THRESHOLD) / rate_low)
    status = "LOW_RUL" if point <= 10.0 else "UNRELIABLE" if degradation.confidence < 0.35 else "ESTIMATED"
    explanation = "RUL estimated from the recent physics-informed health degradation trend."
    if current.health.diagnosticType == "SENSOR_FAULT" or current.analysis.predictedFault == "SENSOR_DRIFT":
        explanation = "RUL confidence reduced because sensor consistency is degraded; physical degradation remains separately bounded."
    return RulEstimate(
        rulHours=round(point, 2), lowerBoundHours=round(lower, 2), upperBoundHours=round(upper, 2),
        confidence=degradation.confidence, status=status,
        eolHealthThreshold=EOL_HEALTH_THRESHOLD,
        degradationRatePerHour=round(rate, 4), explanation=explanation,
    )


def evaluate_degradation(request: DegradationEvaluateRequest) -> DegradationEvaluateResponse:
    inputs = [*request.history, request.current]
    degradation = estimate_degradation(inputs)
    return DegradationEvaluateResponse(degradation=degradation, rul=estimate_rul(inputs, degradation))
