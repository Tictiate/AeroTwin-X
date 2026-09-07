"""Deterministic feature engineering for training and live inference."""

from dataclasses import dataclass
import numpy as np
import pandas as pd

from .feature_schema import (
    MISSION_PHASES,
    PREDICTION_FEATURES,
    RAW_FEATURES,
    RESIDUAL_FEATURES,
    NORMALIZED_RESIDUAL_FEATURES,
    TEMPORAL_BASE_FEATURES,
    feature_names,
)


@dataclass(frozen=True)
class FeatureConfig:
    mode: str = "hybrid"
    temporal_window: int = 5

    @property
    def names(self) -> list[str]:
        return feature_names(self.mode, self.temporal_window)


def validate_dataset(frame: pd.DataFrame) -> None:
    required = {
        "timestamp", "missionId", "faultType", "missionPhase", "runId",
        *RAW_FEATURES, *PREDICTION_FEATURES, *RESIDUAL_FEATURES, *NORMALIZED_RESIDUAL_FEATURES,
    }
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")
    if frame[list(required)].isna().any().any():
        raise ValueError("Dataset contains missing values in required columns")


def _slope(values: pd.Series) -> float:
    numeric = values.to_numpy(dtype=float)
    if len(numeric) < 2:
        return 0.0
    x = np.arange(len(numeric), dtype=float)
    return float(np.polyfit(x, numeric, 1)[0])


def _temporal_features(frame: pd.DataFrame, window: int) -> pd.DataFrame:
    if window < 2:
        raise ValueError("temporal_window must be at least 2")
    ordered = frame.sort_values(["missionId", "timestamp"], kind="stable")
    result = pd.DataFrame(index=frame.index, dtype=float)
    grouped = ordered.groupby("missionId", sort=False)
    for feature in TEMPORAL_BASE_FEATURES:
        series = ordered[feature].astype(float)
        rolling = grouped[feature].rolling(window=window, min_periods=1)
        result.loc[ordered.index, f"{feature}_rollingMean_{window}"] = rolling.mean().to_numpy()
        result.loc[ordered.index, f"{feature}_rollingStd_{window}"] = rolling.std(ddof=0).fillna(0.0).to_numpy()
        result.loc[ordered.index, f"{feature}_rollingMaxAbs_{window}"] = rolling.apply(
            lambda values: float(np.max(np.abs(values))), raw=True
        ).to_numpy()
        slopes = (
            series.groupby(ordered["missionId"], sort=False)
            .rolling(window=window, min_periods=2)
            .apply(_slope, raw=False)
            .fillna(0.0)
        )
        result.loc[ordered.index, f"{feature}_slope_{window}"] = slopes.to_numpy()
    return result.fillna(0.0).reindex(frame.index)


def build_features(frame: pd.DataFrame, config: FeatureConfig = FeatureConfig()) -> pd.DataFrame:
    validate_dataset(frame)
    numeric = pd.DataFrame(index=frame.index, dtype=float)
    if config.mode in {"raw", "hybrid"}:
        numeric[list(RAW_FEATURES)] = frame[list(RAW_FEATURES)].astype(float)
    if config.mode == "hybrid":
        numeric[list(PREDICTION_FEATURES)] = frame[list(PREDICTION_FEATURES)].astype(float)
    if config.mode in {"residual", "hybrid"}:
        residual_columns = list(RESIDUAL_FEATURES + NORMALIZED_RESIDUAL_FEATURES)
        numeric[residual_columns] = frame[residual_columns].astype(float)
    temporal = _temporal_features(frame, config.temporal_window)
    numeric = pd.concat([numeric, temporal], axis=1)
    phase = pd.get_dummies(frame["missionPhase"], prefix="missionPhase", dtype=float)
    for mission_phase in MISSION_PHASES:
        column = f"missionPhase_{mission_phase}"
        if column not in phase:
            phase[column] = 0.0
    numeric = pd.concat([numeric, phase[[f"missionPhase_{phase}" for phase in MISSION_PHASES]]], axis=1)
    return numeric.reindex(columns=config.names, fill_value=0.0).astype(float)


def build_live_features(
    sample: dict[str, object], history: list[dict[str, object]] | None = None,
    config: FeatureConfig = FeatureConfig(),
) -> pd.DataFrame:
    frame = pd.DataFrame([*(history or []), sample])
    if "faultType" not in frame:
        frame["faultType"] = "NORMAL"
    if "runId" not in frame:
        frame["runId"] = 0
    return build_features(frame, config).tail(1).reset_index(drop=True)
