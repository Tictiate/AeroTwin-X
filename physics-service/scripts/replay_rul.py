#!/usr/bin/env python3
"""Sequentially replay Phase 3 CSVs through health, degradation, and RUL."""

import argparse
import csv
import json
from pathlib import Path
import sys
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.degradation.degradation_estimator import (
    DegradationEvaluateRequest,
    DiagnosticHealthInput,
    estimate_degradation,
    estimate_rul,
)
from app.health.health_calculator import HealthDiagnosticInput, HealthEvaluateRequest, evaluate_health
from app.ml.inference import MLAnalyzeResponse, ResidualInput
from app.physics.predictions import PhysicsPrediction, TelemetryInput


TELEMETRY_FIELDS = (
    "timestamp", "engineId", "missionId", "missionPhase", "altitude", "ambientTemperature",
    "throttle", "load", "rpm", "egt", "cht", "oilTemperature", "oilPressure", "fuelFlow",
    "vibration", "batteryVoltage",
)
PREDICTION_FIELDS = (
    "expectedRpm", "expectedEgt", "expectedCht", "expectedOilTemperature",
    "expectedOilPressure", "expectedFuelFlow", "expectedVibration",
)
RESIDUAL_FIELDS = (
    "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
    "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
    "normalizedRpmResidual", "normalizedEgtResidual", "normalizedChtResidual",
    "normalizedOilTemperatureResidual", "normalizedOilPressureResidual",
    "normalizedFuelFlowResidual", "normalizedVibrationResidual",
)


def diagnostic_input(row: dict[str, object]) -> HealthDiagnosticInput:
    fault_type = str(row["faultType"])
    severity = float(row["faultSeverity"])
    return HealthDiagnosticInput(
        telemetry=TelemetryInput(**{field: row[field] for field in TELEMETRY_FIELDS}),
        prediction=PhysicsPrediction(**{
            **{field: row[field] for field in PREDICTION_FIELDS},
            "expectedBatteryVoltage": 14.2,
        }),
        residuals=ResidualInput(**{field: row[field] for field in RESIDUAL_FIELDS}),
        analysis=MLAnalyzeResponse(
            anomaly=severity > 0.0,
            anomalyScore=min(1.0, severity),
            predictedFault=fault_type if severity > 0.0 else "NORMAL",
            faultProbabilities={fault_type if severity > 0.0 else "NORMAL": 1.0},
            modelVersion="phase4-v1",
        ),
        runId=int(row["runId"]),
    )


@dataclass
class MissionReplayState:
    mission_id: str | None = None
    health_history: list[HealthDiagnosticInput] = field(default_factory=list)
    degradation_history: list[DiagnosticHealthInput] = field(default_factory=list)

    def reset_for(self, mission_id: str) -> None:
        if self.mission_id == mission_id:
            return
        self.mission_id = mission_id
        self.health_history.clear()
        self.degradation_history.clear()

    def process(self, raw: dict[str, object]) -> dict[str, object]:
        self.reset_for(str(raw["missionId"]))
        current = diagnostic_input(raw)
        health = evaluate_health(HealthEvaluateRequest(
            current=current,
            history=self.health_history[-60:],
        ))
        current_with_health = DiagnosticHealthInput(
            telemetry=current.telemetry,
            prediction=current.prediction,
            residuals=current.residuals,
            analysis=current.analysis,
            health=health,
            runId=current.runId,
        )
        self.degradation_history.append(current_with_health)
        degradation = estimate_degradation(self.degradation_history[-60:])
        rul = estimate_rul(self.degradation_history[-60:], degradation)
        self.health_history.append(current)
        return {
            "timestamp": raw["timestamp"],
            "engineId": raw["engineId"],
            "missionId": raw["missionId"],
            "health": health.overallHealth,
            "degradation": degradation.overallDegradation,
            "degradationRatePerHour": degradation.degradationRatePerHour,
            "dominantMechanism": degradation.dominantMechanism,
            "rulHours": rul.rulHours,
            "rulLowerBoundHours": rul.lowerBoundHours,
            "rulUpperBoundHours": rul.upperBoundHours,
            "rulConfidence": rul.confidence,
            "rulStatus": rul.status,
            "diagnosticType": health.diagnosticType,
            "affectedSensor": health.affectedSensor or "",
        }


def replay_rows(frame: pd.DataFrame) -> list[dict[str, object]]:
    ordered = pd.concat(
        [mission.sort_values("timestamp", kind="stable")
         for _, mission in frame.groupby("missionId", sort=False)],
        ignore_index=True,
    )
    state = MissionReplayState()
    return [state.process(raw) for raw in ordered.to_dict(orient="records")]


def replay(path: Path, output_dir: Path) -> dict[str, object]:
    frame = pd.read_csv(path)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame = pd.concat(
        [mission.sort_values("timestamp", kind="stable")
         for _, mission in frame.groupby("missionId", sort=False)],
        ignore_index=True,
    )
    scenario = str(frame["faultType"].iloc[0])
    rows = replay_rows(frame)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{path.stem}_rul.csv"
    with output_path.open("w", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    physical = frame["faultType"].isin(["INJECTOR_DEGRADATION", "LUBRICATION_DEGRADATION", "MISFIRE"])
    eol = pd.to_datetime(frame["faultStartTime"], utc=True) + pd.Timedelta(seconds=120)
    actual_rul = (eol - frame["timestamp"]).dt.total_seconds() / 3600.0
    predicted = pd.to_numeric(pd.DataFrame(rows)["rulHours"], errors="coerce")
    valid = physical & predicted.notna() & (actual_rul >= 0.0)
    errors = predicted[valid].to_numpy() - actual_rul[valid].to_numpy()
    metrics = {
        "scenario": scenario,
        "samples": len(rows),
        "output": str(output_path),
        "physicalGroundTruthSamples": int(valid.sum()),
        "maeHours": float(np.mean(np.abs(errors))) if len(errors) else None,
        "rmseHours": float(np.sqrt(np.mean(errors ** 2))) if len(errors) else None,
        "sensorFaultSamples": int((frame["faultType"] == "SENSOR_DRIFT").sum()),
        "sensorFaultRulStatusCounts": pd.DataFrame(rows).loc[frame["faultType"] == "SENSOR_DRIFT", "rulStatus"].value_counts().to_dict(),
    }
    (output_dir / f"{path.stem}_rul_metrics.json").write_text(json.dumps(metrics, indent=2))
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/generated"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/generated/rul"))
    args = parser.parse_args()
    for path in sorted(args.input_dir.glob("*.csv")):
        if path.name == "aerotwin_training_dataset.csv":
            continue
        print(json.dumps(replay(path, args.output_dir)))


if __name__ == "__main__":
    main()
