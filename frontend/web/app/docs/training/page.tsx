import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { Card } from "@/components/ui/card";

const prerequisites = [
  "Node.js (for the npm run ml:* orchestration scripts).",
  "Python with the scoring workspace requirements installed (mltraining/scoring).",
  "A repository seed and locally downloaded GH Archive coverage — see Building the dataset.",
];

const trainSteps = [
  {
    title: "Build (or refresh) the dataset",
    body: "Training needs labeled snapshots. If you have not built them yet, do that first.",
    code: "npm run ml:dataset:foundation",
  },
  {
    title: "Train the artifacts",
    body: "This runs the notebook-primary workflow end to end: dataset engineering, model fitting, calibration, evaluation, and artifact export. It trains Logistic Regression and XGBoost in both the full-history and cold-start regimes.",
    code: "npm run ml:train        # add :force to retrain, or ml:notebook to open the notebook",
  },
  {
    title: "Compare candidates and promote",
    body: "Staging compares every candidate model against what is currently deployed and only promotes when no AUROC drop and no Brier increase exceeds 0.02 — so a worse model can never silently replace a better one.",
    code: "npm run ml:stage-training -- --source-dir tmp/training-foundation/candidate \\\n  --minimum-repositories 5000 --minimum-inactive-repositories 1000",
  },
];

export default function TrainingPage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; training</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Train it yourself</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            Training is fully offline and reproducible — runtime scoring only ever loads exported artifacts, it never
            trains on request. The visible workflow lives in{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">notebooks/oss-maintenance-training.ipynb</code>,
            which the <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">npm run ml:train</code> command drives headlessly.
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Prerequisites</h2>
        <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted">
          {prerequisites.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Train and promote</h2>
        <ol className="space-y-5">
          {trainSteps.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-sm leading-6 text-muted">{step.body}</p>
                <CodeBlock>{step.code}</CodeBlock>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">What gets produced &amp; deployed</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          A run writes model artifacts to the runs directory (e.g. <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">tmp/training/runs</code>)
          plus a <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">latest-run.json</code> pointer. Promotion copies the accepted bundle into{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">deployment/training</code>. The API image bakes that folder in at build
          time and re-seeds it on start, so a deploy of a new image is what makes fresh artifacts live.
        </p>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Promotion guardrails require: labeled rows with both classes; non-empty train/validation/test slices; held-out
          metrics for Logistic Regression and XGBoost in both regimes; the{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">feature-set-v3</code> artifacts; and acceptable AUROC, Brier, and calibration
          behavior. What those metrics mean in practice is covered in{" "}
          <Link href="/docs/performance" className="font-medium text-accent">
            Training results explained
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
