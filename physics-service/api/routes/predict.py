from fastapi import APIRouter

from app.physics.predictions import PhysicsPrediction, TelemetryInput, predict_healthy_state

router = APIRouter()


@router.post("/physics/predict", response_model=PhysicsPrediction)
def predict(telemetry: TelemetryInput) -> PhysicsPrediction:
    return predict_healthy_state(telemetry)
