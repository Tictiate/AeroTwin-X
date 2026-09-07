from fastapi import APIRouter, HTTPException

from app.ml.inference import MLAnalyzeRequest, MLAnalyzeResponse, ModelNotLoadedError, ModelRegistry

router = APIRouter()
registry = ModelRegistry(__import__("pathlib").Path("data/models"))


@router.post("/ml/analyze", response_model=MLAnalyzeResponse)
def analyze(request: MLAnalyzeRequest) -> MLAnalyzeResponse:
    try:
        return registry.analyze(request)
    except ModelNotLoadedError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
