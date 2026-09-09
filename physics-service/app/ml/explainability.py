"""Explainability module for XGBoost fault classifier using SHAP TreeExplainer."""

import logging
from typing import Literal
import numpy as np
from pydantic import BaseModel, Field

from app.ml.fault_classifier import FaultClassifier

LOGGER = logging.getLogger(__name__)

DIRECTION_TOWARD = "TOWARD_FAULT"
DIRECTION_AWAY = "AWAY_FROM_FAULT"

FEATURE_NAME_DESCRIPTIONS = {
    # Raw features
    "rpm": "Engine RPM",
    "egt": "Exhaust gas temperature (EGT)",
    "cht": "Cylinder head temperature (CHT)",
    "oilTemperature": "Engine oil temperature",
    "oilPressure": "Engine oil pressure",
    "fuelFlow": "Fuel flow rate",
    "vibration": "Engine vibration amplitude",
    "batteryVoltage": "Electrical system battery voltage",
    "altitude": "Flight altitude",
    "ambientTemperature": "Ambient air temperature",
    "throttle": "Throttle position",
    "load": "Engine aerodynamic/mechanical load",
    # Expected physics
    "expectedRpm": "Physics model expected RPM",
    "expectedEgt": "Physics model expected EGT",
    "expectedCht": "Physics model expected CHT",
    "expectedOilTemperature": "Physics model expected oil temperature",
    "expectedOilPressure": "Physics model expected oil pressure",
    "expectedFuelFlow": "Physics model expected fuel flow",
    "expectedVibration": "Physics model expected vibration",
    # Residuals
    "rpmResidual": "RPM difference from physics expectation",
    "egtResidual": "EGT difference from physics expectation",
    "chtResidual": "CHT difference from physics expectation",
    "oilTemperatureResidual": "Oil temperature difference from physics expectation",
    "oilPressureResidual": "Oil pressure difference from physics expectation",
    "fuelFlowResidual": "Fuel flow difference from physics expectation",
    "vibrationResidual": "Vibration difference from physics expectation",
    # Normalized residuals
    "normalizedRpmResidual": "Normalized RPM residual",
    "normalizedEgtResidual": "Normalized EGT residual",
    "normalizedChtResidual": "Normalized CHT residual",
    "normalizedOilTemperatureResidual": "Normalized oil temperature residual",
    "normalizedOilPressureResidual": "Normalized oil pressure residual",
    "normalizedFuelFlowResidual": "Normalized fuel flow residual",
    "normalizedVibrationResidual": "Normalized vibration residual",
}


def human_feature_description(feature_name: str) -> str:
    """Return a conservative operator-readable description of a feature without causal leaps."""
    if feature_name in FEATURE_NAME_DESCRIPTIONS:
        return FEATURE_NAME_DESCRIPTIONS[feature_name]

    # Handle temporal rolling stats
    for stat, stat_desc in [
        ("_rollingMean_", "rolling mean"),
        ("_rollingStd_", "rolling variability/std"),
        ("_rollingMaxAbs_", "peak deviation"),
        ("_slope_", "rate of change/slope"),
    ]:
        if stat in feature_name:
            parts = feature_name.split(stat)
            base_feature = parts[0]
            base_desc = human_feature_description(base_feature)
            return f"{base_desc} ({stat_desc})"

    # Handle mission phases
    if feature_name.startswith("missionPhase_"):
        phase = feature_name.replace("missionPhase_", "")
        return f"Flight phase: {phase}"

    return feature_name


def generate_operator_summary(predicted_fault: str, top_contributors: list["FeatureContributor"]) -> str:
    """Generate deterministic conservative text summary based on top contributors."""
    if not top_contributors:
        return f"Predicted {predicted_fault} with no prominent feature contributions available."

    top_names = [c.description or human_feature_description(c.feature) for c in top_contributors[:3]]
    toward_contributors = [c for c in top_contributors if c.direction == DIRECTION_TOWARD]

    if predicted_fault == "NORMAL":
        return "Operating within expected parameters. Residuals and operating signals are consistent with normal behavior."

    if predicted_fault == "SENSOR_DRIFT":
        if toward_contributors:
            evidence = ", ".join(
                [c.description or human_feature_description(c.feature) for c in toward_contributors[:3]]
            )
            return (
                f"Likely sensor fault. Inconsistency detected between observed sensor readings and physics/cross-sensor expectations, "
                f"primarily driven by {evidence}."
            )
        return "Likely sensor fault. Discrepancy observed between telemetry and cross-sensor expectations."

    # Physical faults (INJECTOR_DEGRADATION, LUBRICATION_DEGRADATION, MISFIRE, etc.)
    fault_readable = predicted_fault.replace("_", " ").lower()
    if toward_contributors:
        evidence = ", ".join(
            [c.description or human_feature_description(c.feature) for c in toward_contributors[:3]]
        )
        return f"Likely {fault_readable}. The strongest contributing evidence relative to the physics twin includes {evidence}."

    evidence = ", ".join(top_names)
    return f"Likely {fault_readable}. Diagnostic attribution primarily involves {evidence}."


class FeatureContributor(BaseModel):
    feature: str
    value: float
    shapValue: float
    direction: Literal["TOWARD_FAULT", "AWAY_FROM_FAULT"]
    description: str


class DiagnosticExplanation(BaseModel):
    predictedFault: str
    classifierConfidence: float
    explanationAvailable: bool
    topContributors: list[FeatureContributor] = Field(default_factory=list)
    operatorSummary: str = ""


class ShapExplainer:
    """SHAP explanation wrapper for the XGBoost multiclass FaultClassifier."""

    def __init__(self, classifier: FaultClassifier, feature_names: list[str]):
        import shap

        self.classifier = classifier
        self.feature_names = list(feature_names)
        self.explainer = shap.TreeExplainer(self.classifier.model)
        self.classes = list(self.classifier.classes)

    def explain(
        self,
        features: np.ndarray,
        predicted_class: str,
        confidence: float,
        top_k: int = 5,
    ) -> DiagnosticExplanation:
        """Construct SHAP explanation for the exact feature vector provided."""
        try:
            if predicted_class not in self.classes:
                LOGGER.warning("Predicted class %s not in classifier classes %s", predicted_class, self.classes)
                return DiagnosticExplanation(
                    predictedFault=predicted_class,
                    classifierConfidence=float(confidence),
                    explanationAvailable=False,
                    topContributors=[],
                    operatorSummary="Explanation unavailable: unknown predicted class.",
                )

            # features shape: (1, num_features) or (num_features,)
            feat_array = np.asarray(features, dtype=float)
            if feat_array.ndim == 1:
                feat_array = feat_array.reshape(1, -1)

            # Compute SHAP values
            shap_values = self.explainer.shap_values(feat_array)

            # Determine multiclass indexing
            class_idx = self.classes.index(predicted_class)

            if isinstance(shap_values, list):
                # Legacy SHAP returns list of arrays, one per class: [ (N, num_feat), ... ]
                class_shap = shap_values[class_idx][0]
            elif isinstance(shap_values, np.ndarray):
                # Modern SHAP array shape: (N, num_feat, num_classes)
                if shap_values.ndim == 3:
                    class_shap = shap_values[0, :, class_idx]
                elif shap_values.ndim == 2:
                    # Binary classification
                    class_shap = shap_values[0]
                else:
                    raise ValueError(f"Unexpected SHAP array dimensions: {shap_values.shape}")
            else:
                raise TypeError(f"Unexpected SHAP values type: {type(shap_values)}")

            # Rank features by absolute SHAP value descending
            abs_shap = np.abs(class_shap)
            ranked_indices = np.argsort(-abs_shap)[:top_k]

            contributors: list[FeatureContributor] = []
            for idx in ranked_indices:
                feat_name = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
                feat_val = float(feat_array[0, idx])
                sv = float(class_shap[idx])
                direction: Literal["TOWARD_FAULT", "AWAY_FROM_FAULT"] = (
                    DIRECTION_TOWARD if sv >= 0.0 else DIRECTION_AWAY
                )
                contributors.append(
                    FeatureContributor(
                        feature=feat_name,
                        value=round(feat_val, 4),
                        shapValue=round(sv, 4),
                        direction=direction,
                        description=human_feature_description(feat_name),
                    )
                )

            summary = generate_operator_summary(predicted_class, contributors)

            return DiagnosticExplanation(
                predictedFault=predicted_class,
                classifierConfidence=round(float(confidence), 4),
                explanationAvailable=True,
                topContributors=contributors,
                operatorSummary=summary,
            )

        except Exception as err:
            LOGGER.exception("Failed to generate SHAP explanation: %s", err)
            return DiagnosticExplanation(
                predictedFault=predicted_class,
                classifierConfidence=round(float(confidence), 4),
                explanationAvailable=False,
                topContributors=[],
                operatorSummary="Explanation could not be generated.",
            )
