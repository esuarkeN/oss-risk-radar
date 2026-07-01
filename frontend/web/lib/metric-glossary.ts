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

export const modelMetricGlossary: InfoChipItem[] = [
  {
    label: "Quality",
    description: "A held-out summary score that combines AUROC skill with Brier skill. It is useful for comparison, not as a standalone proof."
  },
  {
    label: "AUROC",
    description: "How well the model ranks riskier dependencies ahead of less risky ones across thresholds. Higher is better."
  },
  {
    label: "Brier score",
    description: "A calibration-sensitive probability error metric. Lower is better, which is why it matters for thesis-style reliability claims."
  },
  {
    label: "ECE",
    description: "Expected calibration error compares predicted probability bins with observed outcomes. Lower means the probabilities are better calibrated."
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
