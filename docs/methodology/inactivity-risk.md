# Inactivity Risk Methodology

OSS Risk Radar does not label a dependency as safe or unsafe. It estimates a risk profile intended for maintenance and supply-chain triage.

## MVP Heuristic Signals

The first heuristic score uses public or mockable signals that are transparent to users:

- repository archived flag
- last commit age
- last release age
- release cadence
- recent contributor count
- contributor concentration
- open issue growth ratio
- pull request response latency proxy
- OpenSSF Scorecard-style controls
- maintenance metadata presence

## Output Fields

Each dependency score returns:

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