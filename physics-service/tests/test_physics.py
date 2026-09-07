from datetime import datetime, timezone

from app.physics.predictions import TelemetryInput, predict_healthy_state


def telemetry(throttle: float = 0.6, load: float = 0.4, altitude: float = 3000.0):
    return TelemetryInput(
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        engineId="ENG-TEST",
        missionId="MSN-TEST",
        missionPhase="CRUISE",
        altitude=altitude,
        ambientTemperature=10.0,
        throttle=throttle,
        load=load,
        rpm=3500.0,
        egt=500.0,
        cht=120.0,
        oilTemperature=80.0,
        oilPressure=300.0,
        fuelFlow=10.0,
        vibration=4.0,
        batteryVoltage=14.2,
    )


def test_throttle_increases_expected_operating_point():
    low = predict_healthy_state(telemetry(throttle=0.3))
    high = predict_healthy_state(telemetry(throttle=0.8))

    assert high.expectedRpm > low.expectedRpm
    assert high.expectedFuelFlow > low.expectedFuelFlow
    assert high.expectedEgt > low.expectedEgt


def test_load_reduces_rpm_and_increases_thermal_output():
    low = predict_healthy_state(telemetry(load=0.2))
    high = predict_healthy_state(telemetry(load=0.8))

    assert high.expectedRpm < low.expectedRpm
    assert high.expectedEgt > low.expectedEgt


def test_altitude_changes_expected_state():
    low = predict_healthy_state(telemetry(altitude=3000.0))
    high = predict_healthy_state(telemetry(altitude=6000.0))

    assert high.expectedRpm != low.expectedRpm
    assert high.expectedFuelFlow != low.expectedFuelFlow


def test_outputs_are_bounded():
    prediction = predict_healthy_state(telemetry(throttle=1.0, load=1.0))

    assert 800.0 <= prediction.expectedRpm <= 6000.0
    assert 0.0 < prediction.expectedEgt <= 1200.0
    assert 50.0 <= prediction.expectedOilPressure <= 550.0
    assert prediction.expectedFuelFlow > 0.0