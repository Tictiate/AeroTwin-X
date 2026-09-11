"""Read-only Mission History / Replay endpoints.

Serves the already-committed, already-generated RUL replay artifacts under
data/generated/rul/ (produced by scripts/replay_rul.py). This route does not
compute anything new -- it reads the existing CSV files on disk and returns
their real columns as JSON, downsampled for display. No telemetry fields are
invented: the replay artifacts only ever contained health/degradation/RUL/
diagnostic trajectory columns, so that is exactly what this endpoint exposes.
"""

import math
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/mission/history", tags=["mission-history"])

RUL_DIR = Path(__file__).resolve().parents[2] / "data" / "generated" / "rul"

# Maps the same fault-type vocabulary used everywhere else in the app (FaultType /
# the live simulator / mission What-If) to the replay CSV that was generated for it.
SCENARIO_FILES: dict[str, str] = {
    "NORMAL": "healthy_missions_rul.csv",
    "INJECTOR_DEGRADATION": "injector_degradation_rul.csv",
    "LUBRICATION_DEGRADATION": "lubrication_degradation_rul.csv",
    "MISFIRE": "misfire_rul.csv",
    "SENSOR_DRIFT": "sensor_drift_rul.csv",
}

MAX_POINTS = 60


class HistoryRunSummary(BaseModel):
    scenario: str
    missionId: str | None
    engineId: str | None
    totalSamples: int


class HistoryPoint(BaseModel):
    timestamp: str
    health: float | None
    degradation: float | None
    degradationRatePerHour: float | None
    dominantMechanism: str | None
    rulHours: float | None
    rulLowerBoundHours: float | None
    rulUpperBoundHours: float | None
    rulConfidence: float | None
    rulStatus: str | None
    diagnosticType: str | None
    affectedSensor: str | None


class HistoryRunDetail(HistoryRunSummary):
    points: list[HistoryPoint]


def _clean(value):
    """NaN/empty CSV cells become null -- never a fabricated default."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


def _load(scenario: str) -> pd.DataFrame:
    filename = SCENARIO_FILES.get(scenario)
    if filename is None:
        raise HTTPException(status_code=404, detail=f"No replay artifact for scenario '{scenario}'")
    path = RUL_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Replay artifact not found on disk: {path.name}")
    return pd.read_csv(path)


def _downsample(frame: pd.DataFrame, max_points: int = MAX_POINTS) -> pd.DataFrame:
    if len(frame) <= max_points:
        return frame
    step = max(1, len(frame) // (max_points - 1))
    indices = list(range(0, len(frame), step))
    if indices[-1] != len(frame) - 1:
        indices.append(len(frame) - 1)
    return frame.iloc[indices]


@router.get("", response_model=list[HistoryRunSummary])
def list_history_runs() -> list[HistoryRunSummary]:
    summaries: list[HistoryRunSummary] = []
    for scenario in SCENARIO_FILES:
        path = RUL_DIR / SCENARIO_FILES[scenario]
        if not path.exists():
            continue
        frame = pd.read_csv(path)
        first = frame.iloc[0] if len(frame) else None
        summaries.append(
            HistoryRunSummary(
                scenario=scenario,
                missionId=_clean(first["missionId"]) if first is not None else None,
                engineId=_clean(first["engineId"]) if first is not None else None,
                totalSamples=len(frame),
            )
        )
    return summaries


@router.get("/{scenario}", response_model=HistoryRunDetail)
def get_history_run(scenario: str) -> HistoryRunDetail:
    frame = _load(scenario)
    sampled = _downsample(frame)
    first = frame.iloc[0] if len(frame) else None
    points = [
        HistoryPoint(
            timestamp=str(row["timestamp"]),
            health=_clean(row.get("health")),
            degradation=_clean(row.get("degradation")),
            degradationRatePerHour=_clean(row.get("degradationRatePerHour")),
            dominantMechanism=_clean(row.get("dominantMechanism")),
            rulHours=_clean(row.get("rulHours")),
            rulLowerBoundHours=_clean(row.get("rulLowerBoundHours")),
            rulUpperBoundHours=_clean(row.get("rulUpperBoundHours")),
            rulConfidence=_clean(row.get("rulConfidence")),
            rulStatus=_clean(row.get("rulStatus")),
            diagnosticType=_clean(row.get("diagnosticType")),
            affectedSensor=_clean(row.get("affectedSensor")),
        )
        for _, row in sampled.iterrows()
    ]
    return HistoryRunDetail(
        scenario=scenario,
        missionId=_clean(first["missionId"]) if first is not None else None,
        engineId=_clean(first["engineId"]) if first is not None else None,
        totalSamples=len(frame),
        points=points,
    )
