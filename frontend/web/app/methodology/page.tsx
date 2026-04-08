import Link from "next/link";

import { InfoChipGroup } from "@/components/info-chip-group";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { heuristicSignalGlossary } from "@/lib/metric-glossary";

const rules = [
  "Archived repos push risk up sharply.",
  "Older pushes and releases increase fragility.",
  "Thin maintainer depth increases concentration risk.",
  "Scorecard is context, not proof of trust.",
  "Missing signals lower confidence instead of being hidden.",
];

export default function MethodologyPage() {
  return (
    <>
      <SiteHeader />
      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Methodology</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">The heuristic layer in short form.</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">The MVP scores maintenance fragility using public activity, release, contributor, backlog, and Scorecard-style hygiene signals.</p>
        <InfoChipGroup items={heuristicSignalGlossary} />
      </Card>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {rules.map((rule) => (
          <Card key={rule} className="space-y-2">
            <p className="text-sm font-semibold leading-6 text-foreground">{rule}</p>
          </Card>
        ))}
      </section>
      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Model path</p>
        <p className="text-sm text-muted">The ML layer reuses these signals and evaluates them with calibration-first metrics like Brier score. See <Link href="/ml-evaluation" className="font-medium text-accent">ML Results</Link>.</p>
      </Card>
    </>
  );
}