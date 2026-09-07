"""Deterministic, reduced-order fault models for offline dataset generation."""

from dataclasses import dataclass
from enum import Enum
import math
import random

from app.physics.predictions import PhysicsPrediction, TelemetryInput


class FaultType(str, Enum):
    NORMAL = "NORMAL"
    INJECTOR_DEGRADATION = "INJECTOR_DEGRADATION"
    LUBRICATION_DEGRADATION = "LUBRICATION_DEGRADATION"
    MISFIRE = "MISFIRE"
    SENSOR_DRIFT = "SENSOR_DRIFT"


@dataclass(frozen=True)
class FaultSchedule:
    fault_type: FaultType = FaultType.NORMAL
    start_time_seconds: float = 120.0
    progression_rate: float = 1.0 / 120.0
    fixed_severity: float | None = None

    def severity_at(self, elapsed_seconds: float) -> float:
        if self.fault_type == FaultType.NORMAL or elapsed_seconds < self.start_time_seconds:
            return 0.0
        if self.fixed_severity is not None:
            return max(0.0, min(1.0, self.fixed_severity))
        return max(
            0.0,
            min(1.0, (elapsed_seconds - self.start_time_seconds) * self.progression_rate),
        )


@dataclass(frozen=True)
class FaultMetadata:
    fault_type: FaultType
    fault_severity: float
    fault_start_time: str
    fault_active: bool


class FaultModel:
    fault_type = FaultType.NORMAL

    def apply(
        self,
        healthy: TelemetryInput,
        prediction: PhysicsPrediction,
        severity: float,
        elapsed_seconds: float,
        rng: random.Random,
    ) -> TelemetryInput:
        return healthy


def _replace(telemetry: TelemetryInput, **values: float) -> TelemetryInput:
    return telemetry.model_copy(update=values)


class InjectorDegradation(FaultModel):
    fault_type = FaultType.INJECTOR_DEGRADATION

    def apply(self, healthy, prediction, severity, elapsed_seconds, rng):
        harmonic = math.sin(elapsed_seconds * 0.8) * 10.0 * severity
        fuel_factor = 1.0 + 0.25 * severity
        return _replace(
            healthy,
            fuelFlow=healthy.fuelFlow * fuel_factor,
            egt=healthy.egt + (90.0 * severity) + harmonic,
            cht=healthy.cht + (24.0 * severity),
            rpm=max(800.0, healthy.rpm - (80.0 * severity) + harmonic),
        )


class LubricationDegradation(FaultModel):
    fault_type = FaultType.LUBRICATION_DEGRADATION

    def apply(self, healthy, prediction, severity, elapsed_seconds, rng):
        friction_ripple = math.sin(elapsed_seconds * 0.5) * 4.0 * severity
        return _replace(
            healthy,
            oilPressure=max(50.0, healthy.oilPressure * (1.0 - 0.45 * severity)),
            oilTemperature=healthy.oilTemperature + (35.0 * severity),
            cht=healthy.cht + (18.0 * severity),
            egt=healthy.egt + (20.0 * severity),
            rpm=max(800.0, healthy.rpm - (50.0 * severity) + friction_ripple),
            vibration=healthy.vibration + (2.5 * severity),
            fuelFlow=healthy.fuelFlow * (1.0 + 0.08 * severity),
        )


class Misfire(FaultModel):
    fault_type = FaultType.MISFIRE

    def apply(self, healthy, prediction, severity, elapsed_seconds, rng):
        event_probability = min(0.9, 0.05 + (0.75 * severity))
        event = rng.random() < event_probability
        if not event:
            return healthy
        torque_disturbance = 80.0 + (220.0 * severity)
        combustion_disturbance = 20.0 + (100.0 * severity)
        return _replace(
            healthy,
            rpm=max(800.0, healthy.rpm - torque_disturbance),
            egt=max(0.0, healthy.egt - combustion_disturbance),
            cht=max(0.0, healthy.cht - (combustion_disturbance * 0.12)),
            vibration=healthy.vibration + (1.0 + (4.0 * severity)),
            fuelFlow=healthy.fuelFlow * (1.0 + (0.12 * severity)),
        )


class SensorDrift(FaultModel):
    fault_type = FaultType.SENSOR_DRIFT

    def apply(self, healthy, prediction, severity, elapsed_seconds, rng):
        drift_time = max(0.0, elapsed_seconds)
        return _replace(
            healthy,
            cht=healthy.cht + (0.12 * severity * drift_time),
            egt=healthy.egt + (0.20 * severity * drift_time),
            oilPressure=healthy.oilPressure + (0.08 * severity * drift_time),
            rpm=healthy.rpm + (0.35 * severity * drift_time),
        )


FAULT_MODELS: dict[FaultType, FaultModel] = {
    FaultType.NORMAL: FaultModel(),
    FaultType.INJECTOR_DEGRADATION: InjectorDegradation(),
    FaultType.LUBRICATION_DEGRADATION: LubricationDegradation(),
    FaultType.MISFIRE: Misfire(),
    FaultType.SENSOR_DRIFT: SensorDrift(),
}


def metadata_for(schedule: FaultSchedule, severity: float, fault_start_time: str) -> FaultMetadata:
    return FaultMetadata(
        fault_type=schedule.fault_type,
        fault_severity=severity,
        fault_start_time=fault_start_time,
        fault_active=severity > 0.0,
    )
