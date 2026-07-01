import Link from "next/link";

import { Card } from "@/components/ui/card";

const reliability = [
  {
    title: "Widely-used repositories",
    body: "The most reliable: they emit rich, consistent public signals, so the score is well-supported.",
  },
  {
    title: "Obscure / low-signal repositories",
    body: "Weaker: with little public activity there is less evidence, so treat these scores more cautiously — the per-repository confidence will usually reflect this.",
  },
  {
    title: "Cold-start (no reconstructed history)",
    body: "Less precise than full-history by design, and measured on seed-like repos, so a brand-new submission can be out-of-distribution. Use it as a first read, not a final word.",
  },
  {
    title: "Already-quiet repositories",
    body: "Part of the signal is simple persistence — a repo that is already silent tends to stay silent. The model still adds value on repos that are active at observation time, which is the harder, more useful case.",
  },
];

export default function PerformancePage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Scoring</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Training results explained</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            This page explains, in plain terms, how well the model works and what that means for a single score. For the
            exact held-out figures and the scientific framing, see{" "}
            <Link href="/docs/ml" className="font-medium text-accent">
              Model evaluation
            </Link>
            .
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">What the score is</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The score is an <strong className="text-foreground">estimated probability</strong> that a repository becomes
          inactive within the next 12 months, checked against what actually happened to held-out repositories the model
          never trained on. It is calibrated: across many repositories, a group scored around 30% really does go inactive
          roughly 30% of the time. So the number is meant to be read as a probability, not a verdict or a grade.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Where it is more or less reliable</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Aggregate accuracy hides real differences between kinds of repositories. The evaluation slices the held-out set
          so these differences are visible:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {reliability.map((item) => (
            <div key={item.title} className="rounded-xl border border-line bg-panelAlt p-4">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">What this means when you score a repo</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>Read the probability together with the <Link href="/docs/confidence" className="font-medium text-accent">confidence and margin</Link> — a confident, decisive score is far more actionable than a borderline one with low coverage.</li>
          <li>Low confidence usually means missing or unusual signals, not that the repo is fine — gather more evidence before acting.</li>
          <li>Use it to prioritize review, not to auto-reject dependencies. It is conservative triage support.</li>
        </ul>
      </Card>
    </>
  );
}
