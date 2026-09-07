from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def valid_payload():
    return {
        "timestamp": "2026-01-01T00:00:00Z",
        "engineId": "ENG-TEST",
        "missionId": "MSN-TEST",
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
    }


def test_predict_returns_expected_state():
    response = client.post("/physics/predict", json=valid_payload())

    assert response.status_code == 200
    assert set(response.json()) == {
        "expectedRpm",
        "expectedEgt",
        "expectedCht",
        "expectedOilTemperature",
        "expectedOilPressure",
        "expectedFuelFlow",
        "expectedVibration",
        "expectedBatteryVoltage",
    }


def test_predict_rejects_invalid_throttle():
    payload = valid_payload()
    payload["throttle"] = 1.5

    response = client.post("/physics/predict", json=payload)

    assert response.status_code == 422