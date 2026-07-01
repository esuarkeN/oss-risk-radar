import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";

const entries = [
  {
    href: "/docs/data-sources",
    title: "Where data comes from",
    body: "The public, point-in-time sources behind every signal — GH Archive history, GitHub metadata, and package registries.",
  },
  {
    href: "/docs/feature-engineering",
    title: "Feature engineering",
    body: "How raw activity becomes comparable signals: trailing windows, human-only activity, and past-only measurement.",
  },
  {
    href: "/docs/features",
    title: "Feature reference",
    body: "All 43 signals grouped by what they measure, each with an exact definition and the reason it exists.",
  },
  {
    href: "/docs/confidence",
    title: "How much to trust a score",
    body: "What per-prediction confidence means and why it is separate from how decisive a score is.",
  },
  {
    href: "/docs/ml",
    title: "Model performance",
    body: "How the model is evaluated overall, plus the dataset, training repositories, and training runs behind it.",
  },
  {
    href: "/docs/about",
    title: "About the project",
    body: "What OSS Risk Radar is for, and the principles behind treating risk as decision support rather than a verdict.",
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
          These docs explain where the data comes from, how a repository&apos;s raw activity is turned into model
          signals, what each signal means and why it matters, and how the model behind the scores is evaluated. Use the
          menu on the left, or start with a section below.
        </p>
      </Card>

      <div className="grid animate-slide-up gap-4 md:grid-cols-2" style={{ animationDelay: "80ms" }}>
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
