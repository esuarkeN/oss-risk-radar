export type SubmissionKind = "demo" | "repository_url" | "upload";
export type AnalysisStatus = "pending" | "running" | "completed" | "failed";
export type JobStatus = "pending" | "running" | "completed" | "failed";
export type UploadStatus = "received" | "parsed" | "failed";
export type RiskBucket = "low" | "medium" | "high" | "critical";
export type ActionLevel = "monitor" | "review" | "replace_candidate";
export type Ecosystem = "npm" | "pypi" | "go" | "maven" | "unknown";
export type ProviderName = "demo" | "deps_dev" | "github" | "openssf_scorecard" | "analyst_input";

export interface AnalysisSubmission {
  kind: SubmissionKind;
  repositoryUrl?: string;
  uploadId?: string;
  artifactName?: string;
  includeTransitiveDependencies?: boolean;
  demoProfile?: string;
}

export interface AnalysisSummary {
  dependencyCount: number;
  highRiskCount: number;
  mappedRepositoryCount: number;
  scoreAvailabilityCount: number;
  riskDistribution: Record<RiskBucket, number>;
  ecosystemBreakdown: Record<string, number>;
}

export interface EvidenceItem {
  source: ProviderName | string;
  signal: string;
  value: string;
  observedAt: string;
  provenanceUrl?: string;
}

export interface ExplanationFactor {
  label: string;
  direction: "increase" | "decrease" | "neutral";
  weight: number;
  detail: string;
}

export interface RawSignalItem {
  key: string;
  value: string | number | boolean | null;
  source: ProviderName | string;
  observedAt?: string;
}

export interface RiskProfile {
  inactivityRiskScore: number;
  maintenanceOutlook12mScore: number;
  securityPostureScore: number;
  confidenceScore: number;
  riskBucket: RiskBucket;
  actionLevel: ActionLevel;
  caveats: string[];
  missingSignals: string[];
  explanationFactors: ExplanationFactor[];
  evidence: EvidenceItem[];
}

export interface RepositorySnapshot {
  fullName: string;
  url: string;
  defaultBranch: string;
  archived: boolean;
  stars: number;
  forks: number;
  openIssues: number;
  lastPushAt: string;
  lastReleaseAt?: string;
  recentContributors90d?: number;
  contributorConcentration?: number;
  pullRequestMedianResponseDays?: number;
}

export interface ScorecardSnapshot {
  score: number;
  checks: Array<{
    name: string;
    score: number;
    reason: string;
  }>;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: "direct" | "transitive";
}

export interface DependencyRecord {
  id: string;
  analysisId: string;
  packageName: string;
  packageVersion: string;
  ecosystem: string;
  direct: boolean;
  repository?: RepositorySnapshot;
  scorecard?: ScorecardSnapshot;
  riskProfile?: RiskProfile;
  dependencyPath: string[];
  rawSignalsAvailable: boolean;
  rawSignals?: RawSignalItem[];
  parsedFromUploadId?: string;
}

export interface UploadedArtifactRecord {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: UploadStatus;
  parseError?: string;
}

export interface AnalysisRecord {
  id: string;
  status: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
  submission: AnalysisSubmission;
  summary: AnalysisSummary;
  dependencies: DependencyRecord[];
  dependencyEdges?: DependencyEdge[];
  uploads?: UploadedArtifactRecord[];
  methodologyVersion?: string;
  latestJobId?: string;
}

export interface JobRecord {
  id: string;
  analysisId: string;
  type: "analysis" | "upload_parse" | "enrichment" | "scoring";
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  message: string;
  attempts?: number;
  lastError?: string;
}

export interface CreateAnalysisRequest {
  submission: AnalysisSubmission;
}

export interface CreateAnalysisResponse {
  analysis: AnalysisRecord;
  job: JobRecord;
  reusedExistingAnalysis: boolean;
  reusedFromAnalysisId?: string;
}

export interface CreateUploadResponse {
  upload: UploadedArtifactRecord;
}

export interface ListAnalysesResponse {
  analyses: AnalysisRecord[];
}

export interface GetAnalysisResponse {
  analysis: AnalysisRecord;
}

export interface GetDependenciesResponse {
  dependencies: DependencyRecord[];
}

export interface GetDependencyResponse {
  dependency: DependencyRecord;
}

export interface GetJobResponse {
  job: JobRecord;
}

export interface DependencyGraphResponse {
  analysisId: string;
  nodes: Array<Pick<DependencyRecord, "id" | "packageName" | "packageVersion" | "ecosystem" | "direct">>;
  edges: DependencyEdge[];
}

export interface DependencyFilterState {
  search: string;
  bucket: RiskBucket | "all";
  ecosystem: Ecosystem | "all";
  directOnly: boolean;
}

export interface TrainingDatasetSummary {
  datasetPath: string;
  totalSnapshots: number;
  uniqueAnalyses: number;
  uniqueRepositories: number;
  uniquePackages: number;
  lastUpdatedAt?: string;
  autoCaptureEnabled: boolean;
}

export interface GetTrainingDatasetSummaryResponse {
  dataset: TrainingDatasetSummary;
}
export interface TrainingRunDatasetSummary {
  totalRows: number;
  labeledRows: number;
  unlabeledRows: number;
  earliestObservedAt?: string;
  latestObservedAt?: string;
  featureNames: string[];
}

export interface TrainingRunSplitSummary {
  trainRows: number;
  validationRows: number;
  testRows: number;
}

export interface TrainingRunMetrics {
  threshold: number;
  sampleCount: number;
  positiveRate: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
  logLoss: number;
  rocAuc: number;
}

export interface TrainingCalibrationBin {
  lowerBound: number;
  upperBound: number;
  count: number;
  averagePrediction: number;
  empiricalRate: number;
}

export interface TrainingRunStandardizationProfile {
  means: number[];
  scales: number[];
}

export interface TrainingRunModelArtifact {
  modelName: string;
  modelVersion: string;
  featureVersion: string;
  trainedAt: string;
  threshold: number;
  featureNames: string[];
  coefficients: number[];
  intercept: number;
  standardization: TrainingRunStandardizationProfile;
  calibrationBins: TrainingCalibrationBin[];
}

export interface TrainingRunArtifact {
  datasetPath: string;
  datasetHash: string;
  artifactPath: string;
  cachedAt: string;
  status: string;
  modelName: string;
  modelVersion: string;
  trainedAt: string;
  datasetSummary?: TrainingRunDatasetSummary;
  splitSummary?: TrainingRunSplitSummary;
  metrics?: TrainingRunMetrics;
  calibrationBins: TrainingCalibrationBin[];
  modelArtifact?: TrainingRunModelArtifact;
  message: string;
}

export interface GetLatestTrainingRunResponse {
  run?: TrainingRunArtifact;
}

export interface ListTrainingRunsResponse {
  runs: TrainingRunArtifact[];
}

export interface TriggerTrainingRunRequest {
  force?: boolean;
}

export interface TriggerTrainingRunResponse {
  run: TrainingRunArtifact;
  reusedCachedRun: boolean;
}
