"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import { getLatestTrainingRun, getTrainingDatasetSummary, getTrainingEffects, listTrainingRuns } from "@/lib/api";
import type { GetTrainingEffectsResponse, TrainingDatasetSummary, TrainingRunArtifact } from "@/lib/types";

interface MlEvaluationState {
  dataset: TrainingDatasetSummary | null;
  effects: GetTrainingEffectsResponse | null;
  latestRun: TrainingRunArtifact | null;
  runs: TrainingRunArtifact[];
  loading: boolean;
  error: string | null;
}

export function useMlEvaluationState() {
  const requestIdRef = useRef(0);
  const [state, setState] = useState<MlEvaluationState>({
    dataset: null,
    effects: null,
    latestRun: null,
    runs: [],
    loading: true,
    error: null,
  });

  async function load({ background = false }: { background?: boolean } = {}) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!background) {
      setState((current) => ({ ...current, loading: true, error: null }));
    } else {
      setState((current) => ({ ...current, error: null }));
    }

    try {
      const [datasetSummary, trainingEffects, latestRun, runHistory] = await Promise.all([
        getTrainingDatasetSummary().catch(() => null),
        getTrainingEffects().catch(() => null),
        getLatestTrainingRun().catch(() => null),
        listTrainingRuns().catch(() => []),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState({
          dataset: datasetSummary,
          effects: trainingEffects,
          latestRun,
          runs: runHistory,
          loading: false,
          error: null,
        });
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setState((current) => ({
        ...current,
        loading: false,
        error: loadError instanceof Error ? loadError.message : "Failed to load ML evaluation state.",
      }));
    }
  }

  useEffect(() => {
    void load();

    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  return {
    ...state,
    refresh: load,
  };
}
