import type {
  AnalysisRecord,
  CreateAnalysisRequest,
  CreateAnalysisResponse,
  DependencyRecord,
  GetAnalysisResponse,
  GetDependenciesResponse,
  GetDependencyResponse,
  GetLatestTrainingRunResponse,
  GetTrainingEffectsResponse,
  GetTrainingDatasetSummaryResponse,
  ListTrainingRunsResponse,
  ListAnalysesResponse,
  TrainingDatasetSummary,
  TrainingRunArtifact,
} from "@oss-risk-radar/schemas";

const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";

function normalizeExternalApiBaseUrl(value: string | undefined) {
  if (!value || value.startsWith("/")) {
    return null;
  }
  return value.replace(/\/+$/, "");
}

const API_BASE_URL =
  typeof window === "undefined"
    ? normalizeExternalApiBaseUrl(process.env.WEB_API_BASE_URL) ??
      normalizeExternalApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ??
      DEFAULT_API_BASE_URL
    : process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createAnalysis(payload: CreateAnalysisRequest) {
  return request<CreateAnalysisResponse>("/analyses", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getAnalysis(analysisId: string): Promise<AnalysisRecord> {
  const response = await request<GetAnalysisResponse>(`/analyses/${analysisId}`);
  return response.analysis;
}

export async function getDependencies(analysisId: string): Promise<DependencyRecord[]> {
  const response = await request<GetDependenciesResponse>(`/analyses/${analysisId}/dependencies`);
  return response.dependencies;
}

export async function getDependency(dependencyId: string): Promise<DependencyRecord> {
  const response = await request<GetDependencyResponse>(`/dependencies/${dependencyId}`);
  return response.dependency;
}

export async function getTrainingDatasetSummary(): Promise<TrainingDatasetSummary> {
  const response = await request<GetTrainingDatasetSummaryResponse>("/training/dataset");
  return response.dataset;
}

export async function getTrainingEffects(): Promise<GetTrainingEffectsResponse> {
  return request<GetTrainingEffectsResponse>("/training/effects");
}

export async function getLatestTrainingRun(): Promise<TrainingRunArtifact | null> {
  const response = await request<GetLatestTrainingRunResponse>("/training/runs/latest");
  return response.run ?? null;
}

export async function listTrainingRuns(): Promise<TrainingRunArtifact[]> {
  const response = await request<ListTrainingRunsResponse>("/training/runs");
  return response.runs;
}

export function listAnalyses() {
  return request<ListAnalysesResponse>("/analyses");
}
