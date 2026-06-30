"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RiskBadge } from "@/components/risk-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDependency } from "@/lib/api";
import { formatTrainingMetric } from "@/lib/ml-evaluation";
import { dependencyDisplayName, dependencyDisplayVersion, isRepositoryProfile } from "@/lib/repository-profile";
import type { DependencyRecord } from "@/lib/types";
import { formatConfidence, formatOutlookScore, formatRiskScore } from "@/lib/utils";

interface DependencyDetailCardProps {
  dependencyId: string;
}

export function DependencyDetailCard({ dependencyId }: DependencyDetailCardProps) {
  const [dependency, setDependency] = useState<DependencyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const record = await getDependency(dependencyId);
        if (!cancelled) {
          setDependency(record);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dependency detail.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [dependencyId]);

  if (error) {
    return <Card className="text-sm text-[hsl(var(--danger))]">{error}</Card>;
  }

  if (!dependency) {
    return <Card className="text-sm text-muted">Loading dependency detail...</Card>;
  }

  const repositoryProfile = isRepositoryProfile(dependency);
  const modelResults = dependency.riskProfile?.modelResults ?? [];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">{repositoryProfile ? "Repository Rating" : "Dependency Detail"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{dependencyDisplayName(dependency)}</h1>
            <p className="mt-2 text-sm text-muted">
              {repositoryProfile
                ? "Repository profile derived directly from the submitted GitHub URL and live public maintenance signals."
                : `Version ${dependencyDisplayVersion(dependency)} · ${dependency.ecosystem.toUpperCase()} ecosystem`}
            </p>
          </div>
          <div className="space-y-2 text-right">
            <RiskBadge bucket={dependency.riskProfile?.riskBucket ?? "medium"} />
            <p className="text-sm text-muted">Action: {dependency.riskProfile?.actionLevel ?? "pending"}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="bg-panelAlt p-4 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactivity Risk</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{formatRiskScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</p>
          </Card>
          <Card className="bg-panelAlt p-4 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">12m Outlook</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0)}</p>
          </Card>
          <Card className="bg-panelAlt p-4 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Security Posture</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{formatRiskScore(dependency.riskProfile?.securityPostureScore ?? 0)}</p>
          </Card>
          <Card className="bg-panelAlt p-4 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Confidence</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{formatConfidence(dependency.riskProfile?.confidenceScore ?? 0)}</p>
          </Card>
        </div>
      </Card>

      {modelResults.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Model Outputs · This Repository</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Side-by-side ML scoring</h2>
            <p className="mt-1 text-sm text-muted">Each model&apos;s scores for this repository. Global model-quality metrics live in &ldquo;About this model&rdquo; below.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {modelResults.map((result) => (
              <div key={result.modelName} className="rounded-xl border border-line bg-panelAlt p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{result.modelName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{result.algorithm || "model"} {result.modelVersion ?? ""}</p>
                  </div>
                  <Badge tone={result.riskBucket}>{result.riskBucket}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted">Risk</p>
                    <p className="font-semibold text-foreground">{formatRiskScore(result.inactivityRiskScore)}</p>
                  </div>
                  <div>
                    <p className="text-muted">12m outlook</p>
                    <p className="font-semibold text-foreground">{formatOutlookScore(result.maintenanceOutlook12mScore)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Security</p>
                    <p className="font-semibold text-foreground">{formatRiskScore(result.securityPostureScore)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Confidence</p>
                    <p className="font-semibold text-foreground">{formatConfidence(result.confidenceScore)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {modelResults.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">About this model</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Global model quality</h2>
            <p className="mt-1 text-sm text-muted">
              These are held-out evaluation metrics for the model overall — the same for every repository it scores. They tell you how much to trust the model in general, not this specific prediction. See the{" "}
              <Link href="/methodology" className="text-accent transition hover:text-foreground">methodology</Link> for definitions.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="pb-3 pr-4">Model</th>
                  <th className="pb-3 pr-4">AUROC</th>
                  <th className="pb-3 pr-4">Brier</th>
                  <th className="pb-3 pr-4">ECE</th>
                  <th className="pb-3 pr-4">Samples</th>
                </tr>
              </thead>
              <tbody>
                {modelResults.map((result) => (
                  <tr key={result.modelName} className="border-b border-line/70 last:border-b-0">
                    <td className="py-3 pr-4 font-semibold text-foreground">
                      {result.modelName}
                      {result.modelVersion ? <span className="ml-2 text-xs font-medium text-muted">{result.modelVersion}</span> : null}
                    </td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(result.rocAuc)}</td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(result.brierScore)}</td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(result.expectedCalibrationError)}</td>
                    <td className="py-3 pr-4 text-foreground">{result.sampleCount || "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Explanation Factors</h2>
          <div className="space-y-2">
            {dependency.riskProfile?.explanationFactors.map((factor) => (
              <div key={`${factor.label}-${factor.detail}`} className="rounded-xl border border-line bg-panelAlt p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-foreground">{factor.label}</p>
                  <span className="text-xs uppercase tracking-[0.24em] text-muted">{factor.direction}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{factor.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Repository Facts</h2>
            <dl className="grid gap-2.5 text-sm text-muted">
              <div className="flex justify-between gap-4"><dt>Repository</dt><dd className="font-medium text-foreground">{dependency.repository?.fullName ?? "Unavailable"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Archived</dt><dd className="font-medium text-foreground">{dependency.repository?.archived ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Stars</dt><dd className="font-medium text-foreground">{dependency.repository?.stars ?? "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Open issues</dt><dd className="font-medium text-foreground">{dependency.repository?.openIssues ?? "-"}</dd></div>
            </dl>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Evidence</h2>
            <div className="space-y-2 text-sm text-muted">
              {dependency.riskProfile?.evidence.map((item) => (
                <div key={`${item.signal}-${item.observedAt}`} className="rounded-xl border border-line bg-panelAlt p-4">
                  <p className="font-medium text-foreground">{item.signal}</p>
                  <p className="mt-1">{item.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted">{item.source}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Caveats</h2>
          <div className="space-y-2 text-sm text-muted">
            {dependency.riskProfile?.caveats.map((caveat) => (
              <p key={caveat}>{caveat}</p>
            ))}
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Coverage Gaps</h2>
          <div className="space-y-2 text-sm text-muted">
            {dependency.riskProfile?.missingSignals.map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
            <p className="pt-2">Dependency path and raw signal snapshot expansion are planned next.</p>
          </div>
        </Card>
      </div>

      <Link href={`/analyses/${dependency.analysisId}`} className="inline-flex text-sm font-medium text-accent transition hover:text-foreground">
        ← Back to analysis overview
      </Link>
    </div>
  );
}
