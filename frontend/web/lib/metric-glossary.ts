import type { InfoChipItem } from "@/components/info-chip-group";

export const productGlossary: InfoChipItem[] = [
  {
    label: "Inactivity risk",
    description: "A triage-oriented estimate of maintenance fragility based on public repository activity, release rhythm, contributor depth, and backlog signals."
  },
  {
    label: "Provenance",
    description: "Every analysis keeps the source of its signals visible so reviewers can trace what came from GitHub, Scorecard, uploads, or demo data."
  },
  {
    label: "Confidence",
    description: "Confidence measures signal coverage, not certainty about the real world. Missing or stale data lowers it."
  },
  {
    label: "Training base",
    description: "Completed analyses are converted into dependency snapshots so the ML pipeline can grow as more repositories are analyzed."
  }
];

export const heuristicSignalGlossary: InfoChipItem[] = [
  {
    label: "Last push age",
    description: "How old the latest repository push is. Older push activity is a strong inactivity signal."
  },
  {
    label: "Release cadence",
    description: "The approximate time between releases. Slower cadence can indicate fragility, depending on the project context."
  },
  {
    label: "Contributor depth",
    description: "How many distinct recent contributors were observed. More depth reduces single-maintainer fragility."
  },
  {
    label: "Contributor concentration",
    description: "How dominant one maintainer appears within recent activity. Higher concentration increases continuity risk."
  },
  {
    label: "Issue growth",
    description: "Whether open issues are growing faster than they are being resolved. Persistent growth can signal maintenance strain."
  },
  {
    label: "PR responsiveness",
    description: "The median time to respond to pull requests. Slower responses can indicate operational bottlenecks."
  },
  {
    label: "Scorecard score",
    description: "An OpenSSF hygiene indicator used as security-practice context, not as a standalone trust verdict."
  },
  {
    label: "Signal completeness",
    description: "A feature showing how much of the expected public evidence was actually available for a dependency snapshot."
  }
];

export const modelMetricGlossary: InfoChipItem[] = [
  {
    label: "AUROC",
    description: "How well the model ranks riskier dependencies ahead of less risky ones across thresholds. Higher is better."
  },
  {
    label: "Brier score",
    description: "A calibration-sensitive probability error metric. Lower is better, which is why it matters for thesis-style reliability claims."
  },
  {
    label: "Inactive 12m rate",
    description: "The share of positive labels in the evaluation slice. It tells you how much true inactivity pressure is present in the held-out set."
  },
  {
    label: "F1",
    description: "The balance between precision and recall once a classification threshold is chosen."
  },
  {
    label: "Precision",
    description: "Of the dependencies flagged as risky, how many truly belong in that slice."
  },
  {
    label: "Recall",
    description: "Of the truly risky dependencies, how many the model successfully catches."
  },
  {
    label: "Calibration",
    description: "Whether predicted probabilities match real observed rates. Good calibration makes a score easier to trust in triage."
  }
];
