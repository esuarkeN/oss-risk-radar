from __future__ import annotations

from dataclasses import dataclass, field

from app.modeling.features import FEATURE_VERSION


@dataclass(slots=True)
class ModelMetadata:
    model_name: str
    version: str
    training_status: str
    algorithm: str
    feature_version: str = FEATURE_VERSION
    trained_at: str | None = None
    notes: list[str] = field(default_factory=list)


def latest_model_metadata() -> ModelMetadata:
    return ModelMetadata(
        model_name="heuristic-baseline",
        version="0.1.0",
        training_status="not_applicable",
        algorithm="heuristic",
        notes=["The MVP serves explainable heuristic scoring by default."],
    )
