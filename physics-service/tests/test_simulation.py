"""Tests for the live fault-injection endpoint (POST /simulation/inject-fault).

This endpoint is a thin wrapper around app.simulation.fault_models' existing,
already-tested FAULT_MODELS/FaultSchedule (see test_fault_models.py for the
underlying model semantics). These tests verify the wrapper's own contract:
schedule application, response shape, and validation — not the fault math
itself, which is already covered.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def telemetry_payload():
    return {
        "timestamp": "2026-01-01T00:00:00Z",
        "engineId": "ENG-1",
        "missionId": "MSN-1",
        "missionPhase": "CRUISE",
        "altitude": 3000.0,
        "ambientTemperature": 10.0,
        "throttle": 0.6,
        "load": 0.5,
        "rpm": 3500.0,
        "egt": 500.0,
        "cht": 120.0,
        "oilTemperature": 80.0,
        "oilPressure": 300.0,
        "fuelFlow": 10.0,
        "vibration": 4.0,
        "batteryVoltage": 14.2,
    }


def test_normal_fault_type_returns_unmodified_telemetry():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "NORMAL", "elapsedFaultSeconds": 500.0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["active"] is False
    assert body["severity"] == 0.0
    assert body["telemetry"]["rpm"] == telemetry_payload()["rpm"]
    assert body["telemetry"]["egt"] == telemetry_payload()["egt"]


def test_before_onset_produces_no_change_even_for_a_physical_fault():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "INJECTOR_DEGRADATION", "elapsedFaultSeconds": 30.0},
    )
    body = response.json()
    assert body["active"] is False
    assert body["severity"] == 0.0
    assert body["telemetry"]["egt"] == telemetry_payload()["egt"]


def test_injector_degradation_after_onset_elevates_egt_and_fuel_flow():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "INJECTOR_DEGRADATION", "elapsedFaultSeconds": 240.0},
    )
    body = response.json()
    assert body["active"] is True
    assert body["severity"] == 1.0
    assert body["telemetry"]["egt"] > telemetry_payload()["egt"]
    assert body["telemetry"]["fuelFlow"] > telemetry_payload()["fuelFlow"]


def test_fixed_severity_overrides_the_ramp_but_not_the_onset_gate():
    # FaultSchedule.severity_at() still gates on elapsed_seconds < start_time_seconds (120s)
    # even with fixed_severity set — a fixed severity replaces the ramp shape, not the onset delay.
    before_onset = client.post(
        "/simulation/inject-fault",
        json={
            "telemetry": telemetry_payload(),
            "faultType": "LUBRICATION_DEGRADATION",
            "elapsedFaultSeconds": 1.0,
            "severity": 0.9,
        },
    ).json()
    assert before_onset["active"] is False
    assert before_onset["severity"] == 0.0

    after_onset = client.post(
        "/simulation/inject-fault",
        json={
            "telemetry": telemetry_payload(),
            "faultType": "LUBRICATION_DEGRADATION",
            "elapsedFaultSeconds": 121.0,
            "severity": 0.9,
        },
    ).json()
    assert after_onset["active"] is True
    assert after_onset["severity"] == 0.9
    assert after_onset["telemetry"]["oilPressure"] < telemetry_payload()["oilPressure"]


def test_sensor_drift_does_not_change_the_response_active_flag_meaning():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "SENSOR_DRIFT", "elapsedFaultSeconds": 200.0},
    )
    body = response.json()
    assert body["active"] is True
    assert body["telemetry"]["cht"] > telemetry_payload()["cht"]
    # Sensor drift never touches oilPressure/rpm-independent physical channels it doesn't model —
    # fuelFlow and vibration are untouched by this specific fault model.
    assert body["telemetry"]["fuelFlow"] == telemetry_payload()["fuelFlow"]


def test_misfire_is_deterministic_for_the_same_elapsed_seconds_and_seed():
    payload = {
        "telemetry": telemetry_payload(),
        "faultType": "MISFIRE",
        "elapsedFaultSeconds": 250.0,
        "seed": 7,
    }
    first = client.post("/simulation/inject-fault", json=payload).json()
    second = client.post("/simulation/inject-fault", json=payload).json()
    assert first["telemetry"]["rpm"] == second["telemetry"]["rpm"]
    assert first["telemetry"]["egt"] == second["telemetry"]["egt"]


def test_invalid_fault_type_is_rejected():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "NOT_A_REAL_FAULT", "elapsedFaultSeconds": 10.0},
    )
    assert response.status_code == 422


def test_negative_elapsed_seconds_is_rejected():
    response = client.post(
        "/simulation/inject-fault",
        json={"telemetry": telemetry_payload(), "faultType": "MISFIRE", "elapsedFaultSeconds": -1.0},
    )
    assert response.status_code == 422
