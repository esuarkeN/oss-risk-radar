"use client";

import { useEffect, useMemo, useState } from "react";

import { getTrainingDatasetSummary, listAnalyses } from "@/lib/api";
import type {
  AnalysisRecord,
  DependencyRecord,
  TrainingDatasetRepositorySummary,
  TrainingDatasetSummary,
} from "@/lib/types";

export interface RepositoryRollup {
  key: string;
  label: string;
  url?: string;
  source: "analysis" | "training";
  trainingRank?: number;
  archived: boolean;
  packageCount: number;
  analysisCount: number;
  snapshotCount?: number;
  labeledSnapshotCount?: number;
  inactiveLabelCount?: number;
  inactiveRate?: number;
  lastPushAt?: string;
  lastPushAgeDays?: number;
  lastObservedAt?: string;
  avgOutlook12m: number;
  avgRisk: number;
  avgSecurity: number;
  avgConfidence: number;
  scorecardScore?: number;
  recentContributors90d?: number;
}

export interface PackageRollup {
  key: string;
  packageName: string;
  ecosystem: string;
  analysisCount: number;
  versionCount: number;
  avgOutlook12m: number;
  avgRisk: number;
  avgSecurity: number;
  maxRisk: number;
  mappedRepositories: number;
  lastSeenAt?: string;
}

export interface DependencyRankingRow {
  key: string;
  analysisId: string;
  dependencyId: string;
  packageName: string;
  packageVersion: string;
  ecosystem: string;
  repositoryName?: string;
  outlook12m: number;
  risk: number;
  confidence: number;
}

export const timeframeOptions = [90, 180, 365] as const;
export type Timeframe = (typeof timeframeOptions)[number];
export type ActivityStatus = "active" | "inactive" | "unknown";
export type GradeTone = "low" | "medium" | "high" | "critical";

export function daysSince(date?: string) {
  if (!date) {
    return null;
  }

  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function repositoryAgeDays(repository: RepositoryRollup) {
  return repository.lastPushAgeDays ?? daysSince(repository.lastPushAt);
}

export function repositoryActivityStatus(repository: RepositoryRollup, timeframeDays: number): ActivityStatus {
  if (repository.archived) {
    return "inactive";
  }

  const ageDays = repositoryAgeDays(repository);
  if (ageDays === null) {
    return "unknown";
  }

  return ageDays > timeframeDays ? "inactive" : "active";
}

function trainingInactiveRate(repository: TrainingDatasetRepositorySummary) {
  if (repository.labeledSnapshotCount <= 0) {
    return 0;
  }
  return repository.inactiveLabelCount / repository.labeledSnapshotCount;
}

/** Map an inactivity-risk score (0–100, higher = more fragile) to a plain-language grade badge. */
export function riskGrade(score: number): { label: string; tone: GradeTone } {
  if (score >= 75) return { label: "Critical", tone: "critical" };
  if (score >= 50) return { label: "High", tone: "high" };
  if (score >= 25) return { label: "Medium", tone: "medium" };
  return { label: "Low", tone: "low" };
}

/** Where a repository entered the radar: a user's analysis submission, or the model's training base. */
export function sourceBadge(source: RepositoryRollup["source"]): { label: string; tone: "neutral" | "low" } {
  return source === "training"
    ? { label: "Training data", tone: "neutral" }
    : { label: "User-submitted", tone: "low" };
}

export interface RepositoryRadarData {
  analyses: AnalysisRecord[];
  dataset: TrainingDatasetSummary | null;
  error: string | null;
  loading: boolean;
  dependencies: DependencyRecord[];
  repositoryRows: RepositoryRollup[];
  packageRows: PackageRollup[];
  dependencyRows: DependencyRankingRow[];
  leaderboard: RepositoryRollup[];
}

/**
 * Single source of truth for the repository radar. Fetches completed analyses and the training
 * dataset summary, then merges both into the ranked rollups that the overview page and the full
 * directory page both render.
 */
export function useRepositoryRadarData(): RepositoryRadarData {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [dataset, setDataset] = useState<TrainingDatasetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [analysisResponse, datasetSummary] = await Promise.all([
          listAnalyses(),
          getTrainingDatasetSummary().catch(() => null),
        ]);

        if (cancelled) {
          return;
        }

        setAnalyses(analysisResponse.analyses.filter((analysis) => analysis.status === "completed" && analysis.submission.kind !== "demo"));
        setDataset(datasetSummary);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load repository overview.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const dependencies = useMemo(() => analyses.flatMap((analysis) => analysis.dependencies ?? []), [analyses]);

  const analysisRepositoryRows = useMemo<RepositoryRollup[]>(() => {
    const buckets = new Map<string, DependencyRecord[]>();
    for (const dependency of dependencies) {
      if (!dependency.repository?.fullName) {
        continue;
      }

      const key = dependency.repository.url || dependency.repository.fullName;
      const current = buckets.get(key) ?? [];
      current.push(dependency);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .map(([key, items]) => {
        const repository = items[0]?.repository;
        const outlookValues = items.map((item) => item.riskProfile?.maintenanceOutlook12mScore ?? 0);
        const riskValues = items.map((item) => item.riskProfile?.inactivityRiskScore ?? 0);
        const securityValues = items.map((item) => item.riskProfile?.securityPostureScore ?? 0);
        const confidenceValues = items.map((item) => item.riskProfile?.confidenceScore ?? 0);
        const scorecardValues = items
          .map((item) => item.scorecard?.score)
          .filter((value): value is number => typeof value === "number");
        const analysisCount = new Set(items.map((item) => item.analysisId)).size;
        const packageCount = new Set(items.map((item) => `${item.ecosystem}|${item.packageName}`)).size;

        return {
          key,
          label: repository?.fullName ?? key,
          url: repository?.url,
          source: "analysis",
          archived: repository?.archived ?? false,
          packageCount,
          analysisCount,
          lastPushAt: repository?.lastPushAt,
          avgOutlook12m: average(outlookValues),
          avgRisk: average(riskValues),
          avgSecurity: average(securityValues),
          avgConfidence: average(confidenceValues),
          scorecardScore: scorecardValues.length ? average(scorecardValues) : undefined,
          recentContributors90d: repository?.recentContributors90d,
        } satisfies RepositoryRollup;
      })
      .sort((left, right) => left.avgOutlook12m - right.avgOutlook12m);
  }, [dependencies]);

  const trainingRepositoryRows = useMemo<RepositoryRollup[]>(() => {
    return (dataset?.repositories ?? []).map((repository) => {
      const inactiveRate = trainingInactiveRate(repository);
      const labeledCoverage = repository.snapshotCount > 0 ? repository.labeledSnapshotCount / repository.snapshotCount : 0;

      return {
        key: repository.url || repository.fullName,
        label: repository.fullName || repository.url,
        url: repository.url,
        source: "training",
        trainingRank: repository.rank,
        archived: repository.archived,
        packageCount: repository.packageCount,
        analysisCount: repository.analysisCount,
        snapshotCount: repository.snapshotCount,
        labeledSnapshotCount: repository.labeledSnapshotCount,
        inactiveLabelCount: repository.inactiveLabelCount,
        inactiveRate,
        lastPushAgeDays: repository.lastPushAgeDays,
        lastObservedAt: repository.lastObservedAt,
        avgOutlook12m: Math.max(0, 100 - inactiveRate * 100),
        avgRisk: inactiveRate * 100,
        avgSecurity: 0,
        avgConfidence: Math.round(Math.min(100, Math.max(35, 45 + labeledCoverage * 45))),
        recentContributors90d: repository.recentContributors90d,
      } satisfies RepositoryRollup;
    });
  }, [dataset?.repositories]);

  const repositoryRows = useMemo<RepositoryRollup[]>(() => {
    const rowsByKey = new Map<string, RepositoryRollup>();
    for (const row of trainingRepositoryRows) {
      rowsByKey.set(row.key, row);
    }
    for (const row of analysisRepositoryRows) {
      const existing = rowsByKey.get(row.key);
      rowsByKey.set(row.key, existing ? { ...existing, ...row, source: "analysis" } : row);
    }
    return [...rowsByKey.values()].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "analysis" ? -1 : 1;
      }
      if ((left.trainingRank ?? 0) !== (right.trainingRank ?? 0)) {
        return (left.trainingRank ?? Number.MAX_SAFE_INTEGER) - (right.trainingRank ?? Number.MAX_SAFE_INTEGER);
      }
      return left.avgOutlook12m - right.avgOutlook12m;
    });
  }, [analysisRepositoryRows, trainingRepositoryRows]);

  const packageRows = useMemo<PackageRollup[]>(() => {
    const buckets = new Map<string, DependencyRecord[]>();
    for (const dependency of dependencies) {
      const key = `${dependency.ecosystem}|${dependency.packageName}`;
      const current = buckets.get(key) ?? [];
      current.push(dependency);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .map(([key, items]) => {
        const outlookValues = items.map((item) => item.riskProfile?.maintenanceOutlook12mScore ?? 0);
        const riskValues = items.map((item) => item.riskProfile?.inactivityRiskScore ?? 0);
        const securityValues = items.map((item) => item.riskProfile?.securityPostureScore ?? 0);
        const analysisCount = new Set(items.map((item) => item.analysisId)).size;
        const versions = new Set(items.map((item) => item.packageVersion)).size;
        const mappedRepositories = new Set(items.map((item) => item.repository?.fullName).filter(Boolean)).size;
        const latest = items
          .map((item) => item.repository?.lastPushAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1);

        return {
          key,
          packageName: items[0]?.packageName ?? key,
          ecosystem: items[0]?.ecosystem ?? "unknown",
          analysisCount,
          versionCount: versions,
          avgOutlook12m: average(outlookValues),
          avgRisk: average(riskValues),
          avgSecurity: average(securityValues),
          maxRisk: Math.max(...riskValues, 0),
          mappedRepositories,
          lastSeenAt: latest,
        } satisfies PackageRollup;
      })
      .sort((left, right) => left.avgOutlook12m - right.avgOutlook12m);
  }, [dependencies]);

  const dependencyRows = useMemo<DependencyRankingRow[]>(() => {
    return dependencies
      .map((dependency) => ({
        key: dependency.id,
        analysisId: dependency.analysisId,
        dependencyId: dependency.id,
        packageName: dependency.packageName,
        packageVersion: dependency.packageVersion,
        ecosystem: dependency.ecosystem,
        repositoryName: dependency.repository?.fullName,
        outlook12m: dependency.riskProfile?.maintenanceOutlook12mScore ?? 0,
        risk: dependency.riskProfile?.inactivityRiskScore ?? 0,
        confidence: dependency.riskProfile?.confidenceScore ?? 0,
      }))
      .sort((left, right) => {
        if (left.outlook12m !== right.outlook12m) {
          return left.outlook12m - right.outlook12m;
        }
        return right.risk - left.risk;
      });
  }, [dependencies]);

  // Leaderboard ranks the healthiest repos (highest 12-month outlook) across both sources.
  const leaderboard = useMemo(
    () => [...repositoryRows].sort((left, right) => right.avgOutlook12m - left.avgOutlook12m).slice(0, 8),
    [repositoryRows],
  );

  return {
    analyses,
    dataset,
    error,
    loading,
    dependencies,
    repositoryRows,
    packageRows,
    dependencyRows,
    leaderboard,
  };
}
