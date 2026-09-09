"""Transparent and deterministic mission risk scoring and operator recommendations."""

from dataclasses import dataclass
from typing import Literal

RiskBand = Literal["LOW", "GUARDED", "AT_RISK", "HIGH_RISK"]
Recommendation = Literal["MISSION_GO", "MISSION_CAUTION", "MISSION_AT_RISK", "MISSION_HIGH_RISK"]

# Prototype engineering weights for decision-support risk scoring
W_HEALTH = 0.30
W_DEGRADATION = 0.25
W_RUL = 0.20
W_SUBSYSTEM = 0.15
W_STRESS = 0.10

EOL_HEALTH_THRESHOLD = 50.0


def determine_risk_band(score: float) -> RiskBand:
    """Classify risk score into prototype mission-risk bands."""
    if score < 0.20:
        return "LOW"
    if score < 0.40:
        return "GUARDED"
    if score < 0.70:
        return "AT_RISK"
    return "HIGH_RISK"


def compute_mission_risk(
    minimum_projected_health: float,
    projected_end_health: float,
    max_component_degradation: float,
    worst_subsystem_name: str,
    worst_subsystem_degradation: float,
    integrated_stress_score: float,
    mission_duration_seconds: float,
    initial_rul_hours: float | None = None,
) -> tuple[float, float, RiskBand, Recommendation, str]:
    """
    Compute transparent deterministic mission risk and reliability scores.

    Returns:
        mission_risk_score (0.0 to 1.0)
        mission_reliability_score (1.0 - mission_risk_score)
        risk_band (LOW, GUARDED, AT_RISK, HIGH_RISK)
        operator_recommendation
        rationale
    """
    # 1. Health Margin Risk: 0 at health == 100; 1.0 at health <= EOL_HEALTH_THRESHOLD (50.0)
    health_val = min(minimum_projected_health, projected_end_health)
    if health_val >= 100.0:
        health_risk = 0.0
    elif health_val <= EOL_HEALTH_THRESHOLD:
        health_risk = 1.0
    else:
        health_risk = (100.0 - health_val) / (100.0 - EOL_HEALTH_THRESHOLD)

    # 2. Overall Component Degradation Risk: smooth monotonic response from 0.0 to 0.50
    degradation_risk = min(1.0, max_component_degradation / 0.50)

    # 3. RUL Risk: ratio of mission duration to remaining useful life
    if initial_rul_hours is not None and initial_rul_hours > 0:
        mission_hours = mission_duration_seconds / 3600.0
        rul_risk = min(1.0, mission_hours / initial_rul_hours)
    else:
        # If no explicit RUL, duration-adjusted degradation wear proxy
        mission_hours = mission_duration_seconds / 3600.0
        rul_risk = min(1.0, degradation_risk * 0.5 + (mission_hours / 24.0) * 0.2)

    # 4. Worst Subsystem Risk: individual subsystem degradation
    worst_subsystem_risk = min(1.0, worst_subsystem_degradation / 0.60)

    # 5. Mission Stress Risk: bounded 0 to 1
    stress_risk = max(0.0, min(1.0, integrated_stress_score))

    # Weighted combination
    composite_risk = (
        W_HEALTH * health_risk
        + W_DEGRADATION * degradation_risk
        + W_RUL * rul_risk
        + W_SUBSYSTEM * worst_subsystem_risk
        + W_STRESS * stress_risk
    )

    # If physical health drops below EOL threshold at any point, force HIGH_RISK
    if minimum_projected_health <= EOL_HEALTH_THRESHOLD:
        composite_risk = max(composite_risk, 0.75)

    composite_risk = round(max(0.0, min(1.0, composite_risk)), 4)
    reliability_score = round(max(0.0, min(1.0, 1.0 - composite_risk)), 4)
    band = determine_risk_band(composite_risk)

    # Operator recommendation & rationale
    if band == "LOW":
        recommendation: Recommendation = "MISSION_GO"
        rationale = "Mission profile operates well within prototype health and degradation margins."
    elif band == "GUARDED":
        recommendation = "MISSION_CAUTION"
        rationale = (
            f"Mission is projected to complete safely, but margins are tightened primarily in the {worst_subsystem_name} "
            f"subsystem. Continue monitoring."
        )
    elif band == "AT_RISK":
        recommendation = "MISSION_AT_RISK"
        rationale = (
            f"Projected degradation materially reduces mission margin. Elevated stress on {worst_subsystem_name}. "
            f"Consider evaluating a shorter mission profile or reducing engine load."
        )
    else:
        recommendation = "MISSION_HIGH_RISK"
        rationale = (
            f"Critical risk threshold reached. Engine health projected to breach minimum margins ({minimum_projected_health:.1f}) "
            f"or excessive degradation in {worst_subsystem_name}. Mission modification strongly advised."
        )

    return composite_risk, reliability_score, band, recommendation, rationale
