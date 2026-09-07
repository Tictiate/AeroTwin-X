"""Isolation Forest anomaly model and score interpretation."""

from dataclasses import dataclass
import math

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest


@dataclass
class AnomalyDetector:
    model: IsolationForest
    threshold: float
    model_version: str = "phase4-v1"

    @classmethod
    def fit(
        cls, healthy_features: np.ndarray, threshold_percentile: float = 95.0,
        random_state: int = 42,
    ) -> "AnomalyDetector":
        model = IsolationForest(
            n_estimators=160,
            max_samples="auto",
            contamination="auto",
            random_state=random_state,
            n_jobs=1,
        )
        model.fit(healthy_features)
        detector = cls(model=model, threshold=0.5)
        healthy_scores = detector.score(healthy_features)
        detector.threshold = float(np.percentile(healthy_scores, threshold_percentile))
        return detector

    def score(self, features: np.ndarray) -> np.ndarray:
        """Return a monotonic 0..1 anomaly score; higher means less healthy-like."""
        decision = self.model.decision_function(features)
        return np.asarray([1.0 / (1.0 + math.exp(5.0 * value)) for value in decision])

    def predict(self, features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        scores = self.score(features)
        return scores >= self.threshold, scores

    def save(self, path: str) -> None:
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: str) -> "AnomalyDetector":
        return joblib.load(path)
