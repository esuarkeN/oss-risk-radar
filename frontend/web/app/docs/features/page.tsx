import { FeatureGlossary } from "@/components/docs/feature-glossary";
import { Card } from "@/components/ui/card";

export default function FeatureReferencePage() {
  return (
    <Card className="animate-slide-up space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; features</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">The 43 signals behind a score</h1>
        <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
          Every signal, grouped by what it measures, with an exact definition and the reason it is part of the model.
          Search by name, meaning, or reason. These identifiers are the same ones used inside the analysis panel.
        </p>
      </div>
      <FeatureGlossary />
    </Card>
  );
}
