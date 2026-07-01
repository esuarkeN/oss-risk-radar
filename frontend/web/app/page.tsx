import {
  ArrowRight,
  CircleDot,
  GitBranch,
  Network,
  ShieldCheck,
  Workflow,
  Zap,
  Search,
  BookOpen,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

import { CreateAnalysisForm } from "@/components/landing/create-analysis-form";
import { ResumeAnalysisCard } from "@/components/landing/resume-analysis-card";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { href: "/repositories", label: "Repositories" },
  { href: "/docs", label: "Docs" },
];

const stats = [
  { value: "43", label: "Maintenance signals per repo" },
  { value: "4", label: "Risk buckets" },
  { value: "12mo", label: "Inactivity outlook" },
  { value: "npm · PyPI · Go", label: "Supported ecosystems" },
];

const features = [
  {
    icon: Network,
    color: "text-accent bg-accent/10",
    title: "Dependency Tree Visualization",
    body: "Interactive graph of your full transitive closure. Pan, zoom, click any node to drill into its risk profile.",
  },
  {
    icon: ShieldCheck,
    color: "text-danger bg-danger/10",
    title: "ML Risk Scoring",
    body: "A machine-learning model trained on historical maintenance outcomes — it scores operational fragility, not just known CVEs.",
  },
  {
    icon: Zap,
    color: "text-success bg-success/10",
    title: "Multi-source Signals",
    body: "Repository health, release cadence, contributor count, OpenSSF checks, and scorecard data — unified in one view.",
  },
  {
    icon: Search,
    color: "text-warning bg-warning/10",
    title: "Path Explorer",
    body: "Trace exactly how a vulnerable or fragile package enters your codebase through the transitive dependency chain.",
  },
  {
    icon: BarChart3,
    color: "text-accent bg-accent/10",
    title: "12-month Outlook",
    body: "Forward-looking maintenance score predicts packages likely to go unmaintained within the next year.",
  },
  {
    icon: BookOpen,
    color: "text-warning bg-warning/10",
    title: "Evidence Layer",
    body: "Every score is traceable to raw observed signals. No black box — full auditability for security review.",
  },
];

const manifestFormats = [
  "package-lock.json",
  "requirements.txt",
  "poetry.lock",
  "go.mod",
  "yarn.lock",
  "pnpm-lock.yaml",
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Sticky nav */}
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--panel)/0.90)] px-6 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[hsl(var(--accent))]">
            <CircleDot className="h-4 w-4 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))]">
            OSS Risk Radar
          </span>
          <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.35)] sm:inline-flex">
            BETA
          </span>
        </Link>

        <nav className="ml-8 hidden items-center gap-1 sm:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-[hsl(var(--muted))] transition-colors hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="#analyze"
            className="hidden rounded-[7px] bg-[hsl(var(--accent))] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:inline-flex"
          >
            New analysis →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center lg:pb-24 lg:pt-28">
        {/* Radial glow behind headline */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] [background:radial-gradient(ellipse_80%_50%_at_50%_-5%,hsl(var(--accent)/0.10),transparent)]"
        />

        <div className="relative mx-auto max-w-3xl">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">
            Supply Chain Risk Intelligence
          </span>

          <h1 className="animate-slide-up text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[hsl(var(--foreground))]">
            Know your{" "}
            <span className="text-[hsl(var(--accent))]">dependency risk</span>
            <br />
            before it ships
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-7 text-[hsl(var(--muted))]">
            OSS Risk Radar surfaces operationally fragile dependencies in your
            software supply chain — scored by ML, grounded in public signals,
            built for engineering and security teams.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-[hsl(var(--muted))]">
            {[
              "deps.dev enrichment",
              "GitHub signal extraction",
              "OpenSSF Scorecard",
              "ML-scored maintenance risk",
            ].map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-1"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <div className="mx-6 mb-16 overflow-hidden rounded-xl border border-[hsl(var(--border))] lg:mx-auto lg:max-w-5xl">
        <div className="grid divide-x divide-[hsl(var(--border))] sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="px-8 py-6 text-center">
              <p className="text-[1.75rem] font-extrabold tracking-tight text-[hsl(var(--foreground))]">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--muted))]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Submission form */}
      <div id="analyze" className="px-6 pb-16 lg:pb-20">
        <ResumeAnalysisCard />
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-7 shadow-panel">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">
              Start an analysis
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
              Paste a repository URL or upload a manifest
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted))]">
              Analysis typically completes in 30–90 seconds.
            </p>
            <div className="mt-5">
              <CreateAnalysisForm />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {manifestFormats.map((fmt) => (
                <span
                  key={fmt}
                  className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-2 py-0.5 font-mono text-[11px] text-[hsl(var(--muted))]"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features grid */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
            What you get
          </div>
          <h2 className="mb-3 text-center text-[1.75rem] font-bold tracking-tight text-[hsl(var(--foreground))]">
            End-to-end supply chain clarity
          </h2>
          <p className="mx-auto mb-12 max-w-md text-center text-sm leading-6 text-[hsl(var(--muted))]">
            From raw manifest to scored dependency tree — in under two minutes.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 transition-colors hover:border-[hsl(var(--accent)/0.35)] hover:bg-[hsl(var(--accent)/0.04)]"
                >
                  <div
                    className={`mb-4 flex h-9 w-9 items-center justify-center rounded-[9px] ${f.color}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-5 text-[hsl(var(--muted))]">
                    {f.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quick links strip */}
      <section className="border-t border-[hsl(var(--border))] px-6 py-10">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            {
              href: "/repositories",
              num: "01",
              title: "Repository overview",
              body: "Rank tracked repositories and package snapshots by maintenance signal.",
            },
            {
              href: "/docs",
              num: "02",
              title: "Docs",
              body: "Where the data comes from, how features are engineered, and what each one means.",
            },
            {
              href: "/docs/ml",
              num: "03",
              title: "ML explained",
              body: "How the model is evaluated and how much to trust an individual score.",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5 transition-all hover:border-[hsl(var(--accent)/0.4)] hover:bg-[hsl(var(--accent)/0.04)]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-xs text-[hsl(var(--muted))]">
                  {item.num}
                </span>
                <ArrowRight className="h-4 w-4 text-[hsl(var(--muted))] transition group-hover:translate-x-0.5 group-hover:text-[hsl(var(--accent))]" />
              </div>
              <div className="mt-8">
                <h2 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                  {item.title}
                </h2>
                <p className="mt-2 text-[13px] leading-5 text-[hsl(var(--muted))]">
                  {item.body}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer strip */}
      <footer className="border-t border-[hsl(var(--border))]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <p className="text-xs text-[hsl(var(--muted))]">
            OSS Risk Radar · Decision support, not definitive trust scores.
          </p>
          <div className="flex flex-wrap gap-5 text-xs text-[hsl(var(--muted))]">
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
              Repository and manifest intake
            </span>
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
              Dependency graph context
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
              Review-first risk framing
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
