import Link from "next/link";
import { notFound } from "next/navigation";

import { DependencyPathExplorer } from "@/components/dependency-path-explorer";
import { EvidenceList, FactorList, RiskScorePill } from "@/components/analysis/detail-sections";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDependencies, getDependency, getDependencyGraph } from "@/lib/api";
import { formatConfidence, formatDate, formatScore, titleCase } from "@/lib/format";

export default async function DependencyDetailPage({
  params
}: {
  params: Promise<{ id: string; dependencyId: string }>;
}) {
  const { id, dependencyId } = await params;

  try {
    const [dependency, dependencies, graph] = await Promise.all([
      getDependency(dependencyId),
      getDependencies(id),
      getDependencyGraph(id)
    ]);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Dependency Detail</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{dependency.packageName}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {dependency.packageVersion} · {dependency.ecosystem} · {dependency.direct ? "direct" : "transitive"}
            </p>
          </div>
          <Link href={`/analyses/${id}`} className="text-sm uppercase tracking-[0.18em] text-sky-700">
            Back to analysis
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <RiskScorePill dependency={dependency} />
              <Badge tone="neutral">{titleCase(dependency.riskProfile?.actionLevel ?? "monitor")}</Badge>
              {dependency.parsedFromUploadId ? <Badge tone="neutral">Upload provenance attached</Badge> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Security posture</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{formatScore(dependency.riskProfile?.securityPostureScore ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Confidence</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{formatConfidence(dependency.riskProfile?.confidenceScore ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Raw signals</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{dependency.rawSignals?.length ?? 0}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mapped repository</p>
                <p className="mt-2 font-semibold text-slate-950">{dependency.repository?.fullName ?? "Unavailable"}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Last push {dependency.repository ? formatDate(dependency.repository.lastPushAt) : "unknown"}
                </p>
                {dependency.repository?.lastReleaseAt ? (
                  <p className="mt-1 text-sm text-slate-500">Last release {formatDate(dependency.repository.lastReleaseAt)}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Repository facts</p>
                <p className="mt-2 text-sm text-slate-500">
                  {dependency.repository?.stars ?? 0} stars · {dependency.repository?.forks ?? 0} forks · {dependency.repository?.openIssues ?? 0} open issues
                </p>
                <p className="mt-1 text-sm text-slate-500">Archived: {dependency.repository?.archived ? "yes" : "no"}</p>
                {dependency.repository?.recentContributors90d !== undefined ? (
                  <p className="mt-1 text-sm text-slate-500">Recent contributors (90d): {dependency.repository.recentContributors90d}</p>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Coverage and caveats</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {dependency.riskProfile?.missingSignals.length ? (
                  dependency.riskProfile.missingSignals.map((signal) => (
                    <Badge key={signal} tone="neutral">
                      {signal}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="low">No major missing signals in this snapshot</Badge>
                )}
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-500">
                {(dependency.riskProfile?.caveats ?? []).map((caveat) => (
                  <p key={caveat}>{caveat}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Dependency path</p>
              <p className="mt-3 text-sm text-slate-600">{dependency.dependencyPath.join(" -> ")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Graph availability</p>
              <p className="mt-3 text-sm text-slate-600">
                {graph?.nodes.length ?? dependencies.length} nodes and {graph?.edges.length ?? 0} edges are currently available for this analysis context.
              </p>
            </div>
          </Card>
        </div>

        <DependencyPathExplorer dependency={dependency} dependencies={dependencies} graph={graph} />

        <div className="grid gap-4 xl:grid-cols-2">
          <FactorList dependency={dependency} />
          <EvidenceList dependency={dependency} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Scorecard snapshot</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {dependency.scorecard ? `${formatScore(dependency.scorecard.score)} overall` : "No scorecard snapshot attached"}
              </h2>
            </div>
            <div className="space-y-3">
              {dependency.scorecard?.checks.length ? (
                dependency.scorecard.checks.map((check) => (
                  <div key={check.name} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-950">{check.name}</p>
                      <Badge tone={check.score >= 7 ? "low" : check.score >= 4 ? "medium" : "high"}>{formatScore(check.score)}</Badge>
                    </div>
                    <p className="mt-2 leading-6">{check.reason}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Scorecard checks were not present in the current dependency snapshot.
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Raw signal snapshot</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Observable fields used in this profile</h2>
            </div>
            <div className="space-y-3">
              {dependency.rawSignals?.length ? (
                dependency.rawSignals.map((signal) => (
                  <div key={`${signal.key}-${signal.source}`} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-950">{signal.key}</p>
                      <Badge tone="neutral">{signal.source}</Badge>
                    </div>
                    <p className="mt-2">Value: {String(signal.value)}</p>
                    {signal.observedAt ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Observed {formatDate(signal.observedAt)}</p> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Raw signal payloads were not attached to this dependency snapshot.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}

