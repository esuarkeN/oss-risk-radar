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
    return <Card className="text-sm text-rose-700">{error}</Card>;
  }

  if (!dependency) {
    return <Card className="text-sm text-slate-500">Loading dependency detail...</Card>;
  }

  const repositoryProfile = isRepositoryProfile(dependency);
  const modelResults = dependency.riskProfile?.modelResults ?? [];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{repositoryProfile ? "Repository Rating" : "Dependency Detail"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{dependencyDisplayName(dependency)}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {repositoryProfile
                ? "Repository profile derived directly from the submitted GitHub URL and live public maintenance signals."
                : `Version ${dependencyDisplayVersion(dependency)} · ${dependency.ecosystem.toUpperCase()} ecosystem`}
            </p>
          </div>
          <div className="space-y-2 text-right">
            <RiskBadge bucket={dependency.riskProfile?.riskBucket ?? "medium"} />
            <p className="text-sm text-slate-600">Action: {dependency.riskProfile?.actionLevel ?? "pending"}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-slate-50 p-5 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Inactivity Risk</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{formatRiskScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</p>
          </Card>
          <Card className="bg-slate-50 p-5 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">12m Outlook</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0)}</p>
          </Card>
          <Card className="bg-slate-50 p-5 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Security Posture</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{formatRiskScore(dependency.riskProfile?.securityPostureScore ?? 0)}</p>
          </Card>
          <Card className="bg-slate-50 p-5 shadow-none">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Confidence</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{formatConfidence(dependency.riskProfile?.confidenceScore ?? 0)}</p>
          </Card>
        </div>
      </Card>

      {modelResults.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Model Outputs</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Side-by-side ML scoring</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {modelResults.map((result) => (
              <div key={result.modelName} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{result.modelName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{result.algorithm || "model"} {result.modelVersion ?? ""}</p>
                  </div>
                  <Badge tone={result.riskBucket}>{result.riskBucket}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Risk</p>
                    <p className="font-semibold text-slate-950">{formatRiskScore(result.inactivityRiskScore)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">12m outlook</p>
                    <p className="font-semibold text-slate-950">{formatOutlookScore(result.maintenanceOutlook12mScore)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Security</p>
                    <p className="font-semibold text-slate-950">{formatRiskScore(result.securityPostureScore)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Confidence</p>
                    <p className="font-semibold text-slate-950">{formatConfidence(result.confidenceScore)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">AUROC</p>
                    <p className="font-semibold text-slate-950">{formatTrainingMetric(result.rocAuc)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Brier</p>
                    <p className="font-semibold text-slate-950">{formatTrainingMetric(result.brierScore)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">ECE</p>
                    <p className="font-semibold text-slate-950">{formatTrainingMetric(result.expectedCalibrationError)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Samples</p>
                    <p className="font-semibold text-slate-950">{result.sampleCount || "Pending"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Explanation Factors</h2>
          <div className="space-y-3">
            {dependency.riskProfile?.explanationFactors.map((factor) => (
              <div key={`${factor.label}-${factor.detail}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-slate-950">{factor.label}</p>
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-500">{factor.direction}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{factor.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Repository Facts</h2>
            <dl className="grid gap-3 text-sm text-slate-600">
              <div className="flex justify-between gap-4"><dt>Repository</dt><dd className="font-medium text-slate-900">{dependency.repository?.fullName ?? "Unavailable"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Archived</dt><dd className="font-medium text-slate-900">{dependency.repository?.archived ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Stars</dt><dd className="font-medium text-slate-900">{dependency.repository?.stars ?? "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Open issues</dt><dd className="font-medium text-slate-900">{dependency.repository?.openIssues ?? "-"}</dd></div>
            </dl>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Evidence</h2>
            <div className="space-y-3 text-sm text-slate-600">
              {dependency.riskProfile?.evidence.map((item) => (
                <div key={`${item.signal}-${item.observedAt}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">{item.signal}</p>
                  <p className="mt-1">{item.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">{item.source}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Caveats</h2>
          <div className="space-y-2 text-sm text-slate-600">
            {dependency.riskProfile?.caveats.map((caveat) => (
              <p key={caveat}>{caveat}</p>
            ))}
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Coverage Gaps</h2>
          <div className="space-y-2 text-sm text-slate-600">
            {dependency.riskProfile?.missingSignals.map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
            <p className="pt-2 text-slate-500">Dependency path and raw signal snapshot expansion are planned next. The current card preserves enough evidence for the mocked triage walkthrough.</p>
          </div>
        </Card>
      </div>

      <Link href={`/analyses/${dependency.analysisId}`} className="inline-flex text-sm font-medium text-sky-700 transition hover:text-sky-900">
        Back to analysis overview
      </Link>
    </div>
  );
}


