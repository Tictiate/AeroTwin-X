import importlib.util
from pathlib import Path

import pandas as pd

from app.simulation.dataset_generator import DatasetConfig, generate_records
from app.simulation.fault_models import FaultType


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "replay_rul.py"
SPEC = importlib.util.spec_from_file_location("replay_rul", SCRIPT_PATH)
replay_rul = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(replay_rul)


def records(scenario: FaultType, duration: int, mission_id: str) -> list[dict[str, object]]:
    rows = generate_records(DatasetConfig(
        scenario=scenario,
        duration_seconds=duration,
        fixed_severity=1.0,
        fault_start_seconds=0.0,
        seed=42,
    ))
    for row in rows:
        row["missionId"] = mission_id
    return rows


def test_replay_resets_history_between_missions():
    frame = pd.DataFrame(records(FaultType.LUBRICATION_DEGRADATION, 6, "MSN-1")
                         + records(FaultType.NORMAL, 1, "MSN-2"))

    output = replay_rul.replay_rows(frame)

    mission_two = [row for row in output if row["missionId"] == "MSN-2"]
    assert mission_two[0]["rulStatus"] == "INSUFFICIENT_HISTORY"
    assert mission_two[0]["degradation"] == 0.0


def test_single_mission_still_accumulates_history():
    frame = pd.DataFrame(records(FaultType.LUBRICATION_DEGRADATION, 6, "MSN-1"))

    output = replay_rul.replay_rows(frame)

    assert [row["rulStatus"] for row in output[:4]] == [
        "INSUFFICIENT_HISTORY",
        "INSUFFICIENT_HISTORY",
        "INSUFFICIENT_HISTORY",
        "INSUFFICIENT_HISTORY",
    ]
    assert output[4]["rulStatus"] != "INSUFFICIENT_HISTORY"
    assert output[-1]["degradation"] > 0.0


def test_replay_orders_rows_by_timestamp_without_merging_missions():
    first = records(FaultType.NORMAL, 2, "MSN-1")
    second = records(FaultType.NORMAL, 2, "MSN-2")
    frame = pd.DataFrame([first[1], second[1], second[0], first[0]])

    output = replay_rul.replay_rows(frame)

    assert [row["missionId"] for row in output] == ["MSN-1", "MSN-1", "MSN-2", "MSN-2"]
    assert [row["timestamp"] for row in output[:2]] == [first[0]["timestamp"], first[1]["timestamp"]]
    assert [row["timestamp"] for row in output[2:]] == [second[0]["timestamp"], second[1]["timestamp"]]