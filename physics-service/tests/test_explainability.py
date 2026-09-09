"""Tests for SHAP explainability layer."""

from pathlib import Path
import json
import numpy as np
import pytest

from app.ml.fault_classifier import FaultClassifier
from app.ml.explainability import (
    ShapExplainer,
    human_feature_description,
    generate_operator_summary,
    DIRECTION_TOWARD,
    DIRECTION_AWAY,
)
from app.ml.inference import ModelRegistry, MLAnalyzeRequest, TelemetryInput, ResidualInput
from app.physics.predictions import PhysicsPrediction
from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType
from app.features.feature_engineering import FeatureConfig, build_features


@pytest.fixture(scope="module")
def feature_schema():
    schema_path = Path("data/models/feature_schema.json")
    with open(schema_path) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def classifier():
    return FaultClassifier.load("data/models/fault_classifier.joblib")


@pytest.fixture(scope="module")
def explainer(classifier, feature_schema):
    return ShapExplainer(classifier, feature_schema["features"])


@pytest.fixture(scope="module")
def registry():
    reg = ModelRegistry(Path("data/models"))
    reg.load()
    return reg


def test_feature_alignment(explainer, feature_schema):
    """Verify every explained feature exists in feature_schema.json and corresponds to exact classifier feature vector."""
    dummy_input = np.random.randn(1, len(feature_schema["features"]))
    explanation = explainer.explain(dummy_input, "INJECTOR_DEGRADATION", 0.95, top_k=5)

    assert explanation.explanationAvailable is True
    assert len(explanation.topContributors) == 5
    schema_set = set(feature_schema["features"])
    for contributor in explanation.topContributors:
        assert contributor.feature in schema_set
        assert contributor.description is not None and len(contributor.description) > 0


def test_shap_ordering_and_direction(explainer, feature_schema):
    """Verify contributors are sorted by abs(shapValue) descending, and direction corresponds to sign."""
    dummy_input = np.random.randn(1, len(feature_schema["features"]))
    explanation = explainer.explain(dummy_input, "LUBRICATION_DEGRADATION", 0.88, top_k=5)

    assert explanation.explanationAvailable is True
    contributors = explanation.topContributors
    assert len(contributors) <= 5

    # Check sorted descending by abs(shapValue)
    abs_values = [abs(c.shapValue) for c in contributors]
    assert abs_values == sorted(abs_values, reverse=True)

    # Check direction mapping
    for c in contributors:
        if c.shapValue >= 0:
            assert c.direction == DIRECTION_TOWARD
        else:
            assert c.direction == DIRECTION_AWAY


def test_determinism(explainer, feature_schema):
    """Same input + same model must produce the same explanation ordering/values."""
    rng = np.random.RandomState(42)
    sample = rng.randn(1, len(feature_schema["features"]))

    exp1 = explainer.explain(sample, "MISFIRE", 0.92, top_k=5)
    exp2 = explainer.explain(sample, "MISFIRE", 0.92, top_k=5)

    assert exp1.explanationAvailable is True
    assert exp2.explanationAvailable is True
    assert len(exp1.topContributors) == len(exp2.topContributors)
    for c1, c2 in zip(exp1.topContributors, exp2.topContributors):
        assert c1.feature == c2.feature
        assert pytest.approx(c1.shapValue, abs=1e-5) == c2.shapValue
        assert pytest.approx(c1.value, abs=1e-5) == c2.value
        assert c1.direction == c2.direction
        assert c1.description == c2.description


def test_safe_failure_handling(explainer):
    """If SHAP cannot be produced or unknown class passed, safely return explanationAvailable = False without crashing."""
    dummy_input = np.random.randn(1, 88)
    # Unknown fault class
    exp = explainer.explain(dummy_input, "NON_EXISTENT_FAULT", 0.5)
    assert exp.explanationAvailable is False
    assert exp.topContributors == []

    # Invalid feature dimensions
    exp_dim = explainer.explain(np.random.randn(1, 10), "INJECTOR_DEGRADATION", 0.5)
    assert exp_dim.explanationAvailable is False
    assert exp_dim.topContributors == []


def test_normal_anomaly_gating(registry):
    """When anomaly == False, predictedFault is NORMAL and explanation is omitted (null)."""
    # A perfectly healthy sample that will not trigger anomaly detection
    telemetry = {
        "timestamp": "2026-01-01T00:00:00Z",
        "engineId": "ENG-1",
        "missionId": "MSN-1",
        "missionPhase": "CRUISE",
        "altitude": 3000.0,
        "ambientTemperature": 10.0,
        "throttle": 0.6,
        "load": 0.4,
        "rpm": 3500.0,
        "egt": 500.0,
        "cht": 120.0,
        "oilTemperature": 80.0,
        "oilPressure": 300.0,
        "fuelFlow": 10.0,
        "vibration": 4.0,
        "batteryVoltage": 14.2,
    }
    prediction = {
        "expectedRpm": 3500.0,
        "expectedEgt": 500.0,
        "expectedCht": 120.0,
        "expectedOilTemperature": 80.0,
        "expectedOilPressure": 300.0,
        "expectedFuelFlow": 10.0,
        "expectedVibration": 4.0,
        "expectedBatteryVoltage": 14.2,
    }
    residuals = {
        "rpmResidual": 0.0,
        "egtResidual": 0.0,
        "chtResidual": 0.0,
        "oilTemperatureResidual": 0.0,
        "oilPressureResidual": 0.0,
        "fuelFlowResidual": 0.0,
        "vibrationResidual": 0.0,
        "normalizedRpmResidual": 0.0,
        "normalizedEgtResidual": 0.0,
        "normalizedChtResidual": 0.0,
        "normalizedOilTemperatureResidual": 0.0,
        "normalizedOilPressureResidual": 0.0,
        "normalizedFuelFlowResidual": 0.0,
        "normalizedVibrationResidual": 0.0,
    }
    req = MLAnalyzeRequest(
        telemetry=TelemetryInput(**telemetry),
        prediction=PhysicsPrediction(**prediction),
        residuals=ResidualInput(**residuals),
        runId=0,
        history=[],
    )
    resp = registry.analyze(req)
    assert resp.anomaly is False
    assert resp.predictedFault == "NORMAL"
    assert resp.explanation is None


def test_operator_summary_distinguishes_fault_types():
    """Verify conservative operator summary distinguishes physical faults, sensor faults, and normal behavior."""
    from app.ml.explainability import FeatureContributor

    contrib_sensor = [
        FeatureContributor(
            feature="rpmResidual",
            value=105.0,
            shapValue=2.5,
            direction="TOWARD_FAULT",
            description="RPM difference from physics expectation",
        )
    ]
    summary_sensor = generate_operator_summary("SENSOR_DRIFT", contrib_sensor)
    assert "Likely sensor fault" in summary_sensor
    assert "Inconsistency detected between observed sensor readings" in summary_sensor

    contrib_phys = [
        FeatureContributor(
            feature="oilPressureResidual",
            value=-150.0,
            shapValue=1.8,
            direction="TOWARD_FAULT",
            description="Oil pressure difference from physics expectation",
        )
    ]
    summary_phys = generate_operator_summary("LUBRICATION_DEGRADATION", contrib_phys)
    assert "Likely lubrication degradation" in summary_phys
    assert "strongest contributing evidence relative to the physics twin" in summary_phys
