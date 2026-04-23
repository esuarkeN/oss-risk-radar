from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.score import DependencySignalPayload, RiskProfileResponse, ScoreResult
from app.scoring.explanations import build_evidence_items, factor

EXPECTED_SIGNALS = [
    "repository_mapping",
    "archived",
    "last_push_age_days",
    "last_release_age_days",
    "release_cadence_days",
    "recent_contributors_90d",
    "contributor_concentration",
    "open_issue_growth_90d",
    "pr_response_median_days",
    "scorecard_score",
]


def clamp(value: float, lower: float = 0, upper: float = 100) -> float:
    return max(lower, min(upper, value))


def derive_maintenance_outlook_12m_score(inactivity_risk_score: float) -> float:
    return round(clamp(100 - inactivity_risk_score), 2)


def determine_bucket(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def determine_action_level(score: float) -> str:
    if score >= 80:
        return "replace_candidate"
    if score >= 50:
        return "review"
    return "monitor"


def score_security_posture(payload: DependencySignalPayload) -> tuple[float, list]:
    if payload.scorecard is None or payload.scorecard.score is None:
        return 40.0, [
            factor(
                "Security data incomplete",
                "neutral",
                0,
                "OpenSSF Scorecard data was unavailable, so the security posture score is conservative.",
            )
        ]

    posture = payload.scorecard.score * 10
    factors = []
    for check in payload.scorecard.checks:
        normalized = check.score * 10
        if normalized >= 8:
            posture += 2
            factors.append(
                factor(check.name, "decrease", 2, f"Scorecard check '{check.name}' scored {check.score:.1f}/10.")
            )
        elif normalized <= 4:
            posture -= 3
            factors.append(
                factor(check.name, "increase", 3, f"Scorecard check '{check.name}' scored {check.score:.1f}/10.")
            )

    return round(clamp(posture), 2), factors


def score_dependency(payload: DependencySignalPayload) -> ScoreResult:
    repo = payload.repository
    risk = 10.0
    factors = []
    missing_signals = []
    caveats = []
    available_signals = set()

    if repo is None:
        risk = 55.0
        missing_signals.extend(EXPECTED_SIGNALS)
        caveats.append(
            "No source repository mapping was available, so inactivity risk uses a conservative fallback."
        )
        security_posture_score, security_factors = score_security_posture(payload)
        factors.extend(security_factors)
        evidence = build_evidence_items(payload)
        confidence = 0.15
    else:
        available_signals.update({"repository_mapping", "archived"})
        if repo.archived:
            risk += 35
            factors.append(
                factor(
                    "Archived repository",
                    "increase",
                    35,
                    "The mapped source repository is archived, which is a strong inactivity signal.",
                )
            )
        else:
            risk -= 5
            factors.append(
                factor(
                    "Repository remains active",
                    "decrease",
                    5,
                    "The mapped source repository is not archived.",
                )
            )

        if repo.last_push_age_days is None:
            missing_signals.append("last_push_age_days")
        else:
            available_signals.add("last_push_age_days")
            if repo.last_push_age_days > 365:
                risk += 24
                factors.append(factor("Aging commits", "increase", 24, "No recent push activity was observed within the last year."))
            elif repo.last_push_age_days > 180:
                risk += 14
                factors.append(factor("Slowing commit activity", "increase", 14, "Recent push activity is older than six months."))
            elif repo.last_push_age_days <= 30:
                risk -= 8
                factors.append(factor("Recent push activity", "decrease", 8, "Recent push activity was observed within the last month."))

        if repo.last_release_age_days is None:
            missing_signals.append("last_release_age_days")
        else:
            available_signals.add("last_release_age_days")
            if repo.last_release_age_days > 540:
                risk += 18
                factors.append(factor("Stale release history", "increase", 18, "The latest tagged release is older than 18 months."))
            elif repo.last_release_age_days <= 120:
                risk -= 6
                factors.append(factor("Recent releases", "decrease", 6, "A release was published within the last four months."))

        if repo.release_cadence_days is None:
            missing_signals.append("release_cadence_days")
        else:
            available_signals.add("release_cadence_days")
            if repo.release_cadence_days > 240:
                risk += 10
                factors.append(factor("Irregular releases", "increase", 10, "Observed release cadence is slower than eight months."))
            elif repo.release_cadence_days < 60:
                risk -= 4
                factors.append(factor("Frequent releases", "decrease", 4, "Observed release cadence remains active."))

        if repo.recent_contributors_90d is None:
            missing_signals.append("recent_contributors_90d")
        else:
            available_signals.add("recent_contributors_90d")
            if repo.recent_contributors_90d == 0:
                risk += 16
                factors.append(factor("No recent contributors", "increase", 16, "No distinct contributors were observed in the last 90 days."))
            elif repo.recent_contributors_90d == 1:
                risk += 9
                factors.append(factor("Single recent maintainer", "increase", 9, "Only one recent contributor was observed."))
            elif repo.recent_contributors_90d >= 4:
                risk -= 6
                factors.append(factor("Contributor depth", "decrease", 6, "Multiple recent contributors reduce concentration risk."))

        if repo.contributor_concentration is None:
            missing_signals.append("contributor_concentration")
        else:
            available_signals.add("contributor_concentration")
            if repo.contributor_concentration > 0.8:
                risk += 10
                factors.append(factor("Contributor concentration", "increase", 10, "A single maintainer appears to dominate recent activity."))
            elif repo.contributor_concentration < 0.45:
                risk -= 4
                factors.append(factor("Distributed contribution", "decrease", 4, "Recent activity is spread across multiple contributors."))

        if repo.open_issue_growth_90d is None:
            missing_signals.append("open_issue_growth_90d")
        else:
            available_signals.add("open_issue_growth_90d")
            if repo.open_issue_growth_90d > 0.35:
                risk += 8
                factors.append(factor("Issue backlog growth", "increase", 8, "Open issues are growing faster than they are being resolved."))
            elif repo.open_issue_growth_90d < 0:
                risk -= 2
                factors.append(factor("Issue backlog improving", "decrease", 2, "Open issue volume is trending down."))

        if repo.pr_response_median_days is None:
            missing_signals.append("pr_response_median_days")
        else:
            available_signals.add("pr_response_median_days")
            if repo.pr_response_median_days > 30:
                risk += 7
                factors.append(factor("Slow PR responsiveness", "increase", 7, "Median pull request response time is longer than 30 days."))
            elif repo.pr_response_median_days <= 7:
                risk -= 3
                factors.append(factor("Responsive reviews", "decrease", 3, "Median pull request response time is within one week."))

        security_posture_score, security_factors = score_security_posture(payload)
        factors.extend(security_factors)
        if payload.scorecard is None or payload.scorecard.score is None:
            missing_signals.append("scorecard_score")
        else:
            available_signals.add("scorecard_score")
            if payload.scorecard.score < 5:
                risk += 4
                factors.append(factor("Weak security practice indicators", "increase", 4, "Scorecard results suggest weaker supply-chain hygiene."))
            elif payload.scorecard.score >= 8:
                risk -= 2
                factors.append(factor("Positive security practice indicators", "decrease", 2, "Scorecard results suggest stronger public security practices."))

        if len(missing_signals) > 3:
            caveats.append("Several expected public signals were missing, which lowers confidence in the profile.")
        if repo.stars < 25:
            caveats.append("Popularity metrics are only weak context and do not imply maintainership quality.")

        evidence = build_evidence_items(payload)
        confidence = len(available_signals) / len(EXPECTED_SIGNALS)

    inactivity_risk_score = round(clamp(risk), 2)
    ordered_factors = sorted(factors, key=lambda item: item.weight, reverse=True)[:6]

    return ScoreResult(
        dependency_id=payload.dependency_id,
        package_name=payload.package_name,
        package_version=payload.package_version,
        ecosystem=payload.ecosystem,
        risk_profile=RiskProfileResponse(
            inactivity_risk_score=inactivity_risk_score,
            maintenance_outlook_12m_score=derive_maintenance_outlook_12m_score(inactivity_risk_score),
            security_posture_score=round(security_posture_score, 2),
            confidence_score=round(clamp(confidence, 0, 1), 2),
            risk_bucket=determine_bucket(inactivity_risk_score),
            action_level=determine_action_level(inactivity_risk_score),
            caveats=caveats,
            missing_signals=sorted(set(missing_signals)),
            explanation_factors=ordered_factors,
            evidence=evidence,
        ),
    )


def scoring_timestamp() -> str:
    return datetime.now(UTC).isoformat()
