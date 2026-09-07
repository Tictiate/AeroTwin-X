from fastapi import APIRouter

from app.degradation.degradation_estimator import (
    DegradationEvaluateRequest,
    DegradationEvaluateResponse,
    evaluate_degradation,
)

router = APIRouter()


@router.post("/degradation/evaluate", response_model=DegradationEvaluateResponse)
def evaluate(request: DegradationEvaluateRequest) -> DegradationEvaluateResponse:
    return evaluate_degradation(request)
