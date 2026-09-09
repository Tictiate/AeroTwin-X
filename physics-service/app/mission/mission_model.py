"""Deterministic mission profile and phase models."""

from typing import Literal
from pydantic import BaseModel, Field

MissionPhaseType = Literal["IDLE", "TAKEOFF", "CLIMB", "CRUISE", "LOITER", "DESCENT", "LANDING"]


class MissionPhaseSpec(BaseModel):
    phase: MissionPhaseType
    durationSeconds: float = Field(gt=0.0)
    altitudeStart: float = Field(ge=0.0, le=20000.0)
    altitudeEnd: float = Field(ge=0.0, le=20000.0)
    throttle: float = Field(ge=0.0, le=1.0)
    load: float = Field(ge=0.0, le=1.0)
    ambientTemperature: float = Field(default=15.0, ge=-90.0, le=70.0)


class MissionProfile(BaseModel):
    missionId: str = Field(min_length=1)
    phases: list[MissionPhaseSpec] = Field(min_length=1)

    @property
    def totalDurationSeconds(self) -> float:
        return sum(p.durationSeconds for p in self.phases)


def default_mission_profile(mission_id: str = "MISSION-DEMO-01") -> MissionProfile:
    """Standard representative 6-phase MALE UAV mission profile."""
    return MissionProfile(
        missionId=mission_id,
        phases=[
            MissionPhaseSpec(
                phase="TAKEOFF",
                durationSeconds=120.0,
                altitudeStart=0.0,
                altitudeEnd=500.0,
                throttle=0.90,
                load=0.85,
                ambientTemperature=15.0,
            ),
            MissionPhaseSpec(
                phase="CLIMB",
                durationSeconds=300.0,
                altitudeStart=500.0,
                altitudeEnd=5000.0,
                throttle=0.80,
                load=0.75,
                ambientTemperature=10.0,
            ),
            MissionPhaseSpec(
                phase="CRUISE",
                durationSeconds=1800.0,
                altitudeStart=5000.0,
                altitudeEnd=5000.0,
                throttle=0.62,
                load=0.55,
                ambientTemperature=5.0,
            ),
            MissionPhaseSpec(
                phase="LOITER",
                durationSeconds=900.0,
                altitudeStart=5000.0,
                altitudeEnd=4500.0,
                throttle=0.50,
                load=0.45,
                ambientTemperature=5.0,
            ),
            MissionPhaseSpec(
                phase="DESCENT",
                durationSeconds=300.0,
                altitudeStart=4500.0,
                altitudeEnd=500.0,
                throttle=0.35,
                load=0.40,
                ambientTemperature=12.0,
            ),
            MissionPhaseSpec(
                phase="LANDING",
                durationSeconds=180.0,
                altitudeStart=500.0,
                altitudeEnd=0.0,
                throttle=0.25,
                load=0.35,
                ambientTemperature=15.0,
            ),
        ],
    )
