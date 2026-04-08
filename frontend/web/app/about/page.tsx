import Link from "next/link";

import { InfoChipGroup } from "@/components/info-chip-group";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { productGlossary } from "@/lib/metric-glossary";

const pillars = [
  "Decision support, not a trust score.",
  "Public signals, not hidden judgments.",
  "Research traceability, not vague claims.",
  "Operational triage, not scanner-style noise.",
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">About</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">What this project is trying to achieve.</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">OSS Risk Radar is a thesis-led prototype for understanding maintenance fragility in open source dependencies without collapsing the evidence into a black-box verdict.</p>
        <InfoChipGroup items={productGlossary} />
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => (
          <Card key={pillar} className="space-y-2">
            <p className="text-lg font-semibold text-foreground">{pillar}</p>
          </Card>
        ))}
      </section>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Next click</p>
        <p className="text-sm text-muted">
          Need the exact signals? Open <Link href="/methodology" className="font-medium text-accent">Methodology</Link>. Need the model figures? Open <Link href="/ml-evaluation" className="font-medium text-accent">ML Results</Link>. Need the live repository picture? Open <Link href="/repositories" className="font-medium text-accent">Overview</Link>.
        </p>
      </Card>
    </>
  );
}