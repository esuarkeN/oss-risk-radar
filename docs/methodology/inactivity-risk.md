# Inactivity Risk Methodology

OSS Risk Radar does not label a dependency as safe or unsafe. It estimates a risk profile intended for maintenance and supply-chain triage.

## Model Feature Signals

The staged model artifacts use public or mockable signals that are transparent to users:

- repository archived flag
- commit, contributor, issue, PR, and release activity windows
- contributor concentration and concentration-risk proxies
- backlog growth, stale issue share, and issue closure/response/resolution timing
- PR merge ratio, PR response timing, and PR merge latency
- package age, repository age, release cadence, and release-gap risk
- popularity context such as stars and forks at observation time
- maintenance metadata completeness

OpenSSF Scorecard is kept as a separate security posture input. It is not part of the v2 inactivity model feature vector.

## Output Fields

Each dependency model score returns:

- inactivity risk score from 0 to 100
- security posture score from 0 to 100
- confidence score from 0 to 100
- signal completeness percentage
- action level: `monitor`, `review`, or `replace_candidate`
- explanation factors with direction and weight
- evidence items with source and observation time
- caveats and missing signals

## Interpretation Rules

- Higher inactivity risk means stronger signals consistent with maintenance fragility or inactivity.
- Higher security posture means more favorable observable security-practice indicators.
- Low confidence or missing-signal counts should reduce decisiveness in analyst interpretation.
- Scores support review and prioritization; they do not prove trustworthiness.
