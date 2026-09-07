"""Shared model loading and live anomaly/classification inference."""

from pathlib import Path
from typing import Any

import pandas as pd
from pydantic import BaseModel, Field

from app.features.feature_engineering import FeatureConfig, build_live_features
from app.physics.predictions import PhysicsPrediction, TelemetryInput
from app.ml.anomaly_detector import AnomalyDetector
from app.ml.fault_classifier import FaultClassifier


class ResidualInput(BaseModel):
    rpmResidual: float
    egtResidual: float
    chtResidual: float
    oilTemperatureResidual: float
    oilPressureResidual: float
    fuelFlowResidual: float
    vibrationResidual: float
    normalizedRpmResidual: float
    normalizedEgtResidual: float
    normalizedChtResidual: float
    normalizedOilTemperatureResidual: float
    normalizedOilPressureResidual: float
    normalizedFuelFlowResidual: float
    normalizedVibrationResidual: float


class MLAnalyzeRequest(BaseModel):
    telemetry: TelemetryInput
    prediction: PhysicsPrediction
    residuals: ResidualInput
    runId: int = 0
    history: list[dict[str, Any]] = Field(default_factory=list)


class MLAnalyzeResponse(BaseModel):
    anomaly: bool
    anomalyScore: float
    predictedFault: str
    faultProbabilities: dict[str, float]
    modelVersion: str


class ModelNotLoadedError(RuntimeError):
    pass


class ModelRegistry:
    def __init__(self, artifact_dir: Path):
        self.artifact_dir = artifact_dir
        self.detector: AnomalyDetector | None = None
        self.classifier: FaultClassifier | None = None
        self.config: FeatureConfig | None = None

    def load(self) -> None:
        detector_path = self.artifact_dir / "anomaly_detector.joblib"
        classifier_path = self.artifact_dir / "fault_classifier.joblib"
        schema_path = self.artifact_dir / "feature_schema.json"
        if not detector_path.exists() or not classifier_path.exists() or not schema_path.exists():
            raise ModelNotLoadedError(f"ML artifacts are missing under {self.artifact_dir}")
        import json
        schema = json.loads(schema_path.read_text())
        self.config = FeatureConfig(mode=schema["mode"], temporal_window=int(schema["temporalWindow"]))
        self.detector = AnomalyDetector.load(str(detector_path))
        self.classifier = FaultClassifier.load(str(classifier_path))

    def ensure_loaded(self) -> None:
        if self.detector is None or self.classifier is None or self.config is None:
            self.load()

    def analyze(self, request: MLAnalyzeRequest) -> MLAnalyzeResponse:
        self.ensure_loaded()
        assert self.detector is not None and self.classifier is not None and self.config is not None
        telemetry = request.telemetry.model_dump(mode="json")
        combined = {
            **telemetry,
            **request.prediction.model_dump(),
            **request.residuals.model_dump(),
            "runId": request.runId,
        }
        history = request.history
        features = build_live_features(combined, history=history, config=self.config)
        detected, scores = self.detector.predict(features.to_numpy())
        labels, probabilities = self.classifier.predict(features.to_numpy())
        probability_map = {
            label: float(probability)
            for label, probability in zip(self.classifier.classes, probabilities[0])
        }
        is_anomaly = bool(detected[0])
        return MLAnalyzeResponse(
            anomaly=is_anomaly,
            anomalyScore=float(scores[0]),
            predictedFault=labels[0] if is_anomaly else "NORMAL",
            faultProbabilities=probability_map,
            modelVersion="phase4-v1",
        )
