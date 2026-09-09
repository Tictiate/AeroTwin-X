from fastapi.testclient import TestClient

from api.routes import ml
from app.ml.inference import MLAnalyzeResponse, ModelRegistry
from main import app


client = TestClient(app)


def payload():
    return {
        "telemetry": {
            "timestamp": "2026-01-01T00:00:00Z",
            "engineId": "ENG-1",
            "missionId": "MSN-1",
            "missionPhase": "CRUISE",
            "altitude": 3000.0,
            "ambientTemperature": 10.0,
            "throttle": 0.6,
            "load": 0.4,
            "rpm": 3500.0,
            "egt": 500.0,
            "cht": 120.0,
            "oilTemperature": 80.0,
            "oilPressure": 300.0,
            "fuelFlow": 10.0,
            "vibration": 4.0,
            "batteryVoltage": 14.2,
        },
        "prediction": {
            "expectedRpm": 3500.0,
            "expectedEgt": 500.0,
            "expectedCht": 120.0,
            "expectedOilTemperature": 80.0,
            "expectedOilPressure": 300.0,
            "expectedFuelFlow": 10.0,
            "expectedVibration": 4.0,
            "expectedBatteryVoltage": 14.2,
        },
        "residuals": {
            "rpmResidual": 0.0,
            "egtResidual": 0.0,
            "chtResidual": 0.0,
            "oilTemperatureResidual": 0.0,
            "oilPressureResidual": 0.0,
            "fuelFlowResidual": 0.0,
            "vibrationResidual": 0.0,
            "normalizedRpmResidual": 0.0,
            "normalizedEgtResidual": 0.0,
            "normalizedChtResidual": 0.0,
            "normalizedOilTemperatureResidual": 0.0,
            "normalizedOilPressureResidual": 0.0,
            "normalizedFuelFlowResidual": 0.0,
            "normalizedVibrationResidual": 0.0,
        },
    }


def test_ml_api_returns_model_not_loaded_status(monkeypatch, tmp_path):
    monkeypatch.setattr(ml, "registry", ModelRegistry(tmp_path))

    response = client.post("/ml/analyze", json=payload())

    assert response.status_code == 503


def test_ml_api_validates_malformed_request():
    response = client.post("/ml/analyze", json={"telemetry": {}})

    assert response.status_code == 422


def test_ml_response_contract():
    response = MLAnalyzeResponse(
        anomaly=True,
        anomalyScore=0.8,
        predictedFault="MISFIRE",
        faultProbabilities={"MISFIRE": 1.0},
        modelVersion="phase4-v1",
    )

    assert response.anomalyScore == 0.8
    assert sum(response.faultProbabilities.values()) == 1.0



