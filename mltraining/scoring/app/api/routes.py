from fastapi import APIRouter, HTTPException

from app.config import settings
from app.modeling import FEATURE_VERSION
from app.modeling.features import build_feature_rows
from app.schemas.score import (
    FeaturesExtractResponse,
    ModelTrainRequest,
    ModelTrainResponse,
    ScoreModelRequest,
    ScoreHeuristicRequest,
    ScoreHeuristicResponse,
)
from app.scoring.heuristic import score_dependency, scoring_timestamp
from app.scoring.model import score_dependency_with_model
from app.training.pipeline import TrainingRunConfig, run_training_pipeline

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


@router.post("/score/heuristic", response_model=ScoreHeuristicResponse)
def score_heuristic(request: ScoreHeuristicRequest) -> ScoreHeuristicResponse:
    results = [score_dependency(dependency) for dependency in request.dependencies]
    return ScoreHeuristicResponse(
        analysis_id=request.analysis_id,
        scoring_version=request.scoring_version,
        generated_at=scoring_timestamp(),
        results=results,
    )


@router.post("/score/model", response_model=ScoreHeuristicResponse)
def score_model(request: ScoreModelRequest) -> ScoreHeuristicResponse:
    results = [score_dependency_with_model(dependency, request.model_artifact) for dependency in request.dependencies]
    return ScoreHeuristicResponse(
        analysis_id=request.analysis_id,
        scoring_version=request.scoring_version,
        generated_at=scoring_timestamp(),
        results=results,
    )


@router.post("/features/extract", response_model=FeaturesExtractResponse)
def extract_features(request: ScoreHeuristicRequest) -> FeaturesExtractResponse:
    generated_at = scoring_timestamp()
    rows = build_feature_rows(request.dependencies, observed_at=generated_at)
    return FeaturesExtractResponse(
        analysis_id=request.analysis_id,
        feature_version=FEATURE_VERSION,
        generated_at=generated_at,
        rows=rows,
    )


@router.post("/models/train", response_model=ModelTrainResponse)
def train_model(request: ModelTrainRequest) -> ModelTrainResponse:
    try:
        result = run_training_pipeline(
            TrainingRunConfig(
                dataset_path=request.dataset_uri,
                snapshots=request.snapshots,
                algorithm=request.model_name,
                train_ratio=request.train_ratio,
                validation_ratio=request.validation_ratio,
                calibration_bins=request.calibration_bins,
                threshold=request.threshold,
            )
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ModelTrainResponse(
        status=result.status,
        model_name=result.model_name,
        model_version=result.model_version,
        trained_at=result.trained_at,
        dataset_summary=result.dataset_summary,
        split_summary=result.split_summary,
        metrics=result.metrics,
        calibration_bins=result.calibration_bins,
        artifact=result.artifact,
        message=result.note,
    )
