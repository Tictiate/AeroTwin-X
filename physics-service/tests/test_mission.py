"""Unit and validation tests for mission simulation and What-If comparison."""

import pytest
from app.degradation.degradation_estimator import DegradationState
from app.mission.mission_model import MissionPhaseSpec, MissionProfile, default_mission_profile
from app.mission.mission_simulator import simulate_mission_trajectory
from app.mission.what_if import WhatIfScenario, evaluate_what_if


def test_mission_profile_ordered_phases():
    profile = default_mission_profile()
    phases = [p.phase for p in profile.phases]
    assert phases == ["TAKEOFF", "CLIMB", "CRUISE", "LOITER", "DESCENT", "LANDING"]
    assert profile.totalDurationSeconds == 120 + 300 + 1800 + 900 + 300 + 180


def test_simulation_determinism():
    profile = default_mission_profile()
    res1 = simulate_mission_trajectory(profile)
    res2 = simulate_mission_trajectory(profile)

    assert res1.missionRiskScore == res2.missionRiskScore
    assert res1.missionReliabilityScore == res2.missionReliabilityScore
    assert res1.projectedEndHealth == res2.projectedEndHealth
    assert res1.minimumProjectedHealth == res2.minimumProjectedHealth
    assert res1.criticalPhase == res2.criticalPhase
    assert len(res1.phaseResults) == len(res2.phaseResults)


def test_healthy_mission_has_low_risk():
    profile = default_mission_profile()
    result = simulate_mission_trajectory(profile)

    assert result.missionRiskScore < 0.20
    assert result.riskBand == "LOW"
    assert result.missionReliabilityScore > 0.80
    assert result.projectedEndHealth >= 90.0
    assert result.operatorRecommendation == "MISSION_GO"
    assert result.estimatedFailureTimeSeconds is None


def test_degraded_mission_elevates_risk():
    profile = default_mission_profile()
    healthy_res = simulate_mission_trajectory(profile)

    degraded_state = DegradationState(
        timestamp="2026-01-01T00:00:00Z",
        engineId="ENG-1",
        overallHealth=75.0,
        overallDegradation=0.25,
        componentDegradation={"thermal": 0.1, "lubrication": 0.40, "combustion": 0.2, "mechanical": 0.2, "electrical": 0.05},
        sensorQualityDegradation=0.0,
        degradationRatePerHour=0.02,
        dominantMechanism="LUBRICATION_DEGRADATION",
        trend="DEGRADING",
        confidence=0.8,
        dataQuality="HIGH",
        historySamples=20,
    )
    degraded_res = simulate_mission_trajectory(profile, initial_degradation=degraded_state)

    assert degraded_res.missionRiskScore > healthy_res.missionRiskScore
    assert degraded_res.missionReliabilityScore < healthy_res.missionReliabilityScore
    assert degraded_res.projectedEndHealth < healthy_res.projectedEndHealth
    assert degraded_res.riskBand in ["GUARDED", "AT_RISK", "HIGH_RISK"]


def test_extended_cruise_increases_risk():
    profile = default_mission_profile()
    baseline = simulate_mission_trajectory(profile)

    scenario = WhatIfScenario(cruiseDurationMultiplier=1.5)
    whatif = evaluate_what_if(profile, scenario)

    assert whatif.scenario.missionRiskScore >= baseline.missionRiskScore
    assert whatif.scenario.projectedEndHealth <= baseline.projectedEndHealth
    assert whatif.delta.risk >= 0.0
    assert whatif.delta.endHealth <= 0.0


def test_higher_load_increases_risk():
    profile = default_mission_profile()
    scenario = WhatIfScenario(loadDelta=0.15)
    whatif = evaluate_what_if(profile, scenario)

    assert whatif.scenario.missionRiskScore >= whatif.baseline.missionRiskScore
    assert whatif.scenario.projectedEndHealth <= whatif.baseline.projectedEndHealth


def test_shorter_mission_preserves_margin():
    profile = default_mission_profile()
    scenario = WhatIfScenario(cruiseDurationMultiplier=0.5)
    whatif = evaluate_what_if(profile, scenario)

    assert whatif.scenario.missionRiskScore <= whatif.baseline.missionRiskScore
    assert whatif.scenario.projectedEndHealth >= whatif.baseline.projectedEndHealth


def test_critical_phase_matches_highest_risk():
    profile = default_mission_profile()
    result = simulate_mission_trajectory(profile)

    highest_risk_phase = max(result.phaseResults, key=lambda p: (p.phaseRiskScore, -p.minimumHealth)).phase
    assert result.criticalPhase == highest_risk_phase


def test_sensor_drift_does_not_cause_catastrophic_physical_degradation():
    profile = default_mission_profile()
    sensor_drift_state = DegradationState(
        timestamp="2026-01-01T00:00:00Z",
        engineId="ENG-1",
        overallHealth=96.0,
        overallDegradation=0.04,
        componentDegradation={"thermal": 0.02, "lubrication": 0.02, "combustion": 0.02, "mechanical": 0.02, "electrical": 0.01},
        sensorQualityDegradation=0.45,
        degradationRatePerHour=0.0,
        dominantMechanism="SENSOR_QUALITY_ISSUE",
        trend="STABLE",
        confidence=0.4,
        dataQuality="MEDIUM",
        historySamples=15,
    )
    result = simulate_mission_trajectory(profile, initial_degradation=sensor_drift_state, fault_type="SENSOR_DRIFT")

    # Engine core physical health should still be high (> 85.0)
    assert result.projectedEndHealth > 85.0
    assert result.sensorObservabilityRisk > 0.30
    assert result.riskBand in ["LOW", "GUARDED"]


def test_score_naming_and_no_fabricated_probabilities():
    profile = default_mission_profile()
    result = simulate_mission_trajectory(profile)

    # Ensure field names are scores, not probabilities
    assert hasattr(result, "missionRiskScore")
    assert hasattr(result, "missionReliabilityScore")
    assert 0.0 <= result.missionRiskScore <= 1.0
    assert 0.0 <= result.missionReliabilityScore <= 1.0
    assert round(result.missionRiskScore + result.missionReliabilityScore, 2) == 1.0
