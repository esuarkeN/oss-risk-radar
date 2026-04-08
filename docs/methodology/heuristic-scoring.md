# Heuristic Scoring Methodology

Phase 1 uses an explainable heuristic focused on inactivity-oriented risk and public security-practice indicators.

Signals currently modeled:

- archived repository status
- last push age
- last release age
- release cadence
- recent contributors over 90 days
- contributor concentration
- open issue growth proxy
- pull request responsiveness proxy
- OpenSSF Scorecard score and selected checks

Outputs:

- inactivity risk score from 0 to 100 where higher means greater inactivity-oriented concern
- security posture score from 0 to 100 where higher means stronger public security-practice indicators
- confidence score from 0 to 1 based on signal completeness
- action level: `monitor`, `review`, or `replace_candidate`
- explanation factors, caveats, missing signals, and evidence items

Important framing:

- a high score is not proof of abandonment
- a low score is not proof of safety
- missing data is surfaced explicitly and lowers confidence
- popularity metrics remain weak context rather than primary evidence
