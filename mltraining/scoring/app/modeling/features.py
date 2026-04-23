from __future__ import annotations

import math
from datetime import UTC, datetime

from app.schemas.score import DependencySignalPayload, ExtractedFeatureRow
from app.scoring.heuristic import EXPECTED_SIGNALS, score_dependency, scoring_timestamp
from app.training.maintenance_dataset.features import HISTORICAL_FEATURE_NAMES

FEATURE_VERSION = "feature-set-v1"
BASE_FEATURE_NAMES = [
    "has_repository_mapping",
    "is_direct_dependency",
    "repo_archived",
    "last_push_age_days",
    "last_release_age_days",
    "release_cadence_days",
    "recent_contributors_90d",
    "contributor_concentration",
    "open_issue_growth_90d",
    "pr_response_median_days",
    "scorecard_score",
    "scorecard_checks_scored",
    "scorecard_high_checks",
    "scorecard_low_checks",
    "stars_log1p",
    "forks_log1p",
    "open_issues_log1p",
    "signal_completeness",
    "ecosystem_npm",
    "ecosystem_pypi",
    "ecosystem_go",
    "ecosystem_maven",
    "ecosystem_other",
]
FEATURE_NAMES = BASE_FEATURE_NAMES + HISTORICAL_FEATURE_NAMES


def _normalize_ecosystem(ecosystem: str) -> str:
    return ecosystem.strip().lower()


def _ecosystem_flags(ecosystem: str) -> dict[str, float]:
    normalized = _normalize_ecosystem(ecosystem)
    return {
        "ecosystem_npm": 1.0 if normalized == "npm" else 0.0,
        "ecosystem_pypi": 1.0 if normalized in {"pypi", "python"} else 0.0,
        "ecosystem_go": 1.0 if normalized in {"go", "golang"} else 0.0,
        "ecosystem_maven": 1.0 if normalized == "maven" else 0.0,
        "ecosystem_other": 1.0 if normalized not in {"npm", "pypi", "python", "go", "golang", "maven"} else 0.0,
    }


def _missing_signals(payload: DependencySignalPayload) -> list[str]:
    missing: list[str] = []
    repo = payload.repository
    if repo is None:
        return list(EXPECTED_SIGNALS)

    signal_values = {
        "last_push_age_days": repo.last_push_age_days,
        "last_release_age_days": repo.last_release_age_days,
        "release_cadence_days": repo.release_cadence_days,
        "recent_contributors_90d": repo.recent_contributors_90d,
        "contributor_concentration": repo.contributor_concentration,
        "open_issue_growth_90d": repo.open_issue_growth_90d,
        "pr_response_median_days": repo.pr_response_median_days,
    }
    for name, value in signal_values.items():
        if value is None:
            missing.append(name)

    if payload.scorecard is None or payload.scorecard.score is None:
        missing.append("scorecard_score")

    return sorted(set(missing))


def extract_feature_values(payload: DependencySignalPayload) -> tuple[dict[str, float], list[str]]:
    repo = payload.repository
    scorecard = payload.scorecard
    missing = _missing_signals(payload)

    values = {
        "has_repository_mapping": 1.0 if repo is not None else 0.0,
        "is_direct_dependency": 1.0 if payload.direct else 0.0,
        "repo_archived": 1.0 if repo is not None and repo.archived else 0.0,
        "last_push_age_days": float(repo.last_push_age_days or 0),
        "last_release_age_days": float(repo.last_release_age_days or 0),
        "release_cadence_days": float(repo.release_cadence_days or 0),
        "recent_contributors_90d": float(repo.recent_contributors_90d or 0),
        "contributor_concentration": float(repo.contributor_concentration or 0),
        "open_issue_growth_90d": float(repo.open_issue_growth_90d or 0),
        "pr_response_median_days": float(repo.pr_response_median_days or 0),
        "scorecard_score": float(scorecard.score or 0) if scorecard is not None else 0.0,
        "scorecard_checks_scored": float(len(scorecard.checks)) if scorecard is not None else 0.0,
        "scorecard_high_checks": float(sum(1 for check in scorecard.checks if check.score >= 8)) if scorecard is not None else 0.0,
        "scorecard_low_checks": float(sum(1 for check in scorecard.checks if check.score <= 4)) if scorecard is not None else 0.0,
        "stars_log1p": math.log1p(repo.stars) if repo is not None else 0.0,
        "forks_log1p": math.log1p(repo.forks) if repo is not None else 0.0,
        "open_issues_log1p": math.log1p(repo.open_issues) if repo is not None else 0.0,
        "signal_completeness": round((len(EXPECTED_SIGNALS) - len(missing)) / len(EXPECTED_SIGNALS), 4),
    }
    values.update(_ecosystem_flags(payload.ecosystem))
    for name in HISTORICAL_FEATURE_NAMES:
        values[name] = float(payload.historical_features.get(name, 0.0))

    ordered_values = {name: float(values[name]) for name in FEATURE_NAMES}
    return ordered_values, missing


def build_feature_row(payload: DependencySignalPayload, observed_at: str | None = None) -> ExtractedFeatureRow:
    feature_values, missing = extract_feature_values(payload)
    heuristic_result = score_dependency(payload)

    return ExtractedFeatureRow(
        dependency_id=payload.dependency_id,
        package_name=payload.package_name,
        package_version=payload.package_version,
        ecosystem=payload.ecosystem,
        observed_at=observed_at or scoring_timestamp(),
        missing_signals=sorted(set(missing + heuristic_result.risk_profile.missing_signals)),
        heuristic_reference_score=heuristic_result.risk_profile.inactivity_risk_score,
        feature_values=feature_values,
    )


def build_feature_rows(dependencies: list[DependencySignalPayload], observed_at: str | None = None) -> list[ExtractedFeatureRow]:
    timestamp = observed_at or datetime.now(UTC).isoformat()
    return [build_feature_row(payload, observed_at=timestamp) for payload in dependencies]
