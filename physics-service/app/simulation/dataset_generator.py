"""Repeatable CSV dataset generation for healthy and degraded missions."""

from dataclasses import dataclass
from pathlib import Path
import csv
import math
import random

from app.physics.predictions import PhysicsPrediction, TelemetryInput, predict_healthy_state
from app.simulation.fault_models import (
    FAULT_MODELS,
    FaultMetadata,
    FaultSchedule,
    FaultType,
    metadata_for,
)
from app.simulation.mission_generator import (
    default_start_time,
    initial_telemetry,
    next_healthy_telemetry,
    profile_for_seed,
)


TELEMETRY_FIELDS = (
    "timestamp", "engineId", "missionId", "missionPhase", "altitude",
    "ambientTemperature", "throttle", "load", "rpm", "egt", "cht",
    "oilTemperature", "oilPressure", "fuelFlow", "vibration", "batteryVoltage",
)
PREDICTION_FIELDS = (
    "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature",
    "expectedOilPressure", "expectedFuelFlow", "expectedVibration",
)
RESIDUAL_FIELDS = (
    "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
    "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
)
NORMALIZED_RESIDUAL_FIELDS = tuple(f"normalized{field[0].upper()}{field[1:]}" for field in RESIDUAL_FIELDS)
LABEL_FIELDS = ("runId", "faultType", "faultSeverity", "faultStartTime", "faultActive")
DATASET_FIELDS = TELEMETRY_FIELDS + PREDICTION_FIELDS + RESIDUAL_FIELDS + NORMALIZED_RESIDUAL_FIELDS + LABEL_FIELDS


@dataclass(frozen=True)
class DatasetConfig:
    scenario: FaultType = FaultType.NORMAL
    duration_seconds: int = 300
    sample_rate_hz: float = 1.0
    seed: int = 42
    fault_start_seconds: float = 120.0
    progression_rate: float = 1.0 / 120.0
    fixed_severity: float | None = None
    run_id: int = 0

    @property
    def sample_period_seconds(self) -> float:
        if self.sample_rate_hz <= 0.0:
            raise ValueError("sample_rate_hz must be positive")
        return 1.0 / self.sample_rate_hz


def _normalized(residual: float, expected: float) -> float:
    return 0.0 if math.isclose(expected, 0.0, abs_tol=1.0e-9) else residual / expected


def _residual_values(actual: TelemetryInput, expected: PhysicsPrediction) -> dict[str, float]:
    pairs = {
        "rpmResidual": (actual.rpm, expected.expectedRpm),
        "egtResidual": (actual.egt, expected.expectedEgt),
        "chtResidual": (actual.cht, expected.expectedCht),
        "oilTemperatureResidual": (actual.oilTemperature, expected.expectedOilTemperature),
        "oilPressureResidual": (actual.oilPressure, expected.expectedOilPressure),
        "fuelFlowResidual": (actual.fuelFlow, expected.expectedFuelFlow),
        "vibrationResidual": (actual.vibration, expected.expectedVibration),
    }
    values: dict[str, float] = {}
    for name, (observed, predicted) in pairs.items():
        residual = observed - predicted
        values[name] = residual
        values[f"normalized{name[0].upper()}{name[1:]}"] = _normalized(residual, predicted)
    return values


def generate_records(config: DatasetConfig) -> list[dict[str, object]]:
    if config.duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    profile = profile_for_seed(config.seed)
    schedule = FaultSchedule(
        fault_type=config.scenario,
        start_time_seconds=config.fault_start_seconds,
        progression_rate=config.progression_rate,
        fixed_severity=config.fixed_severity,
    )
    fault_model = FAULT_MODELS[config.scenario]
    fault_start_time = (default_start_time().timestamp() + config.fault_start_seconds)
    fault_start_iso = default_start_time().fromtimestamp(fault_start_time, tz=default_start_time().tzinfo).isoformat()
    rng = random.Random(config.seed)
    engine_id = f"ENG-DATASET-{config.run_id:03d}"
    mission_id = f"MSN-{config.scenario.value}-{config.run_id:03d}"
    previous_healthy = initial_telemetry(
        default_start_time(), profile, engine_id=engine_id, mission_id=mission_id
    )
    records: list[dict[str, object]] = []

    total_samples = int(config.duration_seconds * config.sample_rate_hz)
    for sample_index in range(total_samples):
        elapsed = (sample_index + 1) * config.sample_period_seconds
        healthy, expected = next_healthy_telemetry(
            previous_healthy, elapsed, config.sample_period_seconds, profile
        )
        previous_healthy = healthy
        severity = schedule.severity_at(elapsed)
        observed = fault_model.apply(healthy, expected, severity, elapsed, rng)
        metadata = metadata_for(schedule, severity, fault_start_iso)
        record = {
            **observed.model_dump(mode="json"),
            "runId": config.run_id,
            "faultType": metadata.fault_type.value,
            "faultSeverity": metadata.fault_severity,
            "faultStartTime": metadata.fault_start_time,
            "faultActive": metadata.fault_active,
            "expectedRpm": expected.expectedRpm,
            "expectedEgt": expected.expectedEgt,
            "expectedCht": expected.expectedCht,
            "expectedOilTemperature": expected.expectedOilTemperature,
            "expectedOilPressure": expected.expectedOilPressure,
            "expectedFuelFlow": expected.expectedFuelFlow,
            "expectedVibration": expected.expectedVibration,
            **_residual_values(observed, expected),
        }
        records.append(record)
    return records


def write_csv(records: list[dict[str, object]], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=DATASET_FIELDS)
        writer.writeheader()
        writer.writerows(records)
    return path


def scenario_filename(scenario: FaultType) -> str:
    return {
        FaultType.NORMAL: "healthy_missions.csv",
        FaultType.INJECTOR_DEGRADATION: "injector_degradation.csv",
        FaultType.LUBRICATION_DEGRADATION: "lubrication_degradation.csv",
        FaultType.MISFIRE: "misfire.csv",
        FaultType.SENSOR_DRIFT: "sensor_drift.csv",
    }[scenario]