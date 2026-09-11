"""Tests for the read-only Mission History / Replay endpoints.

Verifies the endpoint serves real, already-committed replay artifacts under
data/generated/rul/ -- not fabricated data -- and that missing/empty fields
in the CSV surface as null rather than an invented default.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_list_history_runs_covers_all_five_scenarios():
    response = client.get("/mission/history")
    assert response.status_code == 200
    body = response.json()
    scenarios = {run["scenario"] for run in body}
    assert scenarios == {
        "NORMAL",
        "INJECTOR_DEGRADATION",
        "LUBRICATION_DEGRADATION",
        "MISFIRE",
        "SENSOR_DRIFT",
    }
    for run in body:
        assert run["totalSamples"] == 1500
        assert run["missionId"] is not None
        assert run["engineId"] is not None


def test_get_history_run_returns_downsampled_real_points():
    response = client.get("/mission/history/LUBRICATION_DEGRADATION")
    assert response.status_code == 200
    body = response.json()
    assert body["scenario"] == "LUBRICATION_DEGRADATION"
    assert body["totalSamples"] == 1500
    assert "MSN-LUBRICATION_DEGRADATION" in body["missionId"]
    # Downsampled for display, but still real rows -- never all 1500, never zero.
    assert 0 < len(body["points"]) <= 65
    first_point = body["points"][0]
    assert first_point["health"] == 100.0
    assert first_point["degradation"] == 0.0
    # Early samples have insufficient history for RUL -- must be null, not a fabricated number.
    assert first_point["rulHours"] is None
    assert first_point["rulStatus"] == "INSUFFICIENT_HISTORY"


def test_unknown_scenario_returns_404_not_fabricated_data():
    response = client.get("/mission/history/NOT_A_REAL_SCENARIO")
    assert response.status_code == 404
