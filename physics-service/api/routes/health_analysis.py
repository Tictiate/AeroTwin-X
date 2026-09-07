from fastapi import APIRouter

from app.health.health_calculator import (
    HealthEvaluateRequest,
    HealthEvaluateResponse,
    evaluate_health,
)

router = APIRouter()


@router.post("/health/evaluate", response_model=HealthEvaluateResponse)
def evaluate(request: HealthEvaluateRequest) -> HealthEvaluateResponse:
    return evaluate_health(request)
