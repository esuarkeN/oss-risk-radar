import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EvidenceList, FactorList } from "@/components/analysis/detail-sections";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDependencies, getDependency } from "@/lib/api";
import { formatConfidence, formatDate, formatOutlookScore, formatScore, titleCase } from "@/lib/format";

const BUCKET_SCORE_COLORS: Record<string, string> = {
  critical: "text-[hsl(var(--danger))]",
  high:     "text-[hsl(var(--warning))]",
  medium:   "text-[hsl(354_60%_65%)]",
  low:      "text-[hsl(var(--success))]",
  unscored: "text-[hsl(var(--muted))]",
};

export default async function DependencyDetailPage({
  params
}: {
  params: Promise<{ id: string; dependencyId: string }>;
}) {
  const { id, dependencyId } = await params;

  try {
    const [dependency, dependencies] = await Promise.all([
      getDependency(dependencyId),
      getDependencies(id)
    ]);

    const missingSignals = dependency.riskProfile?.missingSignals ?? [];
    const modelResults = dependency.riskProfile?.modelResults ?? [];
    const bucket = dependency.riskProfile?.riskBucket ?? "unscored";
    const scoreColor = BUCKET_SCORE_COLORS[bucket] ?? BUCKET_SCORE_COLORS.unscored;

    return (
      <WorkspaceLayout>
        <div className="space-y-5">
          {/* Back nav */}
          <Link
            href={`/analyses/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted))] transition hover:text-[hsl(var(--foreground))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to analysis
          </Link>

          {/* Hero bar */}
          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-6">
              {/* Left: package identity */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone={bucket as Parameters<typeof Badge>[0]["tone"]}>{bucket}</Badge>
                  <Badge tone={dependency.direct ? "medium" : "neutral"}>
                    {dependency.direct ? "◆ Direct" : "↳ Transitive"}
                  </Badge>
                  <Badge tone="neutral">{dependency.ecosystem}</Badge>
                  {dependency.parsedFromUploadId && <Badge tone="neutral">Upload-backed</Badge>}
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                  {dependency.packageName}
                </h1>
                <p className="mt-1 font-mono text-sm text-[hsl(var(--muted))]">
                  {dependency.packageVersion}
                  {dependency.repository?.fullName
                    ? ` · ${dependency.repository.fullName}`
                    : ""}
                </p>
                {dependency.riskProfile?.actionLevel && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                    Action: {titleCase(dependency.riskProfile.actionLevel.replace(/_/g, " "))}
                  </p>
                )}
              </div>

              {/* Right: 4 score meters */}
              <div className="flex flex-wrap gap-5 divide-x divide-[hsl(var(--border))]">
                {[
                  {
                    label: "12M Outlook",
                    value: formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0),
                    color: scoreColor,
                  },
                  {
                    label: "Sec. Posture",
                    value: formatScore(dependency.riskProfile?.securityPostureScore ?? 0),
                    color: "text-[hsl(var(--foreground))]",
                  },
                  {
                    label: "Confidence",
                    value: formatConfidence(dependency.riskProfile?.confidenceScore ?? 0),
                    color: "text-[hsl(var(--accent))]",
                  },
                  {
                    label: "Raw Signals",
                    value: String(dependency.rawSignals?.length ?? 0),
                    color: "text-[hsl(var(--foreground))]",
                  },
                ].map(({ label, value, color }, i) => (
                  <div key={label} className={i > 0 ? "pl-5" : ""}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                      {label}
                    </p>
                    <p className={`mt-1 text-3xl font-extrabold tracking-tight ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Two-column body */}
          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            {/* Left column */}
            <div className="space-y-5">
              {/* Repository facts */}
              <Card className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                  Repository Facts
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Full name", dependency.repository?.fullName ?? "Unavailable"],
                    ["Stars", dependency.repository?.stars != null ? dependency.repository.stars.toLocaleString() : "—"],
                    ["Forks", dependency.repository?.forks != null ? dependency.repository.forks.toLocaleString() : "—"],
                    ["Open issues", dependency.repository?.openIssues != null ? dependency.repository.openIssues.toLocaleString() : "—"],
                    ["Last push", dependency.repository ? formatDate(dependency.repository.lastPushAt) : "Unknown"],
                    ...(dependency.repository?.lastReleaseAt
                      ? [["Last release", formatDate(dependency.repository.lastReleaseAt)]]
                      : []),
                    ...(dependency.repository?.recentContributors90d !== undefined
                      ? [["Contributors 90d", String(dependency.repository.recentContributors90d)]]
                      : []),
                    ["Archived", dependency.repository?.archived ? "Yes" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2.5">
                      <p className="text-[10px] text-[hsl(var(--muted))]">{label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[hsl(var(--foreground))]">{value}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Model outputs */}
              {modelResults.length ? (
                <Card className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">Model Outputs</p>
                    <h2 className="mt-1.5 text-base font-bold tracking-tight text-[hsl(var(--foreground))]">
                      Side-by-side scoring
                    </h2>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {modelResults.map((result) => (
                      <div key={result.modelName} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[hsl(var(--foreground))]">
                              {result.modelName.includes("cold-start") ? "Cold-start scoring" : "Full-history scoring"}
                            </p>
                          </div>
                          <Badge tone={result.riskBucket}>{result.riskBucket}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted))]">
                          <p>Outlook <span className="font-semibold text-[hsl(var(--foreground))]">{formatOutlookScore(result.maintenanceOutlook12mScore)}</span></p>
                          <p>Security <span className="font-semibold text-[hsl(var(--foreground))]">{formatScore(result.securityPostureScore)}</span></p>
                          <p>Confidence <span className="font-semibold text-[hsl(var(--foreground))]">{formatConfidence(result.confidenceScore)}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <FactorList dependency={dependency} />
              <EvidenceList dependency={dependency} />
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Coverage & caveats */}
              <Card className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                  Coverage &amp; Caveats
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingSignals.length ? (
                    missingSignals.map((signal) => (
                      <Badge key={signal} tone="neutral">{signal}</Badge>
                    ))
                  ) : (
                    <Badge tone="low">No major missing signals</Badge>
                  )}
                </div>
                {(dependency.riskProfile?.caveats ?? []).length > 0 && (
                  <div className="space-y-2 text-sm leading-6 text-[hsl(var(--muted))]">
                    {(dependency.riskProfile?.caveats ?? []).map((caveat) => (
                      <p key={caveat}>{caveat}</p>
                    ))}
                  </div>
                )}
              </Card>

              {/* OpenSSF Scorecard */}
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                    OpenSSF Scorecard
                  </p>
                  {dependency.scorecard && (
                    <span className={`text-lg font-extrabold ${
                      dependency.scorecard.score >= 7 ? "text-[hsl(var(--success))]"
                        : dependency.scorecard.score >= 4 ? "text-[hsl(var(--warning))]"
                        : "text-[hsl(var(--danger))]"
                    }`}>
                      {formatScore(dependency.scorecard.score)}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {dependency.scorecard?.checks.length ? (
                    dependency.scorecard.checks.map((check) => (
                      <div key={check.name} className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{check.name}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-[hsl(var(--muted))]">{check.reason}</p>
                        </div>
                        <Badge tone={check.score >= 7 ? "low" : check.score >= 4 ? "medium" : "high"}>
                          {formatScore(check.score)}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-5 text-sm text-[hsl(var(--muted))]">
                      No scorecard checks in current snapshot.
                    </div>
                  )}
                </div>
              </Card>

              {/* Raw signals */}
              <Card className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                  Raw Signal Snapshot
                </p>
                <div className="space-y-2">
                  {dependency.rawSignals?.length ? (
                    dependency.rawSignals.slice(0, 12).map((signal) => (
                      <div key={`${signal.key}-${signal.source}`} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{signal.key}</p>
                          <Badge tone="neutral">{signal.source}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted))]">
                          {String(signal.value)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-5 text-sm text-[hsl(var(--muted))]">
                      No raw signals in current snapshot.
                    </div>
                  )}
                  {(dependency.rawSignals?.length ?? 0) > 12 && (
                    <p className="text-xs text-[hsl(var(--muted))]">
                      +{(dependency.rawSignals?.length ?? 0) - 12} more signals
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </WorkspaceLayout>
    );
  } catch {
    notFound();
  }
}
