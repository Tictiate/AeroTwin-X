"""Verifies that supplying real sequential history to /ml/analyze's underlying
registry.analyze() measurably changes the computed rolling-window features and
anomaly score, compared to an empty history — i.e. that the fix (Java now sending
real history) actually matters to the existing, unmodified ML algorithm, not just
that the wire format is accepted.

Uses the real trained artifacts under data/models/ (same pattern as
test_explainability.py) and the real offline dataset generator to build a
realistic, ramping fault sequence rather than fabricated numbers.
"""

from pathlib import Path

import pytest

from app.ml.inference import MLAnalyzeRequest, ModelRegistry, PhysicsPrediction, ResidualInput, TelemetryInput
from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType

PREDICTION_FIELDS = (
    "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature",
    "expectedOilPressure", "expectedFuelFlow", "expectedVibration",
)
RESIDUAL_FIELDS = (
    "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
    "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
    "normalizedRpmResidual", "normalizedEgtResidual", "normalizedChtResidual",
    "normalizedOilTemperatureResidual", "normalizedOilPressureResidual",
    "normalizedFuelFlowResidual", "normalizedVibrationResidual",
)
TELEMETRY_FIELDS = (
    "timestamp", "engineId", "missionId", "missionPhase", "altitude", "ambientTemperature",
    "throttle", "load", "rpm", "egt", "cht", "oilTemperature", "oilPressure", "fuelFlow",
    "vibration", "batteryVoltage",
)


@pytest.fixture(scope="module")
def registry():
    reg = ModelRegistry(Path("data/models"))
    reg.load()
    return reg


@pytest.fixture(scope="module")
def injector_sequence():
    """A real, ramping injector-degradation sequence: onset at t=120s, fixed severity
    0.9 thereafter, produced by the same generator used to train the models — not
    hand-crafted numbers."""
    config = DatasetConfig(
        scenario=FaultType.INJECTOR_DEGRADATION,
        duration_seconds=135,
        sample_rate_hz=1.0,
        seed=42,
        fault_start_seconds=120.0,
        fixed_severity=0.9,
    )
    return generate_records(config)


def _flat_row(row: dict) -> dict:
    """Mirrors MLServiceClient.toFlatFeatureRow(): telemetry + prediction + residual
    fields only. Real production history never carries faultType/faultSeverity ground
    truth (that's what's being detected) — only the offline dataset CSV rows do."""
    flat = {field: row[field] for field in TELEMETRY_FIELDS}
    flat.update({field: row[field] for field in PREDICTION_FIELDS})
    flat["expectedBatteryVoltage"] = 14.2
    flat.update({field: row[field] for field in RESIDUAL_FIELDS})
    flat["runId"] = int(row["runId"])
    return flat


def _to_request(row: dict, history_rows: list[dict]) -> MLAnalyzeRequest:
    flat = _flat_row(row)
    return MLAnalyzeRequest(
        telemetry=TelemetryInput(**{field: flat[field] for field in TELEMETRY_FIELDS}),
        prediction=PhysicsPrediction(
            **{field: flat[field] for field in PREDICTION_FIELDS}, expectedBatteryVoltage=14.2
        ),
        residuals=ResidualInput(**{field: flat[field] for field in RESIDUAL_FIELDS}),
        runId=flat["runId"],
        history=[_flat_row(h) for h in history_rows],
    )


def test_real_history_changes_the_anomaly_score_versus_empty_history(registry, injector_sequence):
    # Well past onset (t=120s): the current sample is a genuine fault sample, and its
    # preceding 5 samples are all persistently faulted too — the exact "sustained
    # deviation" pattern the rolling-window features were trained to recognize.
    current = injector_sequence[-1]
    real_history = injector_sequence[-6:-1]

    with_history = registry.analyze(_to_request(current, real_history))
    without_history = registry.analyze(_to_request(current, []))

    # The two requests analyze the exact same "current" sample; only the history
    # differs. If history has no effect, these would be identical (proving the
    # fix does nothing). They must differ to prove real history reaches the model.
    assert with_history.anomalyScore != without_history.anomalyScore, (
        "anomaly score identical with and without real history — "
        "the rolling-window features are not actually responding to history"
    )


def test_rolling_window_features_are_non_degenerate_with_real_history(registry, injector_sequence):
    """With an empty history, rolling std/slope over a single-sample window degenerates
    to 0 for every temporal feature (no variation possible in a window of 1). With 5
    real, changing samples, at least some temporal features must be non-zero."""
    from app.features.feature_engineering import build_live_features

    current = injector_sequence[-1]
    real_history = injector_sequence[-6:-1]
    combined = _flat_row(current)
    history_dicts = [_flat_row(row) for row in real_history]

    with_history = build_live_features(combined, history=history_dicts, config=registry.config)
    without_history = build_live_features(combined, history=[], config=registry.config)

    slope_columns = [c for c in with_history.columns if c.endswith("_slope_5")]
    std_columns = [c for c in with_history.columns if c.endswith("_rollingStd_5")]

    assert (without_history[slope_columns] == 0.0).all().all(), "single-sample window should have zero slope"
    assert (without_history[std_columns] == 0.0).all().all(), "single-sample window should have zero std"
    assert not (with_history[slope_columns] == 0.0).all().all(), "5-sample real history should show non-zero slope somewhere"
