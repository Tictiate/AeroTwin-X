"""Operating-point relationships for the healthy prototype engine."""

from .constants import IDLE_RPM, MAX_RPM, MIN_RPM

PHASE_RPM_CORRECTION = {
    "IDLE": -100.0,
    "TAKEOFF": 150.0,
    "CLIMB": 100.0,
    "CRUISE": 0.0,
    "LOITER": -50.0,
    "DESCENT": -100.0,
    "LANDING": -150.0,
}


def expected_rpm(throttle: float, load: float, density_kg_m3: float, mission_phase: str) -> float:
    """Estimate a bounded RPM operating point from mission and environment."""
    density_correction = ((density_kg_m3 / 1.225) - 1.0) * 300.0
    phase_correction = PHASE_RPM_CORRECTION.get(mission_phase, 0.0)
    raw_rpm = (
        IDLE_RPM
        + throttle * (MAX_RPM - IDLE_RPM)
        - load * 500.0
        + density_correction
        + phase_correction
    )
    return max(MIN_RPM, min(MAX_RPM, raw_rpm))
