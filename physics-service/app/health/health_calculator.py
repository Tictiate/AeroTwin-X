"""Interpretable prototype health and sensor-consistency calculations."""

from dataclasses import dataclass
from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from app.ml.inference import MLAnalyzeResponse, ResidualInput
from app.physics.predictions import PhysicsPrediction, TelemetryInput

PERSISTENCE_WINDOW = 5
PERSISTENCE_THRESHOLD = 0.08
SMOOTHING_ALPHA = 0.30
HEALTH_WEIGHTS = {
    "thermal": 0.20,
    "lubrication": 0.20,
    "combustion": 0.20,
    "mechanical": 0.15,
    "electrical": 0.10,
    "sensors": 0.15,
}

SENSOR_RESIDUALS = {
    "rpm": "normalizedRpmResidual",
    "egt": "normalizedEgtResidual",
    "cht": "normalizedChtResidual",
    "oilPressure": "normalizedOilPressureResidual",
    "oilTemperature": "normalizedOilTemperatureResidual",
    "fuelFlow": "normalizedFuelFlowResidual",
    "vibration": "normalizedVibrationResidual",
}
RELATED_SENSORS = {
    "rpm": ("egt", "fuelFlow", "vibration"),
    "egt": ("cht", "oilTemperature", "fuelFlow"),
    "cht": ("egt", "oilTemperature", "rpm"),
    "oilPressure": ("oilTemperature", "rpm", "vibration"),
    "oilTemperature": ("oilPressure", "cht", "egt"),
    "fuelFlow": ("rpm", "egt", "load"),
    "vibration": ("rpm", "oilPressure", "egt"),
}


class HealthDiagnosticInput(BaseModel):
    telemetry: TelemetryInput
    prediction: PhysicsPrediction
    residuals: ResidualInput
    analysis: MLAnalyzeResponse
    runId: int = 0


class HealthEvaluateRequest(BaseModel):
    current: HealthDiagnosticInput
    history: list[HealthDiagnosticInput] = Field(default_factory=list)


class SensorHealthResult(BaseModel):
    health: float
    status: str
    confidence: float
    reason: str


class HealthTrend(BaseModel):
    direction: str
    ratePerHour: float


class HealthContributor(BaseModel):
    factor: str
    impact: float


class HealthEvaluateResponse(BaseModel):
    overallHealth: float
    status: str
    subsystems: dict[str, float]
    trend: HealthTrend
    sensorHealth: dict[str, SensorHealthResult]
    contributors: list[HealthContributor]
    diagnosticType: str
    affectedSensor: str | None = None
    faultType: str | None = None
    diagnosticConfidence: float


def _bounded(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, value)), 2)


def _history_values(inputs: list[HealthDiagnosticInput], name: str) -> list[float]:
    return [float(getattr(item.residuals, name)) for item in inputs]


def _penalty(values: list[float], positive_only: bool = False) -> float:
    if not values:
        return 0.0
    recent = values[-PERSISTENCE_WINDOW:]
    magnitudes = [max(0.0, value) if positive_only else abs(value) for value in recent]
    persistence = sum(abs(value) >= PERSISTENCE_THRESHOLD for value in recent) / len(recent)
    return min(100.0, 300.0 * float(np.mean(magnitudes)) + 25.0 * persistence)


def _trend(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    recent = values[-PERSISTENCE_WINDOW:]
    return float((recent[-1] - recent[0]) / max(1, len(recent) - 1))


def _sensor_health(inputs: list[HealthDiagnosticInput]) -> tuple[dict[str, SensorHealthResult], str | None, float]:
    results: dict[str, SensorHealthResult] = {}
    isolated_candidates: list[tuple[str, float, float]] = []
    for sensor, residual_name in SENSOR_RESIDUALS.items():
        values = _history_values(inputs, residual_name)
        recent = values[-PERSISTENCE_WINDOW:]
        magnitude = min(1.0, float(np.mean(np.abs(recent)))) if recent else 0.0
        persistence = sum(abs(value) >= PERSISTENCE_THRESHOLD for value in recent) / max(1, len(recent))
        related = [
            abs(_history_values(inputs, SENSOR_RESIDUALS[related_sensor])[-1])
            for related_sensor in RELATED_SENSORS.get(sensor, ())
            if related_sensor in SENSOR_RESIDUALS and _history_values(inputs, SENSOR_RESIDUALS[related_sensor])
        ]
        related_magnitude = float(np.mean(related)) if related else 0.0
        isolated = magnitude >= 0.12 and persistence >= 0.6 and related_magnitude < 0.08
        isolation_confidence = min(1.0, 0.5 * magnitude / 0.3 + 0.5 * (1.0 - related_magnitude / 0.2))
        if isolated:
            isolated_candidates.append((sensor, isolation_confidence, persistence))
        score = _bounded(100.0 - (65.0 * magnitude) - (25.0 * persistence))
        status = "HEALTHY" if score >= 90.0 else "SUSPECT" if score >= 70.0 else "DEGRADED"
        reason = "Consistent with related engine signals"
        if isolated:
            reason = "Persistent deviation is inconsistent with related engine signals"
        elif persistence > 0.0:
            reason = "Residual deviation is persistent and requires monitoring"
        results[sensor] = SensorHealthResult(
            health=score,
            status=status,
            confidence=round(max(0.0, min(1.0, isolation_confidence)), 3),
            reason=reason,
        )
    if not isolated_candidates:
        return results, None, 0.0
    sensor, confidence, _ = max(isolated_candidates, key=lambda value: value[1])
    return results, sensor, round(confidence, 3)


def _subsystem_scores(inputs: list[HealthDiagnosticInput], sensor_fault: str | None) -> tuple[dict[str, float], dict[str, float]]:
    residuals = inputs[-PERSISTENCE_WINDOW:]
    names = {
        "egt": "normalizedEgtResidual",
        "cht": "normalizedChtResidual",
        "oilTemperature": "normalizedOilTemperatureResidual",
        "oilPressure": "normalizedOilPressureResidual",
        "fuelFlow": "normalizedFuelFlowResidual",
        "rpm": "normalizedRpmResidual",
        "vibration": "normalizedVibrationResidual",
    }
    values = {name: [float(getattr(item.residuals, residual)) for item in residuals] for name, residual in names.items()}
    thermal_names = [name for name in ("egt", "cht", "oilTemperature") if name != sensor_fault]
    thermal = 100.0 - np.mean([_penalty(values[name], positive_only=True) for name in thermal_names])
    lubrication = 100.0 - np.mean([
        _penalty(values["oilPressure"]),
        _penalty(values["oilTemperature"], positive_only=True),
    ])
    combustion = 100.0 - np.mean([
        _penalty(values["egt"], positive_only=True),
        _penalty(values["fuelFlow"]),
        _penalty(values["rpm"]),
    ])
    mechanical = 100.0 - np.mean([_penalty(values["vibration"], positive_only=True), _penalty(values["rpm"])])
    current = inputs[-1]
    battery_delta = abs(float(current.telemetry.batteryVoltage) - float(current.prediction.expectedBatteryVoltage)) / 14.2
    electrical = 100.0 - min(100.0, battery_delta * 100.0 + 15.0 * max(0.0, _trend([float(item.telemetry.batteryVoltage) for item in inputs])))
    sensors, _, _ = _sensor_health(inputs)
    sensor_score = float(np.mean([sensor.health for sensor in sensors.values()]))
    scores = {
        "thermal": _bounded(thermal),
        "lubrication": _bounded(lubrication),
        "combustion": _bounded(combustion),
        "mechanical": _bounded(mechanical),
        "electrical": _bounded(electrical),
        "sensors": _bounded(sensor_score),
    }
    return scores, values


def _status(score: float) -> str:
    if score >= 90.0:
        return "HEALTHY"
    if score >= 75.0:
        return "CAUTION"
    if score >= 50.0:
        return "DEGRADED"
    return "CRITICAL"


def evaluate_health(request: HealthEvaluateRequest) -> HealthEvaluateResponse:
    inputs = [*request.history, request.current]
    sensor_health, affected_sensor, sensor_confidence = _sensor_health(inputs)
    subsystems, values = _subsystem_scores(inputs, affected_sensor)
    raw_health = sum(subsystems[name] * weight for name, weight in HEALTH_WEIGHTS.items())
    previous_raw = raw_health
    if len(inputs) > 1:
        previous_scores, _ = _subsystem_scores(inputs[:-1], None)
        previous_raw = sum(previous_scores[name] * weight for name, weight in HEALTH_WEIGHTS.items())
    overall = _bounded((SMOOTHING_ALPHA * raw_health) + ((1.0 - SMOOTHING_ALPHA) * previous_raw))
    model_fault = request.current.analysis.predictedFault
    fault_probabilities = request.current.analysis.faultProbabilities
    # predictedFault is gated by the separate anomaly-score threshold (it defaults to
    # "NORMAL" whenever anomaly=False, even when the classifier itself is highly confident
    # in a physical fault -- see AEROTWIN_PROJECT_MASTER.md FINDING-5/FINDING-4). Using it
    # here would let a genuinely physical fault (e.g. Injector Degradation, whose anomaly
    # gate rarely crosses) get misattributed as SENSOR_FAULT whenever the isolation
    # heuristic below also happens to flag one channel. The classifier's own top-probability
    # class is not gated by the anomaly threshold and is the correct signal for "does the
    # model itself support a sensor-fault explanation."
    classifier_top_fault = max(fault_probabilities, key=fault_probabilities.get) if fault_probabilities else model_fault
    model_supports_sensor_fault = classifier_top_fault in {"NORMAL", "SENSOR_DRIFT"}
    if affected_sensor and sensor_confidence >= 0.6 and model_supports_sensor_fault:
        diagnostic_type = "SENSOR_FAULT"
        fault_type = None
        diagnostic_confidence = sensor_confidence
    elif request.current.analysis.anomaly and model_fault != "NORMAL":
        diagnostic_type = "PHYSICAL_FAULT"
        fault_type = model_fault
        diagnostic_confidence = max(request.current.analysis.faultProbabilities.values(), default=0.0)
    else:
        diagnostic_type = "NORMAL"
        fault_type = None
        diagnostic_confidence = 1.0 - request.current.analysis.anomalyScore
    raw_history = []
    for end in range(max(1, len(inputs) - PERSISTENCE_WINDOW + 1), len(inputs) + 1):
        segment_scores, _ = _subsystem_scores(inputs[:end], None)
        raw_history.append(sum(segment_scores[name] * weight for name, weight in HEALTH_WEIGHTS.items()))
    rate = 0.0
    if len(raw_history) >= 2:
        rate = (raw_history[-1] - raw_history[0]) * 3600.0 / max(1.0, len(raw_history) - 1)
    direction = "DEGRADING" if rate < -0.1 else "IMPROVING" if rate > 0.1 else "STABLE"
    contributors = []
    for name, score in sorted(subsystems.items(), key=lambda item: item[1]):
        impact = (score - 100.0) * HEALTH_WEIGHTS[name]
        if impact < -0.1:
            contributors.append(HealthContributor(factor=f"{name.title()} Health", impact=round(impact, 2)))
    for sensor, result in sensor_health.items():
        if result.health < 90.0:
            contributors.append(HealthContributor(
                factor=f"{sensor} Sensor Consistency",
                impact=round((result.health - 100.0) * HEALTH_WEIGHTS["sensors"] / len(sensor_health), 2),
            ))
    return HealthEvaluateResponse(
        overallHealth=overall,
        status=_status(overall),
        subsystems=subsystems,
        trend=HealthTrend(direction=direction, ratePerHour=round(rate, 2)),
        sensorHealth=sensor_health,
        contributors=contributors[:8],
        diagnosticType=diagnostic_type,
        affectedSensor=affected_sensor if diagnostic_type == "SENSOR_FAULT" else None,
        faultType=fault_type,
        diagnosticConfidence=round(max(0.0, min(1.0, diagnostic_confidence)), 3),
    )
