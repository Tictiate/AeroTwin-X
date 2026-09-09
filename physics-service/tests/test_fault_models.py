from statistics import mean, pstdev

from app.simulation.dataset_generator import DATASET_FIELDS, DatasetConfig, generate_records
from app.simulation.fault_models import FaultType


def active_records(scenario: FaultType, severity: float) -> list[dict[str, object]]:
    return generate_records(DatasetConfig(
        scenario=scenario,
        duration_seconds=80,
        sample_rate_hz=1.0,
        seed=42,
        fault_start_seconds=0.0,
        fixed_severity=severity,
    ))


def test_same_seed_and_configuration_is_reproducible():
    config = DatasetConfig(FaultType.INJECTOR_DEGRADATION, duration_seconds=20, seed=7)

    assert generate_records(config) == generate_records(config)


def test_fault_schedule_has_healthy_period_then_gradual_severity():
    records = generate_records(DatasetConfig(
        FaultType.INJECTOR_DEGRADATION,
        duration_seconds=5,
        seed=7,
        fault_start_seconds=2.0,
        progression_rate=0.25,
    ))

    assert records[0]["faultActive"] is False
    assert records[1]["faultActive"] is False
    assert records[2]["faultSeverity"] == 0.25
    assert records[3]["faultSeverity"] == 0.5
    assert records[4]["faultSeverity"] == 0.75


def test_healthy_scenario_has_normal_labels():
    records = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=10))

    assert all(record["faultType"] == "NORMAL" for record in records)
    assert all(record["faultSeverity"] == 0.0 for record in records)
    assert all(record["faultActive"] is False for record in records)


def test_injector_severity_increases_fuel_and_egt_residuals():
    low = active_records(FaultType.INJECTOR_DEGRADATION, 0.2)
    high = active_records(FaultType.INJECTOR_DEGRADATION, 0.8)

    assert mean(row["fuelFlowResidual"] for row in high) > mean(row["fuelFlowResidual"] for row in low)
    assert mean(row["egtResidual"] for row in high) > mean(row["egtResidual"] for row in low)


def test_lubrication_severity_reduces_pressure_and_increases_temperature_and_vibration():
    low = active_records(FaultType.LUBRICATION_DEGRADATION, 0.2)
    high = active_records(FaultType.LUBRICATION_DEGRADATION, 0.8)

    assert mean(row["oilPressureResidual"] for row in high) < mean(row["oilPressureResidual"] for row in low)
    assert mean(row["oilTemperatureResidual"] for row in high) > mean(row["oilTemperatureResidual"] for row in low)
    assert mean(row["vibrationResidual"] for row in high) > mean(row["vibrationResidual"] for row in low)


def test_misfire_severity_increases_rpm_variability_and_vibration():
    low = active_records(FaultType.MISFIRE, 0.2)
    high = active_records(FaultType.MISFIRE, 0.8)

    assert pstdev([row["rpmResidual"] for row in high]) > pstdev([row["rpmResidual"] for row in low])
    assert mean(row["vibrationResidual"] for row in high) > mean(row["vibrationResidual"] for row in low)


def test_zero_severity_misfire_has_no_injected_events():
    config = DatasetConfig(
        FaultType.MISFIRE,
        duration_seconds=300,
        seed=42,
        fault_start_seconds=120.0,
    )
    records = generate_records(config)
    healthy = generate_records(DatasetConfig(
        FaultType.NORMAL,
        duration_seconds=300,
        seed=42,
        fault_start_seconds=120.0,
    ))
    compared_fields = (
        "timestamp", "altitude", "ambientTemperature", "throttle", "load", "rpm", "egt",
        "cht", "oilTemperature", "oilPressure", "fuelFlow", "vibration", "batteryVoltage",
        "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature", "expectedOilPressure",
        "expectedFuelFlow", "expectedVibration", "rpmResidual", "egtResidual", "chtResidual",
        "oilTemperatureResidual", "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
    )
    assert [tuple(record[field] for field in compared_fields) for record in records[:120]] == [
        tuple(record[field] for field in compared_fields) for record in healthy[:120]
    ]


def test_misfire_activity_increases_with_severity():
    low = active_records(FaultType.MISFIRE, 0.2)
    high = active_records(FaultType.MISFIRE, 0.8)

    low_events = sum(row["vibrationResidual"] != 0.0 for row in low)
    high_events = sum(row["vibrationResidual"] != 0.0 for row in high)

    assert high_events > low_events


def test_sensor_drift_changes_observed_sensors_but_not_healthy_prediction():
    normal = active_records(FaultType.NORMAL, 0.0)
    drift = active_records(FaultType.SENSOR_DRIFT, 0.8)

    assert [row["expectedCht"] for row in normal] == [row["expectedCht"] for row in drift]
    assert [row["expectedEgt"] for row in normal] == [row["expectedEgt"] for row in drift]
    assert drift[-1]["cht"] > drift[0]["cht"]
    assert drift[-1]["egtResidual"] > drift[0]["egtResidual"]
    assert drift[-1]["oilPressureResidual"] > drift[0]["oilPressureResidual"]


def test_records_include_complete_dataset_contract():
    record = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=1))[0]

    assert set(DATASET_FIELDS) == set(record)
    assert record["timestamp"]
    assert record["faultStartTime"]
