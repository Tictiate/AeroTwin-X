import pandas as pd

from app.features.feature_engineering import FeatureConfig, build_features
from app.features.feature_schema import feature_names
from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType


def test_feature_schema_is_deterministic_and_numeric():
    records = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=8, run_id=1))
    frame = pd.DataFrame(records)
    config = FeatureConfig(mode="hybrid", temporal_window=5)

    first = build_features(frame, config)
    second = build_features(frame, config)

    assert list(first.columns) == feature_names("hybrid", 5)
    assert first.equals(second)
    assert first.shape[0] == len(records)
    assert first.isna().sum().sum() == 0
    assert all(dtype.kind in "fiu" for dtype in first.dtypes)


def test_temporal_features_do_not_cross_mission_boundaries():
    first = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=3, run_id=1))
    second = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=3, run_id=2))
    frame = pd.DataFrame(first + second)
    features = build_features(frame, FeatureConfig(mode="residual", temporal_window=3))

    second_start = len(first)
    assert features.iloc[second_start]["rpmResidual_rollingMean_3"] == 0.0
