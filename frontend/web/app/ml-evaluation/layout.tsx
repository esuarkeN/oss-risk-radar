import type { ReactNode } from "react";

import { MlEvaluationSubnav } from "@/components/ml-evaluation-subnav";
import { SiteHeader } from "@/components/site-header";

export default function MlEvaluationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <section className="overflow-hidden rounded-lg border border-line bg-panel px-6 py-7 shadow-soft lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">ML Evaluation Workspace</p>
            <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-foreground lg:text-5xl">
              Keep the model story clear: one page for the signal, one for the repos, one for the artifacts.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Overview stays focused on AUROC, Brier, inactivity rate, and calibration. Dataset, Repositories, and Runs hold the deeper inspection views so the workflow stays readable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Overview</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Live quality snapshot</p>
            </div>
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dataset</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Coverage and feature inventory</p>
            </div>
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Repos</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Stars, notes, and activity</p>
            </div>
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Runs</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Cached artifacts and splits</p>
            </div>
          </div>
        </div>
      </section>
      <MlEvaluationSubnav />
      {children}
    </>
  );
}
