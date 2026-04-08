import Link from "next/link";

import type { DependencyRecord } from "@oss-risk-radar/schemas";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatScore, titleCase } from "@/lib/format";

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
      <div className="text-sm text-slate-500">
        <span className="font-semibold text-slate-950">{formatScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</span> inactivity risk
      </div>
    </div>
  );
}

export function FactorList({ dependency }: { dependency: DependencyRecord }) {
  const factors = dependency.riskProfile?.explanationFactors ?? [];

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Explanation Factors</p>
      <div className="mt-4 space-y-3">
        {factors.length ? (
          factors.map((factor) => (
            <div key={`${factor.label}-${factor.detail}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950">{factor.label}</h3>
                <Badge tone={factor.direction === "increase" ? "critical" : factor.direction === "decrease" ? "low" : "neutral"}>
                  {titleCase(factor.direction)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">{factor.detail}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">Weight {formatScore(factor.weight)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
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
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Evidence and Provenance</p>
      <div className="mt-4 space-y-3">
        {evidence.length ? (
          evidence.map((item) => (
            <div key={`${item.signal}-${item.observedAt}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-950">{item.signal}</span>
                <span className="text-slate-500">{item.source}</span>
              </div>
              <p className="mt-2 text-slate-600">Observed value: {item.value}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Observed {formatDate(item.observedAt)}</p>
              {item.provenanceUrl ? (
                <Link href={item.provenanceUrl} target="_blank" className="mt-3 inline-flex text-xs uppercase tracking-[0.18em] text-sky-700">
                  Open source reference
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No evidence items were attached to this dependency snapshot yet.
          </div>
        )}
      </div>
    </Card>
  );
}

