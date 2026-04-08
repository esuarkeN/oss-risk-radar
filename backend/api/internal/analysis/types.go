package analysis

import (
	"encoding/json"
	"time"
)

type RiskBucket string

type ActionLevel string

type SubmissionKind string

type AnalysisStatus string

type JobStatus string

type UploadStatus string

const (
	SubmissionDemo          SubmissionKind = "demo"
	SubmissionRepositoryURL SubmissionKind = "repository_url"
	SubmissionUpload        SubmissionKind = "upload"

	AnalysisStatusPending   AnalysisStatus = "pending"
	AnalysisStatusRunning   AnalysisStatus = "running"
	AnalysisStatusCompleted AnalysisStatus = "completed"
	AnalysisStatusFailed    AnalysisStatus = "failed"

	JobStatusPending   JobStatus = "pending"
	JobStatusRunning   JobStatus = "running"
	JobStatusCompleted JobStatus = "completed"
	JobStatusFailed    JobStatus = "failed"

	UploadStatusReceived UploadStatus = "received"
	UploadStatusParsed   UploadStatus = "parsed"
	UploadStatusFailed   UploadStatus = "failed"
)

type AnalysisSubmission struct {
	Kind                          SubmissionKind `json:"kind"`
	RepositoryURL                 string         `json:"repositoryUrl,omitempty"`
	ArtifactName                  string         `json:"artifactName,omitempty"`
	UploadID                      string         `json:"uploadId,omitempty"`
	IncludeTransitiveDependencies bool           `json:"includeTransitiveDependencies,omitempty"`
	DemoProfile                   string         `json:"demoProfile,omitempty"`
}

type CreateAnalysisRequest struct {
	Submission AnalysisSubmission `json:"submission"`
}

type UploadArtifact struct {
	ID          string       `json:"id"`
	AnalysisID  string       `json:"analysisId,omitempty"`
	FileName    string       `json:"fileName"`
	ContentType string       `json:"contentType"`
	SizeBytes   int64        `json:"sizeBytes"`
	UploadedAt  time.Time    `json:"uploadedAt"`
	Status      UploadStatus `json:"status"`
	ParseError  string       `json:"parseError,omitempty"`
	StorageHint string       `json:"-"`
}

type CreateUploadResponse struct {
	Upload UploadArtifact `json:"upload"`
}

type AnalysisSummary struct {
	DependencyCount        int            `json:"dependencyCount"`
	HighRiskCount          int            `json:"highRiskCount"`
	MappedRepositoryCount  int            `json:"mappedRepositoryCount"`
	ScoreAvailabilityCount int            `json:"scoreAvailabilityCount"`
	RiskDistribution       map[string]int `json:"riskDistribution"`
	EcosystemBreakdown     map[string]int `json:"ecosystemBreakdown"`
}

type ScorecardCheck struct {
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}

type ScorecardSnapshot struct {
	Score  float64          `json:"score"`
	Checks []ScorecardCheck `json:"checks"`
}

type RepositorySnapshot struct {
	FullName                      string     `json:"fullName"`
	URL                           string     `json:"url"`
	DefaultBranch                 string     `json:"defaultBranch"`
	Archived                      bool       `json:"archived"`
	Stars                         int        `json:"stars"`
	Forks                         int        `json:"forks"`
	OpenIssues                    int        `json:"openIssues"`
	LastPushAt                    time.Time  `json:"lastPushAt"`
	LastReleaseAt                 *time.Time `json:"lastReleaseAt,omitempty"`
	RecentContributors90d         *int       `json:"recentContributors90d,omitempty"`
	ContributorConcentration      *float64   `json:"contributorConcentration,omitempty"`
	PullRequestMedianResponseDays *float64   `json:"pullRequestMedianResponseDays,omitempty"`
	LastPushAgeDays               int        `json:"-"`
	LastReleaseAgeDays            *int       `json:"-"`
	ReleaseCadenceDays            *int       `json:"-"`
	OpenIssueGrowth90d            *float64   `json:"-"`
}

type EvidenceItem struct {
	Source        string    `json:"source"`
	Signal        string    `json:"signal"`
	Value         string    `json:"value"`
	ObservedAt    time.Time `json:"observedAt"`
	ProvenanceURL string    `json:"provenanceUrl,omitempty"`
}

type ExplanationFactor struct {
	Label     string  `json:"label"`
	Direction string  `json:"direction"`
	Weight    float64 `json:"weight"`
	Detail    string  `json:"detail"`
}

type RawSignalItem struct {
	Key        string          `json:"key"`
	Value      json.RawMessage `json:"value"`
	Source     string          `json:"source"`
	ObservedAt *time.Time      `json:"observedAt,omitempty"`
}

func NewRawSignal(key string, value any, source string, observedAt *time.Time) RawSignalItem {
	encoded, _ := json.Marshal(value)
	if len(encoded) == 0 {
		encoded = []byte("null")
	}
	return RawSignalItem{Key: key, Value: json.RawMessage(encoded), Source: source, ObservedAt: observedAt}
}

type RiskProfile struct {
	InactivityRiskScore  float64             `json:"inactivityRiskScore"`
	SecurityPostureScore float64             `json:"securityPostureScore"`
	ConfidenceScore      float64             `json:"confidenceScore"`
	RiskBucket           RiskBucket          `json:"riskBucket"`
	ActionLevel          ActionLevel         `json:"actionLevel"`
	Caveats              []string            `json:"caveats"`
	MissingSignals       []string            `json:"missingSignals"`
	ExplanationFactors   []ExplanationFactor `json:"explanationFactors"`
	Evidence             []EvidenceItem      `json:"evidence"`
}

type DependencyEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

type DependencyRecord struct {
	ID                  string              `json:"id"`
	AnalysisID          string              `json:"analysisId"`
	PackageName         string              `json:"packageName"`
	PackageVersion      string              `json:"packageVersion"`
	Ecosystem           string              `json:"ecosystem"`
	Direct              bool                `json:"direct"`
	Repository          *RepositorySnapshot `json:"repository,omitempty"`
	Scorecard           *ScorecardSnapshot  `json:"scorecard,omitempty"`
	RiskProfile         *RiskProfile        `json:"riskProfile,omitempty"`
	DependencyPath      []string            `json:"dependencyPath"`
	RawSignalsAvailable bool                `json:"rawSignalsAvailable"`
	RawSignals          []RawSignalItem     `json:"rawSignals,omitempty"`
	ParsedFromUploadID  string              `json:"parsedFromUploadId,omitempty"`
}

type AnalysisRecord struct {
	ID                 string             `json:"id"`
	Status             AnalysisStatus     `json:"status"`
	CreatedAt          time.Time          `json:"createdAt"`
	UpdatedAt          time.Time          `json:"updatedAt"`
	Submission         AnalysisSubmission `json:"submission"`
	Summary            AnalysisSummary    `json:"summary"`
	Dependencies       []DependencyRecord `json:"dependencies"`
	DependencyEdges    []DependencyEdge   `json:"dependencyEdges,omitempty"`
	Uploads            []UploadArtifact   `json:"uploads,omitempty"`
	MethodologyVersion string             `json:"methodologyVersion,omitempty"`
	LatestJobID        string             `json:"latestJobId,omitempty"`
}

type JobRecord struct {
	ID          string     `json:"id"`
	AnalysisID  string     `json:"analysisId"`
	Type        string     `json:"type"`
	Status      JobStatus  `json:"status"`
	Attempts    int        `json:"attempts,omitempty"`
	MaxAttempts int        `json:"maxAttempts,omitempty"`
	LastError   string     `json:"lastError,omitempty"`
	NextRunAt   *time.Time `json:"nextRunAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Message     string     `json:"message"`
}

type CreateAnalysisResponse struct {
	Analysis AnalysisRecord `json:"analysis"`
	Job      JobRecord      `json:"job"`
}

type ListAnalysesResponse struct {
	Analyses []AnalysisRecord `json:"analyses"`
}

type GetAnalysisResponse struct {
	Analysis AnalysisRecord `json:"analysis"`
}

type GetDependenciesResponse struct {
	Dependencies []DependencyRecord `json:"dependencies"`
}

type GetDependencyResponse struct {
	Dependency DependencyRecord `json:"dependency"`
}

type GetJobResponse struct {
	Job JobRecord `json:"job"`
}

type DependencyGraphResponse struct {
	AnalysisID string             `json:"analysisId"`
	Nodes      []DependencyRecord `json:"nodes"`
	Edges      []DependencyEdge   `json:"edges"`
}

type GetDependencyGraphResponse struct {
	Graph DependencyGraphResponse `json:"graph"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}
