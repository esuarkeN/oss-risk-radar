import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { SubmissionForm } from "@/components/submission-form";
import { InfoChipGroup } from "@/components/info-chip-group";
import { Card } from "@/components/ui/card";
import { productGlossary } from "@/lib/metric-glossary";

const landingCards = [
  { title: "Repo overview", body: "See tracked repos, inactivity windows, and package performance in one page.", href: "/repositories" },
  { title: "Methodology", body: "Inspect the signals behind the current heuristic layer.", href: "/methodology" },
  { title: "ML results", body: "Review AUROC, Brier score, calibration, and coefficient views.", href: "/ml-evaluation" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-5 overflow-hidden border-line bg-[linear-gradient(135deg,#081120_0%,#0f2740_48%,#0a6b72_100%)] text-white">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Explainable OSS dependency triage</p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-5xl">
              Track fragile repos, inspect signals, and grow the training base as new analyses land.
            </h1>
            <p className="max-w-2xl text-sm text-slate-200">Short path, clear evidence, no fake certainty.</p>
          </div>
          <InfoChipGroup items={productGlossary} />
          <div className="grid gap-4 md:grid-cols-3">
            {landingCards.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4 backdrop-blur transition hover:bg-white/15">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-2 text-sm text-slate-200">{item.body}</p>
              </Link>
            ))}
          </div>
        </Card>
        <SubmissionForm />
      </section>
    </>
  );
}