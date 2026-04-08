# Methodology

OSS Risk Radar is not a vulnerability scanner and it does not claim that a package is safe or unsafe. It is a triage system that helps users estimate maintenance and supply-chain risk using public signals.

## What the score means

- The inactivity risk score estimates the likelihood that a dependency may be heading toward low maintainership or stalled activity.
- The security posture score summarizes public indicators related to repository hygiene and secure development practice.
- The confidence indicator reflects how complete and recent the available evidence is, not how true the score is in an absolute sense.

## Signals used in the first phase

- Last commit age
- Last release age
- Release cadence
- Archived repository state
- Recent contributor count
- Contributor concentration
- Open issue trend
- PR responsiveness proxy
- Scorecard-style security-practice indicators
- Presence or absence of maintainership metadata

## Guardrails

- Always surface evidence and missing signals alongside the score.
- Avoid absolute language.
- Treat missing data as a first-class outcome, not as a zero-value signal.
- Prefer conservative action labels such as `monitor`, `review`, or `replace candidate`.

## Research path

The first release should ship explainable heuristics. A future model can be layered on top once the snapshot store, labels, and evaluation pipeline are stable enough for time-aware training and calibration.
