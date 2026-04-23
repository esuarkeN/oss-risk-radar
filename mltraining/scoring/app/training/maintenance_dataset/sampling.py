from __future__ import annotations

from collections import defaultdict
import random

from app.training.maintenance_dataset.entities import POPULARITY_TIERS, SUPPORTED_ECOSYSTEMS, PackageCandidate, normalize_ecosystem


def derive_popularity_tier(candidate: PackageCandidate) -> str:
    if candidate.popularity_tier:
        normalized = candidate.popularity_tier.strip().lower()
        if normalized in POPULARITY_TIERS:
            return normalized

    downloads = candidate.downloads_30d or 0
    dependents = candidate.direct_dependents_count or 0
    if downloads >= 1_000_000 or dependents >= 1_000:
        return "high"
    if downloads >= 100_000 or dependents >= 100:
        return "medium"
    return "low"


def sample_candidates(
    candidates: list[PackageCandidate],
    sample_limit_per_ecosystem: int,
    seed: int,
) -> list[PackageCandidate]:
    grouped: dict[tuple[str, str], list[PackageCandidate]] = defaultdict(list)
    for item in candidates:
        ecosystem = normalize_ecosystem(item.ecosystem)
        if ecosystem not in SUPPORTED_ECOSYSTEMS:
            continue
        grouped[(ecosystem, derive_popularity_tier(item))].append(item)

    rng = random.Random(seed)
    sampled: list[PackageCandidate] = []
    ecosystems = sorted({key[0] for key in grouped})
    for ecosystem in ecosystems:
        selected: list[PackageCandidate] = []
        tier_buckets = {tier: list(grouped.get((ecosystem, tier), [])) for tier in POPULARITY_TIERS}
        for values in tier_buckets.values():
            rng.shuffle(values)

        remaining = sample_limit_per_ecosystem
        tiers_with_values = [tier for tier in POPULARITY_TIERS if tier_buckets[tier]]
        if not tiers_with_values:
            continue

        per_tier = max(1, sample_limit_per_ecosystem // len(tiers_with_values))
        for tier in tiers_with_values:
            take = min(len(tier_buckets[tier]), per_tier, remaining)
            selected.extend(tier_buckets[tier][:take])
            tier_buckets[tier] = tier_buckets[tier][take:]
            remaining -= take

        if remaining > 0:
            leftovers: list[PackageCandidate] = []
            for tier in tiers_with_values:
                leftovers.extend(tier_buckets[tier])
            rng.shuffle(leftovers)
            selected.extend(leftovers[:remaining])

        sampled.extend(sorted(selected, key=lambda item: (normalize_ecosystem(item.ecosystem), item.package_name)))

    return sampled
