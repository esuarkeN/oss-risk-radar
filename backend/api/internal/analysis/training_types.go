package analysis

import "time"

type TrainingDatasetSummary struct {
	DatasetPath        string     `json:"datasetPath"`
	TotalSnapshots     int        `json:"totalSnapshots"`
	UniqueAnalyses     int        `json:"uniqueAnalyses"`
	UniqueRepositories int        `json:"uniqueRepositories"`
	UniquePackages     int        `json:"uniquePackages"`
	LastUpdatedAt      *time.Time `json:"lastUpdatedAt,omitempty"`
	AutoCaptureEnabled bool       `json:"autoCaptureEnabled"`
}

type GetTrainingDatasetSummaryResponse struct {
	Dataset TrainingDatasetSummary `json:"dataset"`
}

type TrainingRunDatasetSummary struct {
	TotalRows          int      `json:"totalRows"`
	LabeledRows        int      `json:"labeledRows"`
	UnlabeledRows      int      `json:"unlabeledRows"`
	EarliestObservedAt *string  `json:"earliestObservedAt,omitempty"`
	LatestObservedAt   *string  `json:"latestObservedAt,omitempty"`
	FeatureNames       []string `json:"featureNames"`
}

type TrainingRunSplitSummary struct {
	TrainRows      int `json:"trainRows"`
	ValidationRows int `json:"validationRows"`
	TestRows       int `json:"testRows"`
}

type TrainingRunMetrics struct {
	Threshold    float64 `json:"threshold"`
	SampleCount  int     `json:"sampleCount"`
	PositiveRate float64 `json:"positiveRate"`
	Accuracy     float64 `json:"accuracy"`
	Precision    float64 `json:"precision"`
	Recall       float64 `json:"recall"`
	F1Score      float64 `json:"f1Score"`
	BrierScore   float64 `json:"brierScore"`
	LogLoss      float64 `json:"logLoss"`
	RocAuc       float64 `json:"rocAuc"`
}

type TrainingCalibrationBin struct {
	LowerBound        float64 `json:"lowerBound"`
	UpperBound        float64 `json:"upperBound"`
	Count             int     `json:"count"`
	AveragePrediction float64 `json:"averagePrediction"`
	EmpiricalRate     float64 `json:"empiricalRate"`
}

type TrainingRunArtifact struct {
	DatasetPath     string                     `json:"datasetPath"`
	DatasetHash     string                     `json:"datasetHash"`
	ArtifactPath    string                     `json:"artifactPath"`
	CachedAt        time.Time                  `json:"cachedAt"`
	Status          string                     `json:"status"`
	ModelName       string                     `json:"modelName"`
	ModelVersion    string                     `json:"modelVersion"`
	TrainedAt       string                     `json:"trainedAt"`
	DatasetSummary  *TrainingRunDatasetSummary `json:"datasetSummary,omitempty"`
	SplitSummary    *TrainingRunSplitSummary   `json:"splitSummary,omitempty"`
	Metrics         *TrainingRunMetrics        `json:"metrics,omitempty"`
	CalibrationBins []TrainingCalibrationBin   `json:"calibrationBins"`
	Message         string                     `json:"message"`
}

type GetLatestTrainingRunResponse struct {
	Run *TrainingRunArtifact `json:"run,omitempty"`
}

type TriggerTrainingRunRequest struct {
	Force bool `json:"force"`
}

type TriggerTrainingRunResponse struct {
	Run             TrainingRunArtifact `json:"run"`
	ReusedCachedRun bool                `json:"reusedCachedRun"`
}

type TrainingScorecardCheckSnapshot struct {
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}

type TrainingScorecardSnapshot struct {
	Score  *float64                         `json:"score,omitempty"`
	Checks []TrainingScorecardCheckSnapshot `json:"checks"`
}

type TrainingRepositorySignalSnapshot struct {
	FullName                 string   `json:"full_name"`
	URL                      string   `json:"url"`
	DefaultBranch            string   `json:"default_branch"`
	Archived                 bool     `json:"archived"`
	Stars                    int      `json:"stars"`
	Forks                    int      `json:"forks"`
	OpenIssues               int      `json:"open_issues"`
	LastPushAgeDays          *int     `json:"last_push_age_days,omitempty"`
	LastReleaseAgeDays       *int     `json:"last_release_age_days,omitempty"`
	ReleaseCadenceDays       *int     `json:"release_cadence_days,omitempty"`
	RecentContributors90d    *int     `json:"recent_contributors_90d,omitempty"`
	ContributorConcentration *float64 `json:"contributor_concentration,omitempty"`
	OpenIssueGrowth90d       *float64 `json:"open_issue_growth_90d,omitempty"`
	PRResponseMedianDays     *float64 `json:"pr_response_median_days,omitempty"`
}

type TrainingDependencySignalSnapshot struct {
	DependencyID   string                            `json:"dependency_id"`
	PackageName    string                            `json:"package_name"`
	PackageVersion string                            `json:"package_version"`
	Ecosystem      string                            `json:"ecosystem"`
	Direct         bool                              `json:"direct"`
	Repository     *TrainingRepositorySignalSnapshot `json:"repository,omitempty"`
	Scorecard      *TrainingScorecardSnapshot        `json:"scorecard,omitempty"`
}

type TrainingSnapshotRecord struct {
	AnalysisID       string                           `json:"analysis_id"`
	ObservedAt       string                           `json:"observed_at"`
	Dependency       TrainingDependencySignalSnapshot `json:"dependency"`
	LabelInactive12M *bool                            `json:"label_inactive_12m,omitempty"`
}
