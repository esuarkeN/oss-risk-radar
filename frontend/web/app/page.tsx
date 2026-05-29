import { ArrowRight, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { SubmissionForm } from "@/components/submission-form";

const landingCards = [
  { title: "Repository overview", body: "Rank tracked repositories and package snapshots.", href: "/repositories" },
  { title: "Methodology", body: "Inspect signal definitions and scoring boundaries.", href: "/methodology" },
  { title: "ML results", body: "Review model quality, calibration, and cached runs.", href: "/ml-evaluation" },
];

const signalRows = [
  { label: "last push age", value: "217d", tone: "text-warning" },
  { label: "maintainer depth", value: "2", tone: "text-danger" },
  { label: "release cadence", value: "slow", tone: "text-warning" },
  { label: "scorecard", value: "7.1", tone: "text-success" },
];

function SignalMap() {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-line bg-foreground p-5 text-background md:min-h-[430px]">
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(hsl(var(--background))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--background))_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/60">Signal Map</p>
          <h2 className="mt-2 max-w-sm text-3xl font-semibold leading-tight tracking-tight">react / dependency health scan</h2>
        </div>
        <span className="rounded-md border border-background/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-background/80">
          high watch
        </span>
      </div>

      <div className="absolute left-[12%] top-[42%] h-24 w-24 rounded-full border border-accent/80 bg-accent/15 shadow-[0_0_0_18px_hsl(var(--accent)/0.08)]" />
      <div className="absolute left-[43%] top-[28%] h-16 w-16 rounded-full border border-background/30 bg-background/10" />
      <div className="absolute bottom-[24%] right-[18%] h-20 w-20 rounded-full border border-warning/80 bg-warning/15" />
      <div className="absolute bottom-[14%] left-[34%] h-10 w-10 rounded-full border border-danger/80 bg-danger/20" />
      <div className="absolute left-[21%] top-[53%] h-px w-[38%] rotate-[-19deg] bg-background/24" />
      <div className="absolute left-[51%] top-[43%] h-px w-[28%] rotate-[31deg] bg-background/24" />
      <div className="absolute left-[38%] bottom-[27%] h-px w-[32%] rotate-[8deg] bg-background/24" />

      <div className="absolute bottom-5 left-5 right-5 z-10 grid gap-2 sm:grid-cols-2">
        {signalRows.map((row) => (
          <div key={row.label} className="rounded-md border border-background/15 bg-background/10 px-3 py-3 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.14em] text-background/55">{row.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <section className="grid gap-6 lg:min-h-[calc(100vh-7.5rem)] lg:grid-cols-[0.94fr_1.06fr] lg:items-stretch">
        <div className="flex flex-col justify-between gap-6 py-4 lg:py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">OSS Risk Radar</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              Maintenance risk intelligence for open-source dependencies.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted">
              Score a repository, inspect the dependency evidence, and keep the training base growing from real analyses.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Evidence", "traceable"],
              ["Model path", "calibrated"],
              ["Posture", "conservative"],
            ].map(([label, value]) => (
              <div key={label} className="border-l border-line pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <SignalMap />
          <SubmissionForm />
        </div>
      </section>

      <section className="grid gap-3 border-t border-line pt-6 md:grid-cols-3">
        {landingCards.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-lg border border-line bg-panel p-5 transition hover:border-accent/60 hover:bg-panelAlt"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">0{index + 1}</span>
              <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
            </div>
            <h2 className="mt-8 text-xl font-semibold tracking-tight text-foreground">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-3 border-t border-line py-6 text-sm text-muted md:grid-cols-3">
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 text-accent" />
          repository and manifest intake
        </div>
        <div className="flex items-center gap-3">
          <Workflow className="h-4 w-4 text-accent" />
          dependency graph context
        </div>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-accent" />
          review-first risk framing
        </div>
      </section>
    </>
  );
}
