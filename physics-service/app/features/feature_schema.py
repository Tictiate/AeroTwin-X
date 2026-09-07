"""Stable feature names shared by training and inference."""

RAW_FEATURES = (
    "rpm", "egt", "cht", "oilTemperature", "oilPressure", "fuelFlow",
    "vibration", "batteryVoltage", "altitude", "ambientTemperature", "throttle", "load",
)
PREDICTION_FEATURES = (
    "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature",
    "expectedOilPressure", "expectedFuelFlow", "expectedVibration",
)
RESIDUAL_FEATURES = (
    "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
    "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
)
NORMALIZED_RESIDUAL_FEATURES = (
    "normalizedRpmResidual", "normalizedEgtResidual", "normalizedChtResidual",
    "normalizedOilTemperatureResidual", "normalizedOilPressureResidual",
    "normalizedFuelFlowResidual", "normalizedVibrationResidual",
)
TEMPORAL_BASE_FEATURES = RESIDUAL_FEATURES + ("rpm", "vibration", "egt", "oilPressure", "fuelFlow")
TEMPORAL_STATISTICS = ("rollingMean", "rollingStd", "rollingMaxAbs", "slope")
MISSION_PHASES = ("IDLE", "TAKEOFF", "CLIMB", "CRUISE", "LOITER", "DESCENT", "LANDING")


def temporal_feature_names(window: int) -> list[str]:
    return [
        f"{feature}_{stat}_{window}"
        for feature in TEMPORAL_BASE_FEATURES
        for stat in TEMPORAL_STATISTICS
    ]


def feature_names(mode: str = "hybrid", window: int = 5) -> list[str]:
    if mode not in {"raw", "residual", "hybrid"}:
        raise ValueError("mode must be raw, residual, or hybrid")
    names: list[str] = []
    if mode in {"raw", "hybrid"}:
        names.extend(RAW_FEATURES)
    if mode == "hybrid":
        names.extend(PREDICTION_FEATURES)
    if mode in {"residual", "hybrid"}:
        names.extend(RESIDUAL_FEATURES)
        names.extend(NORMALIZED_RESIDUAL_FEATURES)
    names.extend(temporal_feature_names(window))
    names.extend(f"missionPhase_{phase}" for phase in MISSION_PHASES)
    return names
