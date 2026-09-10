"""Live fault-injection endpoint for the Java telemetry simulator.

This is a thin wrapper around the existing, validated fault models in
app.simulation.fault_models (the same FAULT_MODELS/FaultSchedule used by
scripts/generate_dataset.py for offline dataset generation). It does not
reimplement any fault semantics — it applies the already-implemented
FaultModel.apply() to Java-generated healthy telemetry so the live
diagnostics chain can observe real fault-perturbed telemetry.
"""

import random

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.physics.predictions import PhysicsPrediction, TelemetryInput
from app.simulation.fault_models import FAULT_MODELS, FaultSchedule, FaultType

router = APIRouter(prefix="/simulation", tags=["simulation"])

# None of the existing FaultModel.apply() implementations read the `prediction`
# argument (only `healthy`, `severity`, `elapsed_seconds`, and `rng`), so a
# placeholder satisfies the existing function signature without requiring the
# live simulator to make an extra /physics/predict call just for this.
_UNUSED_PREDICTION = PhysicsPrediction(
    expectedRpm=0.0,
    expectedEgt=0.0,
    expectedCht=0.0,
    expectedOilTemperature=0.0,
    expectedOilPressure=0.0,
    expectedFuelFlow=0.0,
    expectedVibration=0.0,
    expectedBatteryVoltage=0.0,
)


class FaultInjectionRequest(BaseModel):
    telemetry: TelemetryInput
    faultType: FaultType
    elapsedFaultSeconds: float = Field(ge=0.0)
    severity: float | None = Field(default=None, ge=0.0, le=1.0)
    seed: int = 42


class FaultInjectionResponse(BaseModel):
    telemetry: TelemetryInput
    faultType: FaultType
    severity: float
    active: bool


@router.post("/inject-fault", response_model=FaultInjectionResponse)
def inject_fault(request: FaultInjectionRequest) -> FaultInjectionResponse:
    # Same default onset (120s) and ramp rate (1/120 per second) as every
    # offline dataset scenario; only fixed_severity is caller-overridable,
    # exactly like DatasetConfig.fixed_severity already allows offline.
    schedule = FaultSchedule(fault_type=request.faultType, fixed_severity=request.severity)
    severity = schedule.severity_at(request.elapsedFaultSeconds)

    fault_model = FAULT_MODELS[request.faultType]

    # A fresh Random per request would replay the same draw every tick for
    # probabilistic faults (Misfire). Deriving the seed from elapsed time
    # keeps each tick's draw reproducible-if-replayed while still varying
    # across the live sequence, since HTTP requests are otherwise stateless.
    rng = random.Random(request.seed + int(round(request.elapsedFaultSeconds)))

    faulted = fault_model.apply(
        request.telemetry, _UNUSED_PREDICTION, severity, request.elapsedFaultSeconds, rng
    )

    return FaultInjectionResponse(
        telemetry=faulted,
        faultType=request.faultType,
        severity=severity,
        active=severity > 0.0,
    )
