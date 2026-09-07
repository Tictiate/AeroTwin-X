from app.health.health_calculator import (
    HealthDiagnosticInput,
    HealthEvaluateRequest,
    ResidualInput,
    evaluate_health,
)
from app.ml.inference import MLAnalyzeResponse
from app.physics.predictions import PhysicsPrediction, TelemetryInput
from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def diagnostic(row, fault: FaultType) -> HealthDiagnosticInput:
    telemetry_fields = [
        "timestamp", "engineId", "missionId", "missionPhase", "altitude",
        "ambientTemperature", "throttle", "load", "rpm", "egt", "cht",
        "oilTemperature", "oilPressure", "fuelFlow", "vibration", "batteryVoltage",
    ]
    prediction_fields = [
        "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature",
        "expectedOilPressure", "expectedFuelFlow", "expectedVibration",
    ]
    residual_fields = [
        "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
        "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
        "normalizedRpmResidual", "normalizedEgtResidual", "normalizedChtResidual",
        "normalizedOilTemperatureResidual", "normalizedOilPressureResidual",
        "normalizedFuelFlowResidual", "normalizedVibrationResidual",
    ]
    return HealthDiagnosticInput(
        telemetry=TelemetryInput(**{field: row[field] for field in telemetry_fields}),
        prediction=PhysicsPrediction(**{
            **{field: row[field] for field in prediction_fields},
            "expectedBatteryVoltage": 14.2,
        }),
        residuals=ResidualInput(**{field: row[field] for field in residual_fields}),
        analysis=MLAnalyzeResponse(
            anomaly=fault != FaultType.NORMAL,
            anomalyScore=0.8 if fault != FaultType.NORMAL else 0.05,
            predictedFault=fault.value if fault != FaultType.NORMAL else "NORMAL",
            faultProbabilities={fault.value: 1.0},
            modelVersion="phase4-v1",
        ),
        runId=int(row["runId"]),
    )


def evaluate_scenario(fault: FaultType, severity: float = 0.8, duration: int = 300):
    rows = generate_records(DatasetConfig(
        fault, duration_seconds=duration, seed=42, run_id=1,
        fault_start_seconds=0.0, fixed_severity=severity,
    ))
    inputs = [diagnostic(row, fault) for row in rows]
    return evaluate_health(HealthEvaluateRequest(current=inputs[-1], history=inputs[-5:-1]))


def test_healthy_engine_is_stable_and_healthy():
    result = evaluate_scenario(FaultType.NORMAL, severity=0.0, duration=10)

    assert result.overallHealth >= 95.0
    assert result.status == "HEALTHY"
    assert result.trend.direction == "STABLE"
    assert result.diagnosticType == "NORMAL"


def test_increasing_injector_severity_reduces_combustion_health():
    low = evaluate_scenario(FaultType.INJECTOR_DEGRADATION, severity=0.2)
    high = evaluate_scenario(FaultType.INJECTOR_DEGRADATION, severity=0.8)

    assert high.subsystems["combustion"] < low.subsystems["combustion"]
    assert high.overallHealth < low.overallHealth
    assert high.diagnosticType == "PHYSICAL_FAULT"


def test_lubrication_degradation_reduces_lubrication_health():
    result = evaluate_scenario(FaultType.LUBRICATION_DEGRADATION)

    assert result.subsystems["lubrication"] < 50.0
    assert result.subsystems["mechanical"] < 80.0
    assert result.diagnosticType == "PHYSICAL_FAULT"


def test_misfire_reduces_combustion_and_mechanical_health():
    result = evaluate_scenario(FaultType.MISFIRE)

    assert result.subsystems["combustion"] < 80.0
    assert result.subsystems["mechanical"] < 60.0
    assert result.diagnosticType == "PHYSICAL_FAULT"


def test_sensor_drift_prefers_sensor_fault_and_preserves_physical_health():
    result = evaluate_scenario(FaultType.SENSOR_DRIFT)

    assert result.diagnosticType == "SENSOR_FAULT"
    assert result.affectedSensor == "cht"
    assert result.subsystems["mechanical"] > 80.0
    assert result.faultType is None


def test_single_sample_deviation_does_not_trigger_sensor_fault():
    rows = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=6, seed=42))
    inputs = [diagnostic(row, FaultType.NORMAL) for row in rows]
    current = inputs[-1].model_copy(deep=True)
    current.residuals.chtResidual = 40.0
    current.residuals.normalizedChtResidual = 0.4
    result = evaluate_health(HealthEvaluateRequest(current=current, history=inputs[:-1]))

    assert result.diagnosticType != "SENSOR_FAULT"


def test_health_api_returns_interpretable_result():
    rows = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=2, seed=42))
    request = {
        "current": diagnostic(rows[-1], FaultType.NORMAL).model_dump(mode="json"),
        "history": [diagnostic(rows[0], FaultType.NORMAL).model_dump(mode="json")],
    }

    response = client.post("/health/evaluate", json=request)

    assert response.status_code == 200
    assert response.json()["status"] == "HEALTHY"
    assert set(response.json()["subsystems"]) == {
        "thermal", "lubrication", "combustion", "mechanical", "electrical", "sensors",
    }
