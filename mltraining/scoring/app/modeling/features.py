from __future__ import annotations

import math
from datetime import UTC, datetime

from app.schemas.score import DependencySignalPayload, ExtractedFeatureRow
from app.training.maintenance_dataset.features import HISTORICAL_FEATURE_NAMES

FEATURE_REGIME_FULL_HISTORY = "full-history"
FEATURE_REGIME_COLD_START = "cold-start"
FULL_HISTORY_FEATURE_VERSION = "feature-set-v3-full-history"
COLD_START_FEATURE_VERSION = "feature-set-v3-cold-start"
FEATURE_VERSION = FULL_HISTORY_FEATURE_VERSION
HISTORICAL_DIAGNOSTIC_FEATURE_NAMES = [
    "repo_archived_at_obs",
]
PREDICTIVE_HISTORICAL_FEATURE_NAMES = [
    name for name in HISTORICAL_FEATURE_NAMES if name not in set(HISTORICAL_DIAGNOSTIC_FEATURE_NAMES)
]
EXPECTED_SIGNALS = [
    "repository_mapping",
    "last_push_age_days",
    "last_release_age_days",
    "release_cadence_days",
    "recent_contributors_90d",
    "contributor_concentration",
    "open_issue_growth_90d",
    "pr_response_median_days",
]
EXPECTED_MODEL_SIGNALS = EXPECTED_SIGNALS + PREDICTIVE_HISTORICAL_FEATURE_NAMES
CURRENT_SNAPSHOT_FEATURE_NAMES = [
    "has_repository_mapping",
    "is_direct_dependency",
    "last_push_age_days",
    "last_release_age_days",
    "release_cadence_days",
    "recent_contributors_90d",
    "contributor_concentration",
    "open_issue_growth_90d",
    "pr_response_median_days",
    "stars_log1p",
    "forks_log1p",
    "open_issues_log1p",
    "ecosystem_npm",
    "ecosystem_pypi",
    "ecosystem_go",
    "ecosystem_maven",
    "ecosystem_other",
]
FULL_HISTORY_FEATURE_NAMES = CURRENT_SNAPSHOT_FEATURE_NAMES + PREDICTIVE_HISTORICAL_FEATURE_NAMES
COLD_START_FEATURE_NAMES = list(CURRENT_SNAPSHOT_FEATURE_NAMES)
FEATURE_NAMES = list(FULL_HISTORY_FEATURE_NAMES)
FEATURE_VERSIONS_BY_REGIME = {
    FEATURE_REGIME_FULL_HISTORY: FULL_HISTORY_FEATURE_VERSION,
    FEATURE_REGIME_COLD_START: COLD_START_FEATURE_VERSION,
}
FEATURE_NAMES_BY_REGIME = {
    FEATURE_REGIME_FULL_HISTORY: FULL_HISTORY_FEATURE_NAMES,
    FEATURE_REGIME_COLD_START: COLD_START_FEATURE_NAMES,
}
FEATURE_REGIME_BY_VERSION = {version: regime for regime, version in FEATURE_VERSIONS_BY_REGIME.items()}


def normalize_feature_regime(feature_regime: str | None) -> str:
    normalized = (feature_regime or FEATURE_REGIME_FULL_HISTORY).strip().lower().replace("_", "-")
    if normalized in {"full", "history", "timeline", "full-history"}:
        return FEATURE_REGIME_FULL_HISTORY
    if normalized in {"cold", "current", "cold-start", "current-snapshot"}:
        return FEATURE_REGIME_COLD_START
    raise ValueError(f"unsupported feature regime: {feature_regime}")


def feature_names_for_regime(feature_regime: str | None) -> list[str]:
    return list(FEATURE_NAMES_BY_REGIME[normalize_feature_regime(feature_regime)])


def feature_version_for_regime(feature_regime: str | None) -> str:
    return FEATURE_VERSIONS_BY_REGIME[normalize_feature_regime(feature_regime)]


def feature_regime_for_version(feature_version: str | None) -> str:
    return FEATURE_REGIME_BY_VERSION.get(feature_version or "", FEATURE_REGIME_FULL_HISTORY)


def scoring_timestamp() -> str:
    return datetime.now(UTC).isoformat()


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


def _missing_signals(payload: DependencySignalPayload, feature_names: list[str]) -> list[str]:
    missing: list[str] = []
    repo = payload.repository
    if repo is None:
        missing.extend(EXPECTED_SIGNALS)
    else:
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

    for name in PREDICTIVE_HISTORICAL_FEATURE_NAMES:
        if name in feature_names and name not in payload.historical_features:
            missing.append(name)

    return sorted(set(missing))


def extract_feature_values(
    payload: DependencySignalPayload,
    *,
    feature_names: list[str] | None = None,
    feature_regime: str | None = None,
) -> tuple[dict[str, float], list[str]]:
    selected_feature_names = list(feature_names) if feature_names is not None else feature_names_for_regime(feature_regime)
    repo = payload.repository
    missing = _missing_signals(payload, selected_feature_names)
    signal_completeness = round((len(EXPECTED_MODEL_SIGNALS) - len(missing)) / len(EXPECTED_MODEL_SIGNALS), 4)

    values = {
        "has_repository_mapping": 1.0 if repo is not None else 0.0,
        "is_direct_dependency": 1.0 if payload.direct else 0.0,
        "repo_archived": 1.0 if repo is not None and repo.archived else 0.0,
        "last_push_age_days": float(repo.last_push_age_days or 0) if repo is not None else 0.0,
        "last_release_age_days": float(repo.last_release_age_days or 0) if repo is not None else 0.0,
        "release_cadence_days": float(repo.release_cadence_days or 0) if repo is not None else 0.0,
        "recent_contributors_90d": float(repo.recent_contributors_90d or 0) if repo is not None else 0.0,
        "contributor_concentration": float(repo.contributor_concentration or 0) if repo is not None else 0.0,
        "open_issue_growth_90d": float(repo.open_issue_growth_90d or 0) if repo is not None else 0.0,
        "pr_response_median_days": float(repo.pr_response_median_days or 0) if repo is not None else 0.0,
        "stars_log1p": math.log1p(repo.stars) if repo is not None else 0.0,
        "forks_log1p": math.log1p(repo.forks) if repo is not None else 0.0,
        "open_issues_log1p": math.log1p(repo.open_issues) if repo is not None else 0.0,
        "signal_completeness": signal_completeness,
    }
    values.update(_ecosystem_flags(payload.ecosystem))
    for name in HISTORICAL_FEATURE_NAMES:
        values[name] = float(payload.historical_features.get(name, 0.0))

    ordered_values = {name: float(values.get(name, 0.0)) for name in selected_feature_names}
    return ordered_values, missing


def build_feature_row(
    payload: DependencySignalPayload,
    observed_at: str | None = None,
    *,
    feature_names: list[str] | None = None,
    feature_regime: str | None = None,
) -> ExtractedFeatureRow:
    feature_values, missing = extract_feature_values(
        payload,
        feature_names=feature_names,
        feature_regime=feature_regime,
    )

    return ExtractedFeatureRow(
        dependency_id=payload.dependency_id,
        package_name=payload.package_name,
        package_version=payload.package_version,
        ecosystem=payload.ecosystem,
        observed_at=observed_at or scoring_timestamp(),
        missing_signals=missing,
        feature_values=feature_values,
    )


def build_feature_rows(
    dependencies: list[DependencySignalPayload],
    observed_at: str | None = None,
    *,
    feature_regime: str | None = None,
) -> list[ExtractedFeatureRow]:
    timestamp = observed_at or datetime.now(UTC).isoformat()
    return [build_feature_row(payload, observed_at=timestamp, feature_regime=feature_regime) for payload in dependencies]
