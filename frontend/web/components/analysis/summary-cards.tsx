import type { AnalysisRecord } from "@oss-risk-radar/schemas";

import { Card } from "@/components/ui/card";
import { formatScore } from "@/lib/format";

export function SummaryCards({ analysis }: { analysis: AnalysisRecord }) {
  const cards = [
    ["Dependencies", analysis.summary.dependencyCount.toString()],
    ["High-risk bucket", analysis.summary.highRiskCount.toString()],
    ["Mapped repositories", analysis.summary.mappedRepositoryCount.toString()],
    ["Score coverage", analysis.summary.scoreAvailabilityCount.toString()]
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <Card key={label} className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">{label}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        </Card>
      ))}
    </div>
  );
}

export function AnalystHighlights({ analysis }: { analysis: AnalysisRecord }) {
  const highest = [...analysis.dependencies]
    .filter((dependency) => dependency.riskProfile)
    .sort((left, right) => (right.riskProfile?.inactivityRiskScore ?? 0) - (left.riskProfile?.inactivityRiskScore ?? 0))
    .slice(0, 3);

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.24em] text-muted">Priority Queue</p>
      <div className="mt-5 space-y-4">
        {highest.map((dependency) => (
          <div key={dependency.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/6 bg-white/5 px-4 py-3">
            <div>
              <div className="font-semibold">{dependency.packageName}</div>
              <div className="text-sm text-muted">
                {dependency.ecosystem} · {dependency.packageVersion}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Inactivity risk</div>
              <div className="text-2xl font-bold">{formatScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
