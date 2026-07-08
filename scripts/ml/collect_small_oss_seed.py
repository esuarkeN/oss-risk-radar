"""Collect a gharchive-compatible seed of SMALLER / mid-tier OSS repos.

Complements the elite foundation-seed (which is dominated by huge, healthy projects)
by sampling real repos across a spread of activity states so the model can learn the
low -> high inactivity gradient rather than only the "big & healthy" corner.

Uses the unauthenticated GitHub Search API (10 req/min); we stay well under that.
"""
from __future__ import annotations

import csv
import sys
import time
import urllib.request
import urllib.parse
import json

API = "https://api.github.com/search/repositories"

# language -> ecosystem label used by the scoring pipeline
LANG_ECOSYSTEM = {
    "JavaScript": "npm",
    "TypeScript": "npm",
    "Python": "pypi",
    "Go": "go",
    "Java": "maven",
    "Rust": "other",
}

# (state_label, query_template, sort, order)
# {lang} is substituted per language. States chosen to spread the maintenance signal.
# require_license: drop repos without an SPDX license (cheap filter against
# personal portfolios / tutorials / landing pages that pollute a language search).
# We keep unlicensed repos only for the archived bucket, where abandonment
# positives are scarce and worth more than the noise cost.
STATES = [
    ("active-small", "language:{lang} stars:50..400 pushed:>2025-01-01 fork:false", "stars", "desc", True),
    ("active-mid", "language:{lang} stars:400..1000 pushed:>2025-01-01 fork:false", "stars", "desc", True),
    ("slowing", "language:{lang} stars:80..600 pushed:2022-06-01..2023-12-31 fork:false", "updated", "desc", True),
    ("dormant", "language:{lang} stars:80..600 pushed:2020-01-01..2021-12-31 fork:false", "updated", "desc", True),
    ("archived", "language:{lang} stars:40..800 archived:true fork:false", "stars", "desc", False),
]

LANGUAGES = ["JavaScript", "Python", "Go", "Java"]
PER_PAGE = 30


def search(query: str, sort: str, order: str) -> list[dict]:
    params = urllib.parse.urlencode(
        {"q": query, "sort": sort, "order": order, "per_page": PER_PAGE}
    )
    req = urllib.request.Request(
        f"{API}?{params}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "oss-risk-radar-seed-collector",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    return payload.get("items", [])


def tier(stars: int) -> str:
    # Calibrated for a deliberately small/mid seed; nothing here approaches the
    # 10k-400k star elite that dominates foundation-seed.csv.
    if stars < 200:
        return "low"
    return "medium"


def main() -> int:
    seen: set[str] = set()
    rows: list[dict] = []
    for lang in LANGUAGES:
        ecosystem = LANG_ECOSYSTEM[lang]
        for state, template, sort, order, require_license in STATES:
            query = template.format(lang=lang)
            try:
                items = search(query, sort, order)
            except Exception as exc:  # noqa: BLE001 - best-effort collector
                print(f"WARN {lang}/{state}: {exc}", file=sys.stderr)
                items = []
            added = 0
            for item in items:
                full = item["full_name"]
                if full in seen:
                    continue
                stars = int(item.get("stargazers_count", 0))
                lic = (item.get("license") or {})
                spdx = lic.get("spdx_id") or "NOASSERTION"
                if require_license and spdx in {"NOASSERTION", "NONE", None}:
                    continue
                seen.add(full)
                rows.append(
                    {
                        "ecosystem": "github",
                        "package_name": full,
                        "package_version": "repository-snapshot",
                        "popularity_tier": tier(stars),
                        "source": f"github-search:small-{state}",
                        "repository_url": item["html_url"],
                        "repository_full_name": full,
                        "license_spdx_id": spdx,
                    }
                )
                added += 1
            print(f"{lang:11} {state:12} +{added:3}  (total {len(rows)})", file=sys.stderr)
            time.sleep(7)  # stay under 10 req/min unauthenticated

    out = sys.argv[1] if len(sys.argv) > 1 else "smaller-oss-gharchive-seed.csv"
    fields = [
        "ecosystem", "package_name", "package_version", "popularity_tier",
        "source", "repository_url", "repository_full_name", "license_spdx_id",
    ]
    with open(out, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWROTE {len(rows)} repos -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
