import Link from "next/link";

import type { DependencyRecord } from "@oss-risk-radar/schemas";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatOutlookScore, formatScore, titleCase } from "@/lib/format";

function toneForBucket(bucket?: string) {
  if (bucket === "low" || bucket === "medium" || bucket === "high" || bucket === "critical") {
    return bucket;
  }
  return "neutral";
}

export function RiskScorePill({ dependency }: { dependency: DependencyRecord }) {
  return (
    <div className="flex items-center gap-3">
      <Badge tone={toneForBucket(dependency.riskProfile?.riskBucket)}>
        {dependency.riskProfile?.riskBucket ?? "unscored"}
      </Badge>
      <div className="text-sm text-muted">
        <span className="font-semibold text-foreground">{formatScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</span> inactivity risk
      </div>
      <div className="text-sm text-muted">
        <span className="font-semibold text-foreground">{formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0)}</span> 12m outlook
      </div>
    </div>
  );
}

export function FactorList({ dependency }: { dependency: DependencyRecord }) {
  const factors = dependency.riskProfile?.explanationFactors ?? [];

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.24em] text-muted">Explanation Factors</p>
      <div className="mt-4 space-y-2">
        {factors.length ? (
          factors.map((factor) => (
            <div key={`${factor.label}-${factor.detail}`} className="rounded-xl border border-line bg-panelAlt p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-foreground">{factor.label}</h3>
                <Badge tone={factor.direction === "increase" ? "critical" : factor.direction === "decrease" ? "low" : "neutral"}>
                  {titleCase(factor.direction)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{factor.detail}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">Weight {formatScore(factor.weight)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            No explanation factors were attached to this dependency snapshot.
          </div>
        )}
      </div>
    </Card>
  );
}

export function EvidenceList({ dependency }: { dependency: DependencyRecord }) {
  const evidence = dependency.riskProfile?.evidence ?? [];

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.24em] text-muted">Evidence and Provenance</p>
      <div className="mt-4 space-y-2">
        {evidence.length ? (
          evidence.map((item) => (
            <div key={`${item.signal}-${item.observedAt}`} className="rounded-xl border border-line bg-panelAlt p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground">{item.signal}</span>
                <span className="text-muted">{item.source}</span>
              </div>
              <p className="mt-2 text-muted">Observed value: {item.value}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">Observed {formatDate(item.observedAt)}</p>
              {item.provenanceUrl ? (
                <Link href={item.provenanceUrl} target="_blank" className="mt-3 inline-flex text-xs uppercase tracking-[0.18em] text-accent transition hover:text-foreground">
                  Open source reference
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            No evidence items were attached to this dependency snapshot yet.
          </div>
        )}
      </div>
    </Card>
  );
}
