"""Reproducible Phase 4 training, evaluation, and artifact generation."""

from collections import defaultdict
from pathlib import Path
import json
import random

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from app.features.feature_engineering import FeatureConfig, build_features, validate_dataset
from app.ml.anomaly_detector import AnomalyDetector
from app.ml.fault_classifier import FaultClassifier


LABELS = ["NORMAL", "INJECTOR_DEGRADATION", "LUBRICATION_DEGRADATION", "MISFIRE", "SENSOR_DRIFT"]


def load_dataset(path: Path) -> pd.DataFrame:
    if path.is_file():
        frame = pd.read_csv(path)
    else:
        files = sorted(path.glob("*.csv"))
        scenario_files = [file for file in files if file.name != "aerotwin_training_dataset.csv"]
        selected = scenario_files or files
        if not selected:
            raise FileNotFoundError(f"No CSV datasets found under {path}")
        frame = pd.concat((pd.read_csv(file) for file in selected), ignore_index=True)
    validate_dataset(frame)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    return frame.sort_values(["missionId", "timestamp"], kind="stable").reset_index(drop=True)


def split_by_mission(frame: pd.DataFrame, seed: int = 42) -> dict[str, pd.DataFrame]:
    rng = random.Random(seed)
    mission_groups: dict[str, list[str]] = defaultdict(list)
    for mission_id, fault_type in frame[["missionId", "faultType"]].drop_duplicates().itertuples(index=False):
        mission_groups[fault_type].append(mission_id)
    assignments: dict[str, str] = {}
    for fault_type, missions in sorted(mission_groups.items()):
        missions = sorted(missions)
        rng.shuffle(missions)
        if len(missions) < 3:
            raise ValueError(f"Need at least 3 independent missions for {fault_type}, found {len(missions)}")
        train_end = max(1, int(len(missions) * 0.6))
        validation_end = max(train_end + 1, int(len(missions) * 0.8))
        validation_end = min(validation_end, len(missions) - 1)
        for mission_id in missions[:train_end]:
            assignments[mission_id] = "train"
        for mission_id in missions[train_end:validation_end]:
            assignments[mission_id] = "validation"
        for mission_id in missions[validation_end:]:
            assignments[mission_id] = "test"
    result = {}
    for split in ("train", "validation", "test"):
        result[split] = frame[frame["missionId"].map(assignments.get) == split].copy()
    return result


def _classification_metrics(actual: list[str], predicted: list[str]) -> dict[str, object]:
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "macroPrecision": float(precision_score(actual, predicted, labels=LABELS, average="macro", zero_division=0)),
        "macroRecall": float(recall_score(actual, predicted, labels=LABELS, average="macro", zero_division=0)),
        "macroF1": float(f1_score(actual, predicted, labels=LABELS, average="macro", zero_division=0)),
        "confusionMatrix": confusion_matrix(actual, predicted, labels=LABELS).tolist(),
        "classificationReport": classification_report(actual, predicted, labels=LABELS, output_dict=True, zero_division=0),
    }


def _anomaly_metrics(frame: pd.DataFrame, detected: np.ndarray, scores: np.ndarray) -> dict[str, object]:
    actual = frame["faultType"].ne("NORMAL").to_numpy()
    healthy = frame["faultType"].eq("NORMAL").to_numpy()
    return {
        "precision": float(precision_score(actual, detected, zero_division=0)),
        "recall": float(recall_score(actual, detected, zero_division=0)),
        "f1": float(f1_score(actual, detected, zero_division=0)),
        "healthyFalsePositiveRate": float(detected[healthy].mean()) if healthy.any() else 0.0,
        "healthyFalseAlarmCount": int(detected[healthy].sum()),
        "sampleCount": int(len(frame)),
        "scoreMean": float(scores.mean()),
        "scoreMax": float(scores.max()),
    }


def _first_sustained_detection(frame: pd.DataFrame, detected: np.ndarray, persistence: int = 3) -> dict[str, float | None]:
    lead_times: dict[str, float | None] = {}
    scored = frame.assign(_detected=detected).sort_values(["missionId", "timestamp"], kind="stable")
    for mission_id, group in scored.groupby("missionId", sort=False):
        if group["faultType"].iloc[0] == "NORMAL":
            continue
        flags = group["_detected"].to_numpy()
        first = None
        for index in range(0, len(flags) - persistence + 1):
            if flags[index:index + persistence].all():
                first = group.iloc[index]["timestamp"]
                break
        if first is None:
            lead_times[mission_id] = None
            continue
        critical = pd.to_datetime(group["faultStartTime"].iloc[0], utc=True) + pd.Timedelta(seconds=120)
        lead_times[mission_id] = max(0.0, float((critical - first).total_seconds()))
    detected_values = [value for value in lead_times.values() if value is not None]
    return {
        "persistenceSamples": persistence,
        "missionsEvaluated": len(lead_times),
        "missionsDetected": len(detected_values),
        "meanLeadTimeSeconds": float(np.mean(detected_values)) if detected_values else None,
        "minLeadTimeSeconds": float(np.min(detected_values)) if detected_values else None,
    }


def _condition_metrics(frame: pd.DataFrame, predicted: list[str], detected: np.ndarray) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, values in {
        "missionPhase": frame["missionPhase"],
        "altitudeBand": pd.cut(frame["altitude"], bins=[-np.inf, 2000, 5000, np.inf], labels=["low", "mid", "high"]),
    }.items():
        result[name] = {}
        for value in values.dropna().unique():
            mask = values == value
            result[name][str(value)] = {
                "samples": int(mask.sum()),
                "anomalyRate": float(detected[mask].mean()),
                "classifierAccuracy": float(accuracy_score(frame.loc[mask, "faultType"], np.asarray(predicted)[mask])),
            }
    return result


def train_and_evaluate(dataset_path: Path, artifact_dir: Path, seed: int = 42) -> dict[str, object]:
    np.random.seed(seed)
    frame = load_dataset(dataset_path)
    splits = split_by_mission(frame, seed)
    config = FeatureConfig(mode="hybrid", temporal_window=5)
    features = build_features(frame, config)
    indexes = {name: split.index for name, split in splits.items()}
    x_train, x_validation, x_test = (features.loc[indexes[name]] for name in ("train", "validation", "test"))
    train_frame, validation_frame, test_frame = (splits[name] for name in ("train", "validation", "test"))

    healthy_train = train_frame[train_frame["faultType"] == "NORMAL"]
    detector = AnomalyDetector.fit(x_train.loc[healthy_train.index].to_numpy(), random_state=seed)
    validation_detected, validation_scores = detector.predict(x_validation.to_numpy())
    test_detected, test_scores = detector.predict(x_test.to_numpy())

    classifier = FaultClassifier.fit(x_train.to_numpy(), train_frame["faultType"].tolist(), random_state=seed)
    test_labels, test_probabilities = classifier.predict(x_test.to_numpy())

    artifact_dir.mkdir(parents=True, exist_ok=True)
    detector.save(str(artifact_dir / "anomaly_detector.joblib"))
    classifier.save(str(artifact_dir / "fault_classifier.joblib"))
    classifier.model.save_model(str(artifact_dir / "fault_classifier.json"))
    (artifact_dir / "feature_schema.json").write_text(json.dumps({"mode": config.mode, "temporalWindow": config.temporal_window, "features": config.names}, indent=2))
    (artifact_dir / "anomaly_config.json").write_text(json.dumps({"threshold": detector.threshold, "thresholdPercentile": 95.0, "modelVersion": detector.model_version}, indent=2))

    ablation: dict[str, object] = {}
    for mode in ("raw", "residual"):
        ablation_config = FeatureConfig(mode=mode, temporal_window=5)
        ablation_features = build_features(frame, ablation_config)
        ablation_classifier = FaultClassifier.fit(
            ablation_features.loc[indexes["train"]].to_numpy(), train_frame["faultType"].tolist(), random_state=seed
        )
        ablation_predictions, _ = ablation_classifier.predict(ablation_features.loc[indexes["test"]].to_numpy())
        ablation[mode] = _classification_metrics(test_frame["faultType"].tolist(), ablation_predictions)

    metrics = {
        "modelVersion": "phase4-v1",
        "dataset": {
            "rows": int(len(frame)),
            "missions": int(frame["missionId"].nunique()),
            "classDistribution": frame["faultType"].value_counts().to_dict(),
            "splitMissions": {name: int(split["missionId"].nunique()) for name, split in splits.items()},
            "splitRows": {name: int(len(split)) for name, split in splits.items()},
        },
        "featureCount": len(config.names),
        "features": config.names,
        "anomaly": {
            "threshold": detector.threshold,
            "thresholdSelection": "95th percentile of healthy train-split anomaly scores",
            "validation": _anomaly_metrics(validation_frame, validation_detected, validation_scores),
            "test": _anomaly_metrics(test_frame, test_detected, test_scores),
            "detectionLeadTime": _first_sustained_detection(test_frame, test_detected),
        },
        "classification": _classification_metrics(test_frame["faultType"].tolist(), test_labels),
        "operatingConditions": _condition_metrics(test_frame, test_labels, test_detected),
        "ablation": ablation,
        "hyperparameters": {
            "isolationForest": {"nEstimators": 160, "randomState": seed, "healthyTrainingOnly": True},
            "xgboost": {"nEstimators": 120, "maxDepth": 3, "learningRate": 0.05, "subsample": 0.85, "colsampleBytree": 0.85, "randomState": seed},
        },
    }
    (artifact_dir / "evaluation_metrics.json").write_text(json.dumps(metrics, indent=2, default=float))
    return metrics


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("data/generated"))
    parser.add_argument("--artifacts", type=Path, default=Path("data/models"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    metrics = train_and_evaluate(args.dataset, args.artifacts, args.seed)
    print(json.dumps({
        "rows": metrics["dataset"]["rows"],
        "missions": metrics["dataset"]["missions"],
        "anomalyF1": metrics["anomaly"]["test"]["f1"],
        "classificationMacroF1": metrics["classification"]["macroF1"],
        "artifacts": str(args.artifacts),
    }, indent=2))


if __name__ == "__main__":
    main()
