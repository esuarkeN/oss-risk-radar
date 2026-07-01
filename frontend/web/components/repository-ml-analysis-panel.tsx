"use client";

import { Activity, ShieldQuestion, Target, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { featureDocByKey } from "@/lib/feature-catalog";
import { useCountUp } from "@/lib/use-count-up";
import { formatTrainingRate, selectCoefficientArtifact, selectScoringArtifact } from "@/lib/ml-evaluation";
import { confidenceFromAnalysis, confidenceFromStats, type ConfidenceComponent } from "@/lib/ml-prediction-confidence";
import { NON_EVIDENTIAL_FEATURES, repositoryFeatureStats, repositoryModelAnalysis, type RepositoryVariableImpact } from "@/lib/ml-repository-analysis";
import type { DependencyRecord } from "@/lib/types";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";

function formatImpact(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

// Features the model consumes on a log1p scale. The stored value/cohort mean are in log space,
// so we invert with expm1 to show the real count a developer recognizes (e.g. 572, not 6.4).
const LOG1P_FEATURES = new Set(["stars_log1p", "forks_log1p", "open_issues_log1p"]);

type ValueScale = "real" | "model";

// "real" de-logs log1p features into recognizable counts; "model" shows the raw value the model
// consumes (log1p for those features). Non-log features are identical under both.
function driverValue(feature: string, value: number, scale: ValueScale) {
  return scale === "real" && LOG1P_FEATURES.has(feature) ? Math.expm1(value) : value;
}

function ScaleToggle({ value, onChange }: { value: ValueScale; onChange: (next: ValueScale) => void }) {
  const options: { id: ValueScale; label: string }[] = [
    { id: "real", label: "Real values" },
    { id: "model", label: "Model input" },
  ];
  return (
    <div className="inline-flex shrink-0 rounded-md border border-line bg-panelAlt p-0.5 text-[11px] font-medium">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`rounded px-2 py-0.5 transition-colors ${value === option.id ? "bg-panel text-foreground" : "text-muted hover:text-foreground"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatPercent(value: number | null) {
  return value == null ? "N/A" : `${Math.round(value * 100)}%`;
}

function positionWord(standardizedValue: number) {
  if (standardizedValue >= 1.5) return "well above typical";
  if (standardizedValue >= 0.5) return "above typical";
  if (standardizedValue > -0.5) return "near typical";
  if (standardizedValue > -1.5) return "below typical";
  return "well below typical";
}

function scoreTone(value: number | null) {
  if (value == null) return "neutral" as const;
  if (value >= 0.66) return "low" as const;
  if (value >= 0.33) return "medium" as const;
  return "high" as const;
}

function scoreBarColor(value: number | null) {
  if (value == null) return "hsl(var(--muted))";
  if (value >= 0.66) return "hsl(var(--success))";
  if (value >= 0.33) return "hsl(var(--warning))";
  return "hsl(var(--danger))";
}

function ConfidenceBar({ component }: { component: ConfidenceComponent }) {
  const pct = component.value;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{component.label}</span>
        <span className="font-mono text-xs font-semibold text-foreground">{formatPercent(pct)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panelAlt">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct == null ? 0 : Math.round(pct * 100)}%`, backgroundColor: scoreBarColor(pct) }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted">{component.detail}</p>
    </div>
  );
}

function SectionHeading({ icon, eyebrow, title }: { icon: ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
    </div>
  );
}

function featureTooltipContent(feature: string): ReactNode {
  const doc = featureDocByKey[feature];
  if (!doc) {
    return null;
  }
  return (
    <>
      <span className="block font-semibold text-foreground">{doc.label} · {doc.window}</span>
      <span className="mt-1 block">{doc.definition}</span>
      <span className="mt-1 block italic">Why: {doc.rationale}</span>
    </>
  );
}

export function RepositoryMlAnalysisPanel({ dependency }: { dependency: DependencyRecord | null }) {
  const { runs, loading } = useMlEvaluationState();
  const preferredModelNames = useMemo(
    () => (dependency?.riskProfile?.modelResults ?? []).map((result) => result.modelName),
    [dependency?.riskProfile?.modelResults],
  );
  // The impact view is a logistic decomposition, so bind to the logistic artifact that actually
  // scored this repo — not whatever model ran last (which may be XGBoost with no coefficients).
  const logisticArtifact = useMemo(
    () => selectCoefficientArtifact(runs, preferredModelNames),
    [runs, preferredModelNames],
  );
  const modelAnalysis = useMemo(
    () => (dependency ? repositoryModelAnalysis(dependency, logisticArtifact) : null),
    [dependency, logisticArtifact],
  );
  // Fallback for tree-only deployments: no logistic coefficients, but a tree artifact still has a
  // standardization profile + calibration bins, so coverage / in-distribution / calibration support
  // (and the repo's score-derived probability) remain meaningful even without the impact chart.
  const fallbackArtifact = useMemo(
    () => (modelAnalysis ? null : selectScoringArtifact(runs, preferredModelNames)),
    [modelAnalysis, runs, preferredModelNames],
  );
  const fallbackStats = useMemo(
    () => (dependency && fallbackArtifact ? repositoryFeatureStats(dependency, fallbackArtifact) : null),
    [dependency, fallbackArtifact],
  );
  const fallbackProbability = useMemo(() => {
    if (!fallbackArtifact) {
      return null;
    }
    const match = (dependency?.riskProfile?.modelResults ?? []).find((result) => result.modelName === fallbackArtifact.modelName);
    const score = match?.inactivityRiskScore ?? dependency?.riskProfile?.inactivityRiskScore;
    return score != null ? score / 100 : null;
  }, [fallbackArtifact, dependency?.riskProfile]);
  const confidence = useMemo(() => {
    if (modelAnalysis && logisticArtifact) {
      return confidenceFromAnalysis(modelAnalysis, logisticArtifact);
    }
    if (fallbackStats && fallbackArtifact && fallbackProbability != null) {
      return confidenceFromStats(fallbackStats, fallbackProbability, fallbackArtifact);
    }
    return null;
  }, [modelAnalysis, logisticArtifact, fallbackStats, fallbackArtifact, fallbackProbability]);
  const [valueScale, setValueScale] = useState<ValueScale>("real");
  const probabilityValue = modelAnalysis?.calibratedProbability ?? fallbackProbability ?? null;
  // Count-up animations must run before any early return to keep hook order stable.
  const animatedProbability = useCountUp(probabilityValue ?? 0);
  const animatedConfidence = useCountUp(confidence?.rollup ?? 0);

  if (!dependency?.repository) {
    return null;
  }

  const modelResults = dependency.riskProfile?.modelResults ?? [];
  const hasImpacts = Boolean(modelAnalysis);
  const featureRows: { feature: string; label: string; observed: boolean }[] = modelAnalysis?.impacts ?? fallbackStats ?? [];
  const topImpacts = modelAnalysis?.impacts.slice(0, 8) ?? [];
  const topDrivers = modelAnalysis?.impacts.filter((impact) => impact.direction !== "neutral").slice(0, 4) ?? [];
  const missingSignals = featureRows.filter(
    (row) => !NON_EVIDENTIAL_FEATURES.has(row.feature) && !row.observed,
  );

  return (
    <section className="grid animate-slide-up gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">ML Analysis · This Repository</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{dependency.repository.fullName}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={modelResults.length || modelAnalysis || confidence ? "low" : "neutral"}>{modelResults.length ? "Analysis scored" : modelAnalysis || confidence ? "Model ready" : loading ? "Loading" : "No artifact"}</Badge>
            <Badge tone="neutral">ML maintenance model</Badge>
          </div>
        </div>

        {/* Beat 1 — the answer */}
        <div className="rounded-[1.25rem] border border-line bg-panelAlt/70 px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Inactivity-risk probability</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                {probabilityValue != null ? formatTrainingRate(animatedProbability) : "Pending"}
              </p>
            </div>
            {confidence ? (
              <div className="flex flex-col items-end gap-1.5">
                <Badge tone={confidence.marginLabel === "Decisive" ? "low" : confidence.marginLabel === "Borderline" ? "medium" : "neutral"}>
                  {confidence.marginLabel}
                </Badge>
                <span className="text-[11px] text-muted">{formatTrainingRate(confidence.marginToThreshold)} margin</span>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3.5" aria-hidden="true" />
              Rule-based score {formatTrainingRate((dependency.riskProfile?.inactivityRiskScore ?? 0) / 100)} · {dependency.riskProfile?.riskBucket ?? "unscored"}
            </span>
          </div>
        </div>

        {/* Beat 2 — prediction confidence */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading
              icon={<ShieldQuestion className="size-4" aria-hidden="true" />}
              eyebrow="How much to trust this score"
              title="Prediction confidence"
            />
            {confidence ? (
              <div className="text-right">
                <p className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color: scoreBarColor(confidence.rollup) }}>
                  {formatPercent(animatedConfidence)}
                </p>
                <Badge tone={scoreTone(confidence.rollup)}>{confidence.rollup >= 0.66 ? "Solid" : confidence.rollup >= 0.33 ? "Limited" : "Weak"}</Badge>
              </div>
            ) : null}
          </div>
          {confidence ? (
            <div className="space-y-3.5">
              {confidence.components.map((component) => (
                <ConfidenceBar key={component.key} component={component} />
              ))}
              <p className="text-[11px] leading-5 text-muted">
                Confidence combines these per-repository factors — it reflects the evidence available for <em>this</em> repo, not the model&apos;s overall accuracy.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Run a completed training artifact to compute per-prediction confidence.</p>
          )}
        </div>

        {/* Beat 4 — what's missing */}
        {missingSignals.length ? (
          <div className="rounded-[1.25rem] border border-line bg-panelAlt/70 px-4 py-4">
            <SectionHeading
              icon={<TriangleAlert className="size-4" aria-hidden="true" />}
              eyebrow="Data quality"
              title={`${missingSignals.length} expected signals missing`}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {missingSignals.slice(0, 10).map((impact) =>
                featureDocByKey[impact.feature] ? (
                  <InfoTooltip
                    key={impact.feature}
                    content={featureTooltipContent(impact.feature)}
                    className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted"
                  >
                    {impact.label}
                  </InfoTooltip>
                ) : (
                  <span key={impact.feature} className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted">
                    {impact.label}
                  </span>
                ),
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              These were imputed to the cohort average, so they contribute no evidence and cap the confidence above.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Beat 3 — what drove the score */}
      <Card className="flex flex-col">
        <div className="mb-4 shrink-0 space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Variable Impact</p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">What drove this repo&apos;s score</h2>
          {hasImpacts ? (
            <p className="text-sm text-muted">Each bar shows how much a signal moved this repository&apos;s risk. Red pushes the risk up; green pulls it down. A few strong green signals of healthy maintenance can outweigh many weak red ones.</p>
          ) : (
            <p className="text-sm text-muted">Per-signal breakdown of this repository&apos;s score.</p>
          )}
          <Link href="/docs" className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:text-foreground">
            How to read this →
          </Link>
        </div>
        {topImpacts.length ? (
          <>
            <div className="h-[260px] min-h-0 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topImpacts} layout="vertical" margin={{ left: 18, right: 18 }}>
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border) / 0.6)" />
                  <XAxis type="number" tickLine={false} axisLine={false} stroke="hsl(var(--muted))" tickFormatter={(value) => Number(value).toFixed(1)} />
                  <YAxis dataKey="label" type="category" width={150} tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
                  <Tooltip
                    formatter={(value) => formatImpact(Number(value ?? 0))}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      borderRadius: 18,
                      borderColor: "hsl(var(--border))",
                      backgroundColor: "hsl(var(--panel))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="impact" name="Local impact" radius={[8, 8, 8, 8]}>
                    {topImpacts.map((impact) => (
                      <Cell key={impact.feature} fill={impact.impact >= 0 ? "hsl(var(--danger))" : "hsl(var(--success))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {topDrivers.length ? (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading icon={<Target className="size-4" aria-hidden="true" />} eyebrow="Top drivers in plain terms" title="Read against the training cohort" />
                  <ScaleToggle value={valueScale} onChange={setValueScale} />
                </div>
                <div className="mt-2 grid gap-2">
                  {topDrivers.map((impact: RepositoryVariableImpact) => (
                    <div key={impact.feature} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        {featureDocByKey[impact.feature] ? (
                          <InfoTooltip content={featureTooltipContent(impact.feature)}>
                            <span className="font-medium text-foreground">{impact.label}</span>
                          </InfoTooltip>
                        ) : (
                          <p className="truncate font-medium text-foreground">{impact.label}</p>
                        )}
                        <p className="text-xs text-muted">
                          {formatValue(driverValue(impact.feature, impact.value, valueScale))} (typical ≈ {formatValue(driverValue(impact.feature, impact.cohortReference, valueScale))}) · {positionWord(impact.standardizedValue)}
                          {impact.observed ? "" : " · imputed"}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.12em] ${impact.direction === "raises" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]"}`}>
                        {impact.direction} risk
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : fallbackArtifact ? (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-line bg-panelAlt/70 px-6 text-center text-sm text-muted">
            <TriangleAlert className="size-5 text-[hsl(var(--warning))]" aria-hidden="true" />
            <p className="font-medium text-foreground">Per-signal breakdown isn&apos;t available for this score</p>
            <p className="max-w-sm text-xs leading-5">
              This repository&apos;s score doesn&apos;t expose a per-signal breakdown. The probability, confidence, and
              data-quality summary on the left still apply.
            </p>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-[1.25rem] border border-dashed border-line bg-panelAlt/70 px-4 text-center text-sm text-muted">
            No coefficient impact is available for the selected repository yet.
          </div>
        )}
      </Card>
    </section>
  );
}
