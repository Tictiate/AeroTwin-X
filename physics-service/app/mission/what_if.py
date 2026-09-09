"""Immutable scenario comparison engine for What-If mission trade studies."""

from pydantic import BaseModel, Field

from app.degradation.degradation_estimator import DegradationState
from .mission_model import MissionPhaseSpec, MissionProfile
from .mission_simulator import MissionSimulationResult, simulate_mission_trajectory


class WhatIfScenario(BaseModel):
    cruiseDurationMultiplier: float = Field(default=1.0, ge=0.1, le=5.0)
    loadDelta: float = Field(default=0.0, ge=-0.5, le=0.5)
    throttleDelta: float = Field(default=0.0, ge=-0.5, le=0.5)
    selectedPhases: list[str] = Field(default_factory=lambda: ["CRUISE", "LOITER"])
    initialDegradationOverride: DegradationState | None = None
    faultTypeOverride: str | None = None


class WhatIfDelta(BaseModel):
    risk: float
    reliability: float
    endHealth: float
    minimumHealth: float


class WhatIfResult(BaseModel):
    baseline: MissionSimulationResult
    scenario: MissionSimulationResult
    delta: WhatIfDelta
    interpretation: str


def evaluate_what_if(
    base_mission: MissionProfile,
    scenario: WhatIfScenario,
    current_degradation: DegradationState | None = None,
    initial_rul_hours: float | None = None,
    fault_type: str | None = None,
) -> WhatIfResult:
    """
    Run baseline mission vs. what-if scenario copy without mutating the original mission profile.
    """
    # 1. Run baseline
    baseline_result = simulate_mission_trajectory(
        profile=base_mission,
        initial_degradation=current_degradation,
        initial_rul_hours=initial_rul_hours,
        fault_type=fault_type,
    )

    # 2. Build independent scenario copy of mission phases
    scenario_phases: list[MissionPhaseSpec] = []
    for p in base_mission.phases:
        dur = p.durationSeconds
        ld = p.load
        throt = p.throttle

        if p.phase == "CRUISE":
            dur = p.durationSeconds * scenario.cruiseDurationMultiplier
        elif p.phase == "LOITER" and scenario.cruiseDurationMultiplier != 1.0:
            # Scaled proportionately if cruise changed
            dur = p.durationSeconds * min(2.0, max(0.5, scenario.cruiseDurationMultiplier))

        if p.phase in scenario.selectedPhases:
            ld = max(0.0, min(1.0, p.load + scenario.loadDelta))
            throt = max(0.0, min(1.0, p.throttle + scenario.throttleDelta))

        scenario_phases.append(
            MissionPhaseSpec(
                phase=p.phase,
                durationSeconds=round(dur, 1),
                altitudeStart=p.altitudeStart,
                altitudeEnd=p.altitudeEnd,
                throttle=round(throt, 3),
                load=round(ld, 3),
                ambientTemperature=p.ambientTemperature,
            )
        )

    scenario_mission = MissionProfile(
        missionId=f"{base_mission.missionId}-WHATIF",
        phases=scenario_phases,
    )

    # Use degradation override if given, else current_degradation
    deg_input = scenario.initialDegradationOverride or current_degradation
    fault_input = scenario.faultTypeOverride or fault_type

    scenario_result = simulate_mission_trajectory(
        profile=scenario_mission,
        initial_degradation=deg_input,
        initial_rul_hours=initial_rul_hours,
        fault_type=fault_input,
    )

    # 3. Calculate deltas
    risk_delta = round(scenario_result.missionRiskScore - baseline_result.missionRiskScore, 4)
    rel_delta = round(scenario_result.missionReliabilityScore - baseline_result.missionReliabilityScore, 4)
    end_health_delta = round(scenario_result.projectedEndHealth - baseline_result.projectedEndHealth, 2)
    min_health_delta = round(scenario_result.minimumProjectedHealth - baseline_result.minimumProjectedHealth, 2)

    delta = WhatIfDelta(
        risk=risk_delta,
        reliability=rel_delta,
        endHealth=end_health_delta,
        minimumHealth=min_health_delta,
    )

    # 4. Generate deterministic human-interpretable trade-off summary
    interpretations = []
    if scenario.cruiseDurationMultiplier > 1.0:
        interpretations.append(
            f"Extended cruise duration ({scenario.cruiseDurationMultiplier:.1f}x) increases cumulative operating exposure."
        )
    elif scenario.cruiseDurationMultiplier < 1.0:
        interpretations.append(
            f"Shortened mission duration ({scenario.cruiseDurationMultiplier:.1f}x) preserves health margin."
        )

    if scenario.loadDelta > 0.0:
        interpretations.append(f"Higher load (+{scenario.loadDelta:.2f}) elevates thermal and mechanical stress.")
    elif scenario.loadDelta < 0.0:
        interpretations.append(f"Reduced load ({scenario.loadDelta:.2f}) mitigates wear accumulation.")

    if risk_delta > 0.10:
        interpretations.append(
            f"Scenario materially elevates mission risk (+{risk_delta:.2f}) from {baseline_result.riskBand} to {scenario_result.riskBand}."
        )
    elif risk_delta < -0.05:
        interpretations.append(
            f"Scenario improves mission margin (risk delta {risk_delta:.2f})."
        )
    else:
        interpretations.append(
            f"Scenario produces minimal risk delta ({risk_delta:+.2f}), maintaining {scenario_result.riskBand} status."
        )

    interpretation = " ".join(interpretations)

    return WhatIfResult(
        baseline=baseline_result,
        scenario=scenario_result,
        delta=delta,
        interpretation=interpretation,
    )
