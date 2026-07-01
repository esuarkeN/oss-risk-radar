import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "Generate a repository seed",
    body: "A seed is a list of GitHub repositories to learn from, sampled across active, dormant, and archived strata (with a star floor, a required license, and no forks). The strata are only for sampling — they are never used as labels.",
    code: "npm run ml:seed:foundation",
  },
  {
    title: "Download filtered GH Archive history",
    body: "For every repo in the seed, hourly GH Archive event files are streamed and filtered down to that seed's events, with coverage manifests. Only days with all 24 hourly files count as covered — sparse hours would make “no activity” indistinguishable from “missing data”.",
    code: ".\\scripts\\download-gharchive-seed-filtered-parallel.ps1 -Workers 4 \\\n  -SeedPath .\\tmp\\training-foundation\\foundation-seed.csv \\\n  -OutDir .\\tmp\\gharchive-foundation -KeepRaw -Start 2021-01-01",
  },
  {
    title: "Build labeled snapshots",
    body: "Each snapshot is one repository observed at a date t. Observation-time features are computed only from events at or before t; the 12-month label is computed only from the window (t, t+12 months]. Rows whose future window isn't fully covered by the archive stay unlabeled.",
    code: "npm run ml:dataset:foundation",
  },
];

export default function DatasetPage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; training</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Building the dataset</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            The dataset is built offline from public history, never at scoring time. The goal is a leakage-controlled
            table of repository snapshots where every feature is measured before the observation date and every label
            is measured after it. See{" "}
            <Link href="/docs/data-sources" className="font-medium text-accent">
              Where data comes from
            </Link>{" "}
            for the sources feeding this pipeline.
          </p>
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">The pipeline, step by step</h2>
        <ol className="space-y-5">
          {steps.map((step, index) => (
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
        <h2 className="text-lg font-semibold tracking-tight text-foreground">How the 12-month label is defined</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The exported label is <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">label_inactive_12m</code>,
          the inverse of a <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">maintained_12m</code> variable.
          A repository counts as maintained in the horizon if it is not archived/deleted by <em>t</em>+12&nbsp;months and at
          least <strong>two of four</strong> future-window activity checks pass (commits, releases, merged PRs, and issue
          activity). Completeness is gated on a dataset-wide archive coverage horizon, so a repository that genuinely goes
          quiet is labeled inactive rather than being dropped as “incomplete”.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">What the build produces</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">snapshots.json</code> — the labeled
            training rows (features + label + provenance).
          </li>
          <li>
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">repository-feature-cache.json</code> —
            per-repository full-history features used later for live full-history scoring.
          </li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          With the dataset in place, continue to{" "}
          <Link href="/docs/training" className="font-medium text-accent">
            Train it yourself
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
