import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";

const flow = [
  { label: "Sources", body: "Public GitHub history + registry facts", href: "/docs/data-sources" },
  { label: "Dataset", body: "Leakage-controlled labeled snapshots", href: "/docs/dataset" },
  { label: "Training", body: "Fit, calibrate, evaluate, promote", href: "/docs/training" },
  { label: "Scoring", body: "Enrich → features → model → calibrate", href: "/docs/scoring" },
  { label: "Interpret", body: "Probability + confidence + evidence", href: "/docs/performance" },
];

const entries = [
  {
    href: "/docs/data-sources",
    title: "Where data comes from",
    body: "The public, point-in-time sources behind every signal — GH Archive history, GitHub metadata, and package registries.",
  },
  {
    href: "/docs/dataset",
    title: "Building the dataset",
    body: "How raw history becomes a leakage-controlled, labeled training table — the offline pipeline and the 12-month label.",
  },
  {
    href: "/docs/training",
    title: "Train it yourself",
    body: "A runbook: prerequisites, the commands to build the dataset, train the artifacts, and promote a new model.",
  },
  {
    href: "/docs/features",
    title: "Feature reference",
    body: "All 43 signals grouped by what they measure, each with an exact definition and the reason it exists.",
  },
  {
    href: "/docs/scoring",
    title: "How scoring a repo works",
    body: "Step by step, what happens between hitting analyze and seeing a probability, confidence, and evidence.",
  },
  {
    href: "/docs/performance",
    title: "Training results explained",
    body: "How well the model works in plain terms, where it is more or less reliable, and what that means for a score.",
  },
];

export default function DocsOverviewPage() {
  return (
    <>
      <Card className="animate-slide-up space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Documentation</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          How OSS Risk Radar scores maintenance risk
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Built for developers: where the data comes from, how to train the model yourself, what the features are and how
          they performed, and exactly what happens when a repository is scored. For the scientific evaluation of the
          model, see{" "}
          <Link href="/docs/ml" className="font-medium text-accent">
            Model evaluation
          </Link>
          .
        </p>
      </Card>

      <Card className="animate-slide-up space-y-3" style={{ animationDelay: "60ms" }}>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">End to end</p>
        <div className="flex flex-wrap items-stretch gap-2">
          {flow.map((node, index) => (
            <div key={node.label} className="flex items-center gap-2">
              <Link
                href={node.href}
                className="block w-40 rounded-lg border border-line bg-panelAlt p-3 transition-colors hover:border-accent/40"
              >
                <p className="text-sm font-semibold text-foreground">{node.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{node.body}</p>
              </Link>
              {index < flow.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid animate-slide-up gap-4 md:grid-cols-2" style={{ animationDelay: "120ms" }}>
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group flex flex-col justify-between rounded-xl border border-line bg-panel p-5 transition-all hover:border-accent/40 hover:bg-accent/[0.04]"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-foreground">{entry.title}</h2>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{entry.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
