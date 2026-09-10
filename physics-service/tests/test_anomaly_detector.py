"""Regression coverage for the Isolation Forest anomaly gate.

See AEROTWIN_PROJECT_MASTER.md SS15.7 for the investigation these tests protect.
Headline finding: offline, the current model's separability is weak (AUC ~0.59,
near chance) and *statistically indistinguishable across all four fault types*
(sustained post-onset threshold-crossing rate ~4-6% for every fault type,
matching the ~4-6% healthy false-positive rate). The threshold (95th percentile
of healthy scores) is a defensible, near-optimal operating point for that
separability, not a calibration bug -- these tests guard against a future
retrain silently making the healthy false-positive rate worse, or the model
becoming degenerate (AUC below chance), without asserting a specific fault
type is "reliably detected" -- offline evidence does not support that claim
for any single fault type in isolation.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import roc_auc_score

from app.ml.anomaly_detector import AnomalyDetector
from app.features.feature_engineering import FeatureConfig, build_features
from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType


class _FixedScoreModel:
    """Stub replacing IsolationForest.decision_function for boundary tests."""

    def __init__(self, decision_values):
        self._values = np.asarray(decision_values, dtype=float)

    def decision_function(self, features):
        assert len(features) == len(self._values)
        return self._values


def test_predict_threshold_is_inclusive_at_the_boundary():
    detector = AnomalyDetector(model=_FixedScoreModel([0.0]), threshold=0.5)
    detected, scores = detector.predict(np.zeros((1, 3)))
    assert scores[0] == pytest.approx(0.5)
    assert bool(detected[0]) is True


def test_predict_separates_above_and_below_threshold():
    # score = 1 / (1 + exp(5 * decision_value)) is decreasing in decision_value.
    detector = AnomalyDetector(model=_FixedScoreModel([-2.0, 2.0]), threshold=0.5)
    detected, scores = detector.predict(np.zeros((2, 3)))
    assert scores[0] > 0.5 and bool(detected[0]) is True
    assert scores[1] < 0.5 and bool(detected[1]) is False


def test_fit_calibrates_threshold_to_target_healthy_false_positive_rate():
    rng = np.random.RandomState(7)
    healthy = rng.normal(loc=0.0, scale=1.0, size=(400, 12))
    detector = AnomalyDetector.fit(healthy, threshold_percentile=95.0, random_state=42)

    holdout = rng.normal(loc=0.0, scale=1.0, size=(400, 12))
    detected, _ = detector.predict(holdout)
    fpr = detected.mean()

    # Wide band, not an exact-float assertion: holdout sampling noise and the
    # detector's own randomness both move this around the 5% target.
    assert 0.0 <= fpr <= 0.15


def test_far_outlier_scores_higher_than_the_healthy_cluster_it_was_fit_on():
    rng = np.random.RandomState(11)
    healthy = rng.normal(loc=0.0, scale=1.0, size=(300, 10))
    detector = AnomalyDetector.fit(healthy, random_state=42)

    healthy_scores = detector.score(healthy)
    outlier_score = detector.score(np.full((1, 10), 25.0))[0]

    assert outlier_score > healthy_scores.mean() + 3 * healthy_scores.std()
    assert outlier_score >= detector.threshold


def test_save_load_roundtrip_preserves_threshold_and_predictions(tmp_path):
    rng = np.random.RandomState(3)
    healthy = rng.normal(size=(200, 8))
    detector = AnomalyDetector.fit(healthy, random_state=42)

    sample = rng.normal(size=(20, 8))
    detected_before, scores_before = detector.predict(sample)

    path = tmp_path / "detector.joblib"
    detector.save(str(path))
    reloaded = AnomalyDetector.load(str(path))

    detected_after, scores_after = reloaded.predict(sample)
    assert reloaded.threshold == detector.threshold
    np.testing.assert_array_equal(detected_before, detected_after)
    np.testing.assert_allclose(scores_before, scores_after)


@pytest.fixture(scope="module")
def real_detector():
    path = Path("data/models/anomaly_detector.joblib")
    if not path.is_file():
        pytest.skip("no trained anomaly_detector.joblib artifact present")
    return AnomalyDetector.load(str(path))


def _hybrid_features(records):
    frame = pd.DataFrame(records)
    return build_features(frame, FeatureConfig(mode="hybrid", temporal_window=5))


def test_real_artifact_keeps_healthy_false_positive_rate_bounded(real_detector):
    """Regression guard for AEROTWIN_PROJECT_MASTER.md SS15.7: if a future retrain
    drifts the healthy false-positive rate far above the ~5% target, fail loudly
    rather than silently shipping a noisier gate."""
    records = generate_records(DatasetConfig(FaultType.NORMAL, duration_seconds=180, run_id=201))
    features = _hybrid_features(records)
    detected, _ = real_detector.predict(features.to_numpy())

    assert detected.mean() <= 0.20


def test_real_artifact_separability_has_not_regressed_below_chance(real_detector):
    """Regression guard: the model's offline separability is weak (AUC ~0.59) but
    meaningfully above chance (0.5). This does not assert reliable per-fault
    detection (SS15.7 found offline sustained crossing rate is ~4-6% for every
    fault type, indistinguishable from the healthy FPR) -- only that a future
    retrain has not made the model degenerate (AUC <= 0.5, i.e. no better than
    a coin flip, or actively anti-correlated with the true label)."""
    frames = []
    for fault in (
        FaultType.NORMAL,
        FaultType.INJECTOR_DEGRADATION,
        FaultType.LUBRICATION_DEGRADATION,
        FaultType.MISFIRE,
        FaultType.SENSOR_DRIFT,
    ):
        kwargs = {} if fault == FaultType.NORMAL else {"fixed_severity": 0.9}
        records = generate_records(DatasetConfig(
            fault, duration_seconds=200, fault_start_seconds=120.0, run_id=202, **kwargs,
        ))
        frame = pd.DataFrame(records)
        frame["_isFault"] = fault != FaultType.NORMAL
        frames.append(frame)

    combined = pd.concat(frames, ignore_index=True)
    features = build_features(combined, FeatureConfig(mode="hybrid", temporal_window=5))
    scores = real_detector.score(features.to_numpy())
    labels = combined["_isFault"].to_numpy()

    auc = roc_auc_score(labels, scores)
    assert auc >= 0.52
