import Link from "next/link";

import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "Submit a repository",
    body: "You paste a GitHub repository URL. The unit of analysis is a single repository; the set of dependency repositories for a project is expected to come from an external software-composition-analysis tool (for example the OSS Review Toolkit), and each repository is scored on its own.",
  },
  {
    title: "Enrich from public sources",
    body: "For each repository the pipeline pulls stable metadata (creation, default branch, archive state) and the maintenance signals it needs. Bot activity is excluded so automated noise doesn't look like maintenance.",
  },
  {
    title: "Resolve the feature vector",
    body: "The observed signals are turned into the model's features. Any signal that couldn't be resolved is imputed to the training-cohort average and flagged as missing — it then contributes no evidence and lowers confidence.",
  },
  {
    title: "Pick the regime",
    body: "If the repository is in the staged full-history feature cache, the full-history model runs (rich reconstructed history). Otherwise the cold-start model runs on the signals available right now. Cold-start is deliberately treated as the less precise, more broadly applicable regime.",
  },
  {
    title: "Score and calibrate",
    body: "The model outputs a raw probability, which is mapped through the calibration curve learned on held-out data so the number reflects observed real-world rates rather than a raw model output.",
  },
  {
    title: "Confidence, margin, and bucket",
    body: "Alongside the probability you get a per-repository confidence (coverage, in-distribution fit, evidence support), a margin (how decisive the call is), a risk bucket, and an action level (monitor / review / replace candidate) with the evidence behind it.",
  },
];

export default function ScoringRunbookPage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Scoring</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">How scoring a repo works</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            Scoring never trains or downloads history on request — it loads the staged artifacts and applies them to the
            signals it can gather for your submission. Here is exactly what happens between hitting “analyze” and seeing a
            score.
          </p>
        </div>
      </Card>

      <Card className="space-y-5">
        <ol className="space-y-5">
          {steps.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-sm leading-6 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Reading the result</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>A <strong className="text-foreground">high score is not proof of abandonment</strong>, and a low score is not proof of safety — it is decision support for triage, not a verdict.</li>
          <li>Missing data is shown explicitly and lowers confidence rather than being hidden.</li>
          <li>Popularity is weak context, not primary evidence.</li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          For what the score means given how the model performed, see{" "}
          <Link href="/docs/performance" className="font-medium text-accent">
            Training results explained
          </Link>{" "}
          and{" "}
          <Link href="/docs/confidence" className="font-medium text-accent">
            Trust &amp; confidence
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
