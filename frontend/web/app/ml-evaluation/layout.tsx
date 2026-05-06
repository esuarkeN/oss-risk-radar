import type { ReactNode } from "react";

import { MlEvaluationSubnav } from "@/components/ml-evaluation-subnav";
import { SiteHeader } from "@/components/site-header";

export default function MlEvaluationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <section className="overflow-hidden rounded-[2rem] border border-line bg-[linear-gradient(135deg,#06111f_0%,#0c2841_48%,#145b66_100%)] px-6 py-7 text-white shadow-soft lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">ML Evaluation Workspace</p>
            <h1 className="max-w-4xl text-3xl font-semibold tracking-tight lg:text-5xl">
              Keep the model story clear: one page for the signal, one for the data, one for the artifacts.
            </h1>
            <p className="max-w-3xl text-sm text-slate-200">
              Overview stays focused on AUROC, Brier, inactivity rate, and calibration. Dataset and Runs hold the deeper inspection views so the workflow stays readable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Overview</p>
              <p className="mt-2 text-sm font-semibold text-white">Live quality snapshot</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Dataset</p>
              <p className="mt-2 text-sm font-semibold text-white">Coverage and feature inventory</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Runs</p>
              <p className="mt-2 text-sm font-semibold text-white">Cached artifacts and splits</p>
            </div>
          </div>
        </div>
      </section>
      <MlEvaluationSubnav />
      {children}
    </>
  );
}
