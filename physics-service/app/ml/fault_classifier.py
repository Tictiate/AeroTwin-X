"""XGBoost multiclass fault classifier."""

from dataclasses import dataclass

import joblib
import numpy as np


@dataclass
class FaultClassifier:
    model: object
    classes: list[str]
    model_version: str = "phase4-v1"

    @classmethod
    def fit(cls, features: np.ndarray, labels: list[str], random_state: int = 42) -> "FaultClassifier":
        from xgboost import XGBClassifier

        classes = sorted(set(labels))
        class_to_index = {label: index for index, label in enumerate(classes)}
        encoded = np.asarray([class_to_index[label] for label in labels], dtype=int)
        model = XGBClassifier(
            n_estimators=120,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.0,
            objective="multi:softprob",
            eval_metric="mlogloss",
            num_class=len(classes),
            random_state=random_state,
            n_jobs=1,
        )
        model.fit(features, encoded)
        return cls(model=model, classes=classes)

    def predict(self, features: np.ndarray) -> tuple[list[str], np.ndarray]:
        probabilities = self.model.predict_proba(features)
        indices = np.argmax(probabilities, axis=1)
        labels = [self.classes[index] for index in indices]
        return labels, probabilities

    def save(self, path: str) -> None:
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: str) -> "FaultClassifier":
        return joblib.load(path)
