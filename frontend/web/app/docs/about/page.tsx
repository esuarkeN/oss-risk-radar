import Link from "next/link";

import { InfoChipGroup } from "@/components/info-chip-group";
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
      <Card className="animate-slide-up space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">About</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))] lg:text-3xl">
          What this project is trying to achieve.
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-[hsl(var(--muted))]">
          OSS Risk Radar is a thesis-led prototype for understanding maintenance fragility in open source dependencies
          without collapsing the evidence into a black-box verdict.
        </p>
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
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">Next click</p>
        <p className="text-sm text-[hsl(var(--muted))]">
          Need the exact signals? Open{" "}
          <Link href="/docs/features" className="font-medium text-accent">
            Feature reference
          </Link>
          . Need the model figures? Open{" "}
          <Link href="/docs/ml" className="font-medium text-accent">
            Model performance
          </Link>
          . Need the live repository picture? Open{" "}
          <Link href="/repositories" className="font-medium text-accent">
            Overview
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
