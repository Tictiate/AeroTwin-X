"""Deterministic mission trajectory simulator reusing the existing physics twin and degradation models."""

from datetime import datetime, timezone
import math
from pydantic import BaseModel, Field

from app.degradation.degradation_estimator import DegradationState
from app.physics.predictions import TelemetryInput, predict_healthy_state
from .mission_model import MissionPhaseSpec, MissionProfile
from .mission_risk import (
    RiskBand,
    Recommendation,
    compute_mission_risk,
    determine_risk_band,
    EOL_HEALTH_THRESHOLD,
)

BASE_DEGRADATION_RATE_PER_HOUR = 0.005  # baseline nominal wear under normal cruise


class MissionPhaseResult(BaseModel):
    phase: str
    durationSeconds: float
    startHealth: float
    endHealth: float
    minimumHealth: float
    degradationIncrease: float
    phaseRiskScore: float
    riskBand: RiskBand


class MissionSimulationResult(BaseModel):
    missionId: str
    totalDurationSeconds: float
    missionRiskScore: float
    missionReliabilityScore: float
    riskBand: RiskBand
    operatorRecommendation: Recommendation
    operatorRationale: str
    projectedEndHealth: float
    minimumProjectedHealth: float
    criticalPhase: str
    estimatedFailureTimeSeconds: float | None = None
    phaseResults: list[MissionPhaseResult] = Field(default_factory=list)
    finalComponentDegradation: dict[str, float] = Field(default_factory=dict)
    sensorObservabilityRisk: float = 0.0


def simulate_mission_trajectory(
    profile: MissionProfile,
    initial_degradation: DegradationState | None = None,
    initial_rul_hours: float | None = None,
    fault_type: str | None = None,
    step_seconds: float = 30.0,
) -> MissionSimulationResult:
    """
    Simulate future engine state across ordered mission phases using existing physics equations.
    """
    # Initialize component degradation from initial_degradation if provided, else baseline
    if initial_degradation and initial_degradation.componentDegradation:
        comp_deg = dict(initial_degradation.componentDegradation)
        sensor_deg = float(initial_degradation.sensorQualityDegradation)
    else:
        comp_deg = {
            "thermal": 0.0,
            "lubrication": 0.0,
            "combustion": 0.0,
            "mechanical": 0.0,
            "electrical": 0.0,
        }
        sensor_deg = 0.0

    # If a specific physical fault type is already established, assign appropriate sensitivity
    fault_multiplier = 1.0
    if fault_type == "INJECTOR_DEGRADATION":
        comp_deg["combustion"] = max(comp_deg["combustion"], 0.25)
        fault_multiplier = 2.5
    elif fault_type == "LUBRICATION_DEGRADATION":
        comp_deg["lubrication"] = max(comp_deg["lubrication"], 0.30)
        fault_multiplier = 3.0
    elif fault_type == "MISFIRE":
        comp_deg["mechanical"] = max(comp_deg["mechanical"], 0.25)
        comp_deg["combustion"] = max(comp_deg["combustion"], 0.20)
        fault_multiplier = 2.0
    elif fault_type == "SENSOR_DRIFT":
        # Sensor drift causes sensor observability degradation, NOT physical damage to engine
        sensor_deg = max(sensor_deg, 0.40)

    start_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    current_time_sec = 0.0

    # Health weights matching Phase 5 & 6
    component_weights = {
        "thermal": 0.25,
        "lubrication": 0.25,
        "combustion": 0.25,
        "mechanical": 0.15,
        "electrical": 0.10,
    }

    def current_overall_health() -> float:
        phys_deg = sum(comp_deg[c] * component_weights.get(c, 0.2) for c in comp_deg)
        return round(max(0.0, min(100.0, 100.0 - (phys_deg * 100.0))), 2)

    global_min_health = current_overall_health()
    phase_results: list[MissionPhaseResult] = []
    failure_time_sec: float | None = None
    accumulated_stress = 0.0

    for phase_spec in profile.phases:
        phase_start_health = current_overall_health()
        phase_min_health = phase_start_health
        phase_duration = phase_spec.durationSeconds
        phase_elapsed = 0.0

        # Run through phase in step increments
        while phase_elapsed < phase_duration:
            dt = min(step_seconds, phase_duration - phase_elapsed)
            current_time_sec += dt
            phase_elapsed += dt

            # Fraction along phase
            frac = phase_elapsed / phase_duration
            alt = phase_spec.altitudeStart + frac * (phase_spec.altitudeEnd - phase_spec.altitudeStart)
            throt = phase_spec.throttle
            ld = phase_spec.load

            # Reuse existing physics twin for expected engine variables
            telemetry_dummy = TelemetryInput(
                timestamp=start_time,
                engineId="ENG-SIM",
                missionId=profile.missionId,
                missionPhase=phase_spec.phase,
                altitude=alt,
                ambientTemperature=phase_spec.ambientTemperature,
                throttle=throt,
                load=ld,
                rpm=1000.0,
                egt=500.0,
                cht=120.0,
                oilTemperature=80.0,
                oilPressure=300.0,
                fuelFlow=10.0,
                vibration=4.0,
                batteryVoltage=14.2,
            )
            phys_pred = predict_healthy_state(telemetry_dummy)

            # Calculate operating stress factor relative to nominal cruise (throttle 0.6, load 0.5)
            load_stress = (ld / 0.5) ** 1.5
            rpm_stress = (phys_pred.expectedRpm / 3500.0) ** 1.2
            thermal_stress = max(0.8, (phys_pred.expectedCht / 150.0))

            # Cumulative stress increment
            stress_intensity = (load_stress * 0.4 + rpm_stress * 0.3 + thermal_stress * 0.3)
            accumulated_stress += (stress_intensity * (dt / 3600.0))

            # Rate of degradation per hour for this step
            hourly_rate = BASE_DEGRADATION_RATE_PER_HOUR * stress_intensity * fault_multiplier
            deg_increment = hourly_rate * (dt / 3600.0)

            # Component-specific stress allocation
            comp_deg["thermal"] = min(1.0, comp_deg["thermal"] + deg_increment * thermal_stress)
            comp_deg["lubrication"] = min(1.0, comp_deg["lubrication"] + deg_increment * (load_stress * 1.2))
            comp_deg["combustion"] = min(1.0, comp_deg["combustion"] + deg_increment * (throt / 0.6))
            comp_deg["mechanical"] = min(1.0, comp_deg["mechanical"] + deg_increment * rpm_stress)
            comp_deg["electrical"] = min(1.0, comp_deg["electrical"] + deg_increment * 0.2)

            step_health = current_overall_health()
            if step_health < phase_min_health:
                phase_min_health = step_health
            if step_health < global_min_health:
                global_min_health = step_health

            if failure_time_sec is None and step_health <= EOL_HEALTH_THRESHOLD:
                failure_time_sec = current_time_sec

        phase_end_health = current_overall_health()
        phase_deg_inc = round(phase_start_health - phase_end_health, 2)

        # Risk score for this phase
        phase_stress_norm = min(1.0, (phase_spec.load * 0.5 + phase_spec.throttle * 0.5))
        phase_health_loss_risk = max(0.0, (100.0 - phase_min_health) / 50.0)
        phase_risk = round(min(1.0, 0.6 * phase_health_loss_risk + 0.4 * phase_stress_norm), 4)

        phase_results.append(
            MissionPhaseResult(
                phase=phase_spec.phase,
                durationSeconds=phase_duration,
                startHealth=round(phase_start_health, 2),
                endHealth=round(phase_end_health, 2),
                minimumHealth=round(phase_min_health, 2),
                degradationIncrease=max(0.0, phase_deg_inc),
                phaseRiskScore=phase_risk,
                riskBand=determine_risk_band(phase_risk),
            )
        )

    projected_end_health = current_overall_health()
    max_comp_deg = max(comp_deg.values()) if comp_deg else 0.0
    worst_subsystem = max(comp_deg, key=comp_deg.get) if comp_deg else "mechanical"
    worst_subsystem_deg = comp_deg.get(worst_subsystem, 0.0)

    # Normalize integrated stress over mission
    norm_stress = min(1.0, accumulated_stress / max(1.0, profile.totalDurationSeconds / 3600.0))

    # Evaluate global mission risk
    risk_score, rel_score, band, rec, rationale = compute_mission_risk(
        minimum_projected_health=global_min_health,
        projected_end_health=projected_end_health,
        max_component_degradation=max_comp_deg,
        worst_subsystem_name=worst_subsystem,
        worst_subsystem_degradation=worst_subsystem_deg,
        integrated_stress_score=norm_stress,
        mission_duration_seconds=profile.totalDurationSeconds,
        initial_rul_hours=initial_rul_hours,
    )

    # Identify critical phase: highest phaseRiskScore, breaking ties with lowest minimumHealth
    critical_p = max(phase_results, key=lambda p: (p.phaseRiskScore, -p.minimumHealth)).phase if phase_results else "CRUISE"

    return MissionSimulationResult(
        missionId=profile.missionId,
        totalDurationSeconds=profile.totalDurationSeconds,
        missionRiskScore=risk_score,
        missionReliabilityScore=rel_score,
        riskBand=band,
        operatorRecommendation=rec,
        operatorRationale=rationale,
        projectedEndHealth=round(projected_end_health, 2),
        minimumProjectedHealth=round(global_min_health, 2),
        criticalPhase=critical_p,
        estimatedFailureTimeSeconds=round(failure_time_sec, 1) if failure_time_sec else None,
        phaseResults=phase_results,
        finalComponentDegradation={k: round(v, 4) for k, v in comp_deg.items()},
        sensorObservabilityRisk=round(sensor_deg, 4),
    )
