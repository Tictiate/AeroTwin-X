"""Mission reliability and What-If API endpoints."""

from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.degradation.degradation_estimator import DegradationState
from app.mission.mission_model import MissionProfile, default_mission_profile
from app.mission.mission_simulator import MissionSimulationResult, simulate_mission_trajectory
from app.mission.what_if import WhatIfResult, WhatIfScenario, evaluate_what_if

router = APIRouter(prefix="/mission", tags=["mission"])


class MissionSimulateRequest(BaseModel):
    profile: MissionProfile = Field(default_factory=default_mission_profile)
    currentDegradation: DegradationState | None = None
    initialRulHours: float | None = None
    faultType: str | None = None
    stepSeconds: float = 30.0


class WhatIfAPIRequest(BaseModel):
    baseMission: MissionProfile = Field(default_factory=default_mission_profile)
    scenario: WhatIfScenario = Field(default_factory=WhatIfScenario)
    currentDegradation: DegradationState | None = None
    initialRulHours: float | None = None
    faultType: str | None = None


@router.get("/default-profile", response_model=MissionProfile)
def get_default_profile() -> MissionProfile:
    return default_mission_profile()


@router.post("/simulate", response_model=MissionSimulationResult)
def simulate_mission(request: MissionSimulateRequest) -> MissionSimulationResult:
    return simulate_mission_trajectory(
        profile=request.profile,
        initial_degradation=request.currentDegradation,
        initial_rul_hours=request.initialRulHours,
        fault_type=request.faultType,
        step_seconds=request.stepSeconds,
    )


@router.post("/what-if", response_model=WhatIfResult)
def run_what_if(request: WhatIfAPIRequest) -> WhatIfResult:
    return evaluate_what_if(
        base_mission=request.baseMission,
        scenario=request.scenario,
        current_degradation=request.currentDegradation,
        initial_rul_hours=request.initialRulHours,
        fault_type=request.faultType,
    )
