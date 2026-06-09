from fastapi import APIRouter, HTTPException

from app.config import settings
from app.modeling import FEATURE_VERSION
from app.modeling.features import build_feature_rows, scoring_timestamp
from app.schemas.score import (
    DependencyBatchRequest,
    FeaturesExtractResponse,
    ScoreModelRequest,
    ScoreModelResponse,
)
from app.scoring.model import score_dependency_with_model

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.service_version,
    }


@router.get("/ready")
def ready() -> dict[str, str]:
    return {
        "status": "ready",
        "service": settings.service_name,
        "version": settings.service_version,
    }


@router.post("/score/model", response_model=ScoreModelResponse)
def score_model(request: ScoreModelRequest) -> ScoreModelResponse:
    try:
        results = [score_dependency_with_model(dependency, request.model_artifact) for dependency in request.dependencies]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ScoreModelResponse(
        analysis_id=request.analysis_id,
        scoring_version=request.scoring_version,
        generated_at=scoring_timestamp(),
        results=results,
    )


@router.post("/features/extract", response_model=FeaturesExtractResponse)
def extract_features(request: DependencyBatchRequest) -> FeaturesExtractResponse:
    generated_at = scoring_timestamp()
    rows = build_feature_rows(request.dependencies, observed_at=generated_at)
    return FeaturesExtractResponse(
        analysis_id=request.analysis_id,
        feature_version=FEATURE_VERSION,
        generated_at=generated_at,
        rows=rows,
    )
