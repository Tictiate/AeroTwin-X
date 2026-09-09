from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.degradation.degradation_estimator import (
    DegradationEvaluateRequest,
    DiagnosticHealthInput,
    estimate_degradation,
    estimate_rul,
)
from app.health.health_calculator import (
    HealthContributor,
    HealthEvaluateResponse,
    HealthTrend,
    SensorHealthResult,
)
from app.ml.inference import MLAnalyzeResponse, ResidualInput
from app.physics.predictions import PhysicsPrediction, TelemetryInput
from main import app

client = TestClient(app)


def diagnostic_health(
    health_value: float,
    timestamp: datetime,
    diagnostic_type: str = "NORMAL",
    sensor_quality: float = 100.0,
) -> DiagnosticHealthInput:
    health = HealthEvaluateResponse(
        overallHealth=health_value,
        status="HEALTHY" if health_value >= 90 else "DEGRADED",
        subsystems={
            "thermal": health_value,
            "lubrication": health_value,
            "combustion": health_value,
            "mechanical": health_value,
            "electrical": health_value,
            "sensors": sensor_quality,
        },
        trend=HealthTrend(direction="DEGRADING", ratePerHour=-1.0),
        sensorHealth={"cht": SensorHealthResult(health=sensor_quality, status="SUSPECT", confidence=0.8, reason="test")},
        contributors=[HealthContributor(factor="test", impact=-1.0)],
        diagnosticType=diagnostic_type,
        affectedSensor="cht" if diagnostic_type == "SENSOR_FAULT" else None,
        faultType=None,
        diagnosticConfidence=0.8,
    )
    telemetry = TelemetryInput(
        timestamp=timestamp,
        engineId="ENG-RUL",
        missionId="MSN-RUL",
        missionPhase="CRUISE",
        altitude=3000.0,
        ambientTemperature=10.0,
        throttle=0.6,
        load=0.4,
        rpm=3500.0,
        egt=500.0,
        cht=120.0,
        oilTemperature=80.0,
        oilPressure=300.0,
        fuelFlow=10.0,
        vibration=4.0,
        batteryVoltage=14.2,
    )
    prediction = PhysicsPrediction(
        expectedRpm=3500.0,
        expectedEgt=500.0,
        expectedCht=120.0,
        expectedOilTemperature=80.0,
        expectedOilPressure=300.0,
        expectedFuelFlow=10.0,
        expectedVibration=4.0,
        expectedBatteryVoltage=14.2,
    )
    residuals = ResidualInput(**{field: 0.0 for field in ResidualInput.model_fields})
    analysis = MLAnalyzeResponse(
        anomaly=diagnostic_type != "NORMAL",
        anomalyScore=0.7 if diagnostic_type != "NORMAL" else 0.02,
        predictedFault=(
            "SENSOR_DRIFT" if diagnostic_type == "SENSOR_FAULT"
            else "INJECTOR_DEGRADATION" if diagnostic_type == "PHYSICAL_FAULT"
            else "NORMAL"
        ),
        faultProbabilities={"NORMAL": 1.0},
        modelVersion="phase4-v1",
    )
    return DiagnosticHealthInput(
        telemetry=telemetry,
        prediction=prediction,
        residuals=residuals,
        analysis=analysis,
        health=health,
    )


def test_insufficient_history_is_explicit():
    inputs = [diagnostic_health(98.0, datetime(2026, 1, 1, tzinfo=timezone.utc))]
    degradation = estimate_degradation(inputs)
    rul = estimate_rul(inputs, degradation)

    assert rul.status == "INSUFFICIENT_HISTORY"
    assert rul.rulHours is None


def test_stable_health_does_not_create_fake_rul():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inputs = [diagnostic_health(98.0 + (index % 2) * 0.1, start + timedelta(hours=index)) for index in range(6)]
    degradation = estimate_degradation(inputs)
    rul = estimate_rul(inputs, degradation)

    assert degradation.trend == "STABLE"
    assert rul.status == "STABLE"
    assert rul.rulHours is None


def test_linear_degradation_produces_monotonic_rul():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inputs = [diagnostic_health(90.0 - (index * 5.0), start + timedelta(hours=index), "PHYSICAL_FAULT") for index in range(6)]
    estimates = []
    for index in range(4, len(inputs)):
        history = inputs[:index]
        current = inputs[index]
        degradation = estimate_degradation([*history, current])
        estimates.append(estimate_rul([*history, current], degradation).rulHours)

    assert all(value is not None for value in estimates)
    assert all(left > right for left, right in zip(estimates, estimates[1:]))


def test_sensor_fault_reduces_confidence_without_catastrophic_physical_degradation():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inputs = [diagnostic_health(98.0, start + timedelta(hours=index), "SENSOR_FAULT", 50.0) for index in range(6)]
    degradation = estimate_degradation(inputs)
    rul = estimate_rul(inputs, degradation)

    assert degradation.dominantMechanism == "SENSOR_QUALITY_ISSUE"
    assert degradation.overallDegradation < 0.1
    assert degradation.confidence < 0.6
    assert rul.status in {"STABLE", "UNRELIABLE"}


def test_noisy_sustained_degradation_does_not_become_stable():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inputs = [
        diagnostic_health(
            72.0 + (8.0 if index % 2 else -5.0),
            start + timedelta(hours=index),
            "PHYSICAL_FAULT",
        )
        for index in range(10)
    ]

    degradation = estimate_degradation(inputs)
    rul = estimate_rul(inputs, degradation)

    assert degradation.overallDegradation >= 0.1
    assert degradation.trend == "DEGRADING"
    assert rul.status == "UNRELIABLE"
    assert rul.rulHours is None


def test_noisy_trajectory_has_lower_confidence_than_clean_trajectory():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    clean = [diagnostic_health(95.0 - index, start + timedelta(hours=index)) for index in range(10)]
    noisy = [diagnostic_health(95.0 - index + (8.0 if index % 2 else -8.0), start + timedelta(hours=index)) for index in range(10)]

    clean_state = estimate_degradation(clean)
    noisy_state = estimate_degradation(noisy)

    assert noisy_state.confidence <= clean_state.confidence


def test_degradation_api_returns_rul_contract():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inputs = [diagnostic_health(90.0 - (index * 2.0), start + timedelta(hours=index)) for index in range(5)]
    request = {
        "current": inputs[-1].model_dump(mode="json"),
        "history": [item.model_dump(mode="json") for item in inputs[:-1]],
    }

    response = client.post("/degradation/evaluate", json=request)

    assert response.status_code == 200
    assert "degradation" in response.json()
    assert "rul" in response.json()
