"""Repeatable mission conditions and healthy telemetry stream generation."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.physics.predictions import TelemetryInput, predict_healthy_state


@dataclass(frozen=True)
class MissionConditions:
    phase: str
    altitude_m: float
    ambient_temperature_c: float
    throttle: float
    load: float


@dataclass(frozen=True)
class OperatingProfile:
    name: str
    altitude_offset_m: float
    temperature_offset_c: float


PROFILES = (
    OperatingProfile("LOW_COOL", 0.0, -5.0),
    OperatingProfile("HIGH_WARM", 3500.0, 8.0),
    OperatingProfile("MID_STANDARD", 1500.0, 0.0),
)


def profile_for_seed(seed: int) -> OperatingProfile:
    return PROFILES[abs(seed) % len(PROFILES)]


def mission_conditions(elapsed_seconds: float, profile: OperatingProfile) -> MissionConditions:
    progress = elapsed_seconds % 300.0 / 300.0
    if progress < 0.10:
        phase, altitude, throttle, load = "TAKEOFF", 500.0, 0.90, 0.75
    elif progress < 0.30:
        phase, altitude, throttle, load = "CLIMB", 2500.0, 0.78, 0.65
    elif progress < 0.65:
        phase, altitude, throttle, load = "CRUISE", 5000.0, 0.62, 0.45
    elif progress < 0.80:
        phase, altitude, throttle, load = "LOITER", 4500.0, 0.42, 0.30
    elif progress < 0.93:
        phase, altitude, throttle, load = "DESCENT", 2200.0, 0.35, 0.40
    else:
        phase, altitude, throttle, load = "LANDING", 500.0, 0.25, 0.55

    transition = 0.03 * __import__("math").sin(elapsed_seconds / 8.0)
    return MissionConditions(
        phase=phase,
        altitude_m=max(0.0, altitude + profile.altitude_offset_m),
        ambient_temperature_c=15.0 + profile.temperature_offset_c,
        throttle=max(0.0, min(1.0, throttle + transition)),
        load=max(0.0, min(1.0, load - transition)),
    )


def initial_telemetry(
    start: datetime,
    profile: OperatingProfile,
    engine_id: str = "ENG-DATASET",
    mission_id: str = "MSN-DATASET",
) -> TelemetryInput:
    conditions = mission_conditions(0.0, profile)
    return TelemetryInput(
        timestamp=start,
        engineId=engine_id,
        missionId=mission_id,
        missionPhase=conditions.phase,
        altitude=conditions.altitude_m,
        ambientTemperature=conditions.ambient_temperature_c,
        throttle=conditions.throttle,
        load=conditions.load,
        rpm=1000.0,
        egt=conditions.ambient_temperature_c + 20.0,
        cht=conditions.ambient_temperature_c + 10.0,
        oilTemperature=conditions.ambient_temperature_c + 5.0,
        oilPressure=240.0,
        fuelFlow=2.0,
        vibration=1.5,
        batteryVoltage=14.2,
    )


def next_healthy_telemetry(
    previous: TelemetryInput,
    elapsed_seconds: float,
    sample_period_seconds: float,
    profile: OperatingProfile,
) -> tuple[TelemetryInput, object]:
    conditions = mission_conditions(elapsed_seconds, profile)
    operating_input = previous.model_copy(
        update={
            "timestamp": previous.timestamp + timedelta(seconds=sample_period_seconds),
            "missionPhase": conditions.phase,
            "altitude": conditions.altitude_m,
            "ambientTemperature": conditions.ambient_temperature_c,
            "throttle": conditions.throttle,
            "load": conditions.load,
        }
    )
    prediction = predict_healthy_state(operating_input)
    healthy = operating_input.model_copy(
        update={
            "rpm": prediction.expectedRpm,
            "egt": prediction.expectedEgt,
            "cht": prediction.expectedCht,
            "oilTemperature": prediction.expectedOilTemperature,
            "oilPressure": prediction.expectedOilPressure,
            "fuelFlow": prediction.expectedFuelFlow,
            "vibration": prediction.expectedVibration,
            "batteryVoltage": prediction.expectedBatteryVoltage,
        }
    )
    return healthy, prediction


def default_start_time() -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc)
