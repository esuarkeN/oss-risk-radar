from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.score import DependencySignalPayload, EvidenceItem, ExplanationFactor


def build_evidence_items(payload: DependencySignalPayload) -> list[EvidenceItem]:
    observed_at = datetime.now(UTC).isoformat()
    evidence: list[EvidenceItem] = []

    if payload.repository is not None:
        repo = payload.repository
        evidence.extend(
            [
                EvidenceItem(
                    source="github",
                    signal="repository_archived",
                    value=str(repo.archived).lower(),
                    observed_at=observed_at,
                    provenance_url=repo.url,
                ),
                EvidenceItem(
                    source="github",
                    signal="stars",
                    value=str(repo.stars),
                    observed_at=observed_at,
                    provenance_url=repo.url,
                ),
                EvidenceItem(
                    source="github",
                    signal="open_issues",
                    value=str(repo.open_issues),
                    observed_at=observed_at,
                    provenance_url=repo.url,
                ),
            ]
        )
        if repo.last_push_age_days is not None:
            evidence.append(
                EvidenceItem(
                    source="github",
                    signal="last_push_age_days",
                    value=str(repo.last_push_age_days),
                    observed_at=observed_at,
                    provenance_url=repo.url,
                )
            )
        if repo.last_release_age_days is not None:
            evidence.append(
                EvidenceItem(
                    source="github",
                    signal="last_release_age_days",
                    value=str(repo.last_release_age_days),
                    observed_at=observed_at,
                    provenance_url=repo.url,
                )
            )

    if payload.scorecard is not None and payload.repository is not None:
        if payload.scorecard.score is not None:
            evidence.append(
                EvidenceItem(
                    source="openssf_scorecard",
                    signal="overall_score",
                    value=f"{payload.scorecard.score:.1f}/10",
                    observed_at=observed_at,
                    provenance_url=payload.repository.url,
                )
            )
        for check in payload.scorecard.checks[:3]:
            evidence.append(
                EvidenceItem(
                    source="openssf_scorecard",
                    signal=check.name,
                    value=f"{check.score:.1f}/10",
                    observed_at=observed_at,
                    provenance_url=payload.repository.url,
                )
            )

    return evidence


def factor(label: str, direction: str, weight: float, detail: str) -> ExplanationFactor:
    return ExplanationFactor(label=label, direction=direction, weight=round(abs(weight), 2), detail=detail)
