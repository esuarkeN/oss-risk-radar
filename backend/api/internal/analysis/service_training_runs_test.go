package analysis_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeTrainingScorer struct {
	calls             int
	lastSnapshotCount int
	lastModelName     string
}

func (f *fakeTrainingScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{InactivityRiskScore: 42, MaintenanceOutlook12MScore: 58, SecurityPostureScore: 71, ConfidenceScore: 0.82, RiskBucket: analysis.RiskBucket("medium"), ActionLevel: analysis.ActionLevel("monitor")}
	}
	return result, nil
}

func (*fakeTrainingScorer) Ready(context.Context) error { return nil }

func (f *fakeTrainingScorer) TrainModel(_ context.Context, snapshots []analysis.TrainingSnapshotRecord, modelName string) (analysis.TrainingRunArtifact, error) {
	f.calls++
	f.lastSnapshotCount = len(snapshots)
	f.lastModelName = modelName
	if modelName == "" {
		modelName = "xgboost-baseline"
	}
	algorithm := "xgboost"
	if modelName == "logistic-regression-baseline" {
		algorithm = "logistic_regression"
	}
	ece := 0.064
	return analysis.TrainingRunArtifact{
		Status:       "completed",
		ModelName:    modelName,
		ModelVersion: "0.2.0",
		TrainedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		DatasetSummary: &analysis.TrainingRunDatasetSummary{
			TotalRows:     len(snapshots),
			LabeledRows:   len(snapshots),
			UnlabeledRows: 0,
			FeatureNames:  []string{"repository_archived", "release_cadence_days"},
		},
		SplitSummary: &analysis.TrainingRunSplitSummary{TrainRows: 2, ValidationRows: 1, TestRows: 1},
		Metrics: &analysis.TrainingRunMetrics{
			Threshold:                0.5,
			SampleCount:              4,
			PositiveRate:             0.25,
			Accuracy:                 0.75,
			Precision:                0.8,
			Recall:                   0.5,
			F1Score:                  0.615,
			BrierScore:               0.188,
			LogLoss:                  0.433,
			RocAuc:                   0.801,
			ExpectedCalibrationError: &ece,
			QualityScore:             0.69,
		},
		CalibrationBins: []analysis.TrainingCalibrationBin{{LowerBound: 0, UpperBound: 0.5, Count: len(snapshots), AveragePrediction: 0.21, EmpiricalRate: 0.1}},
		ModelArtifact: &analysis.TrainingRunModelArtifact{
			ModelName:      modelName,
			ModelVersion:   "0.2.0",
			FeatureVersion: "feature-set-v1",
			TrainedAt:      time.Now().UTC().Format(time.RFC3339Nano),
			Threshold:      0.5,
			Algorithm:      algorithm,
			FeatureNames:   []string{"repository_archived", "release_cadence_days"},
			Coefficients:   []float64{0.8, -0.3},
			Intercept:      -0.1,
			Standardization: analysis.TrainingRunStandardizationProfile{
				Means:  []float64{0.2, 120},
				Scales: []float64{0.4, 25},
			},
			BoosterJSON:     "fixture",
			TreeCount:       1,
			MaxDepth:        2,
			LearningRate:    0.08,
			CalibrationBins: []analysis.TrainingCalibrationBin{{LowerBound: 0, UpperBound: 0.5, Count: len(snapshots), AveragePrediction: 0.21, EmpiricalRate: 0.1}},
		},
		Message: "fixture training run",
	}, nil
}

func TestTriggerTrainingRunCachesLatestArtifact(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "training", "snapshots.json")
	scorer := &fakeTrainingScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           filepath.Join(tempDir, "uploads"),
		TrainingDatasetPath: datasetPath,
		TrainingRunsDir:     filepath.Join(tempDir, "training", "runs"),
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	writeLabeledTrainingDataset(t, datasetPath)
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	waitForAnalysis(t, ctx, service, created.ID)

	firstRun, reused, err := service.TriggerTrainingRun(ctx, false)
	if err != nil {
		t.Fatalf("TriggerTrainingRun returned error: %v", err)
	}
	if reused {
		t.Fatal("expected first training run not to be reused")
	}
	if scorer.calls != 2 {
		t.Fatalf("expected both default models to train, got %d calls", scorer.calls)
	}
	if firstRun.ArtifactPath == "" || firstRun.DatasetHash == "" {
		t.Fatalf("expected cached artifact metadata, got %#v", firstRun)
	}
	if firstRun.ModelArtifact == nil {
		t.Fatalf("expected cached model artifact, got %#v", firstRun)
	}

	secondRun, reused, err := service.TriggerTrainingRun(ctx, false)
	if err != nil {
		t.Fatalf("TriggerTrainingRun second call returned error: %v", err)
	}
	if !reused {
		t.Fatal("expected second training run to reuse cache")
	}
	if scorer.calls != 2 {
		t.Fatalf("expected cached reuse without extra training call, got %d calls", scorer.calls)
	}
	if secondRun.ArtifactPath != firstRun.ArtifactPath {
		t.Fatalf("expected same cached artifact path, got %s and %s", firstRun.ArtifactPath, secondRun.ArtifactPath)
	}

	latestRun, err := service.GetLatestTrainingRun(ctx)
	if err != nil {
		t.Fatalf("GetLatestTrainingRun returned error: %v", err)
	}
	if latestRun == nil || latestRun.DatasetHash != firstRun.DatasetHash {
		t.Fatalf("expected latest cached run, got %#v", latestRun)
	}

	forcedRun, reused, err := service.TriggerTrainingRun(ctx, true)
	if err != nil {
		t.Fatalf("TriggerTrainingRun forced call returned error: %v", err)
	}
	if reused {
		t.Fatal("expected forced training run not to reuse cache")
	}
	if forcedRun.ArtifactPath == firstRun.ArtifactPath {
		t.Fatalf("expected a new cached artifact path on force rerun, got %s", forcedRun.ArtifactPath)
	}

	history, err := service.ListTrainingRuns(ctx)
	if err != nil {
		t.Fatalf("ListTrainingRuns returned error: %v", err)
	}
	if len(history) != 4 {
		t.Fatalf("expected four cached training artifacts after force rerun, got %d", len(history))
	}
}

func TestTriggerTrainingRunCanTrainSingleRequestedModel(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "training", "snapshots.json")
	scorer := &fakeTrainingScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           filepath.Join(tempDir, "uploads"),
		TrainingDatasetPath: datasetPath,
		TrainingRunsDir:     filepath.Join(tempDir, "training", "runs"),
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	writeLabeledTrainingDataset(t, datasetPath)

	run, reused, err := service.TriggerTrainingRunForModel(ctx, false, "logistic-regression-baseline")
	if err != nil {
		t.Fatalf("TriggerTrainingRunForModel returned error: %v", err)
	}
	if reused {
		t.Fatal("expected first single-model training run not to reuse cache")
	}
	if scorer.calls != 1 {
		t.Fatalf("expected one training call, got %d", scorer.calls)
	}
	if run.ModelName != "logistic-regression-baseline" {
		t.Fatalf("expected logistic model, got %#v", run.ModelName)
	}
}

func TestTriggerTrainingRunRequiresRealLabeledSnapshots(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "training", "snapshots.json")
	scorer := &fakeTrainingScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           filepath.Join(tempDir, "uploads"),
		TrainingDatasetPath: datasetPath,
		TrainingRunsDir:     filepath.Join(tempDir, "training", "runs"),
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})

	if _, _, err := service.TriggerTrainingRun(ctx, false); err == nil {
		t.Fatal("expected training without labeled snapshots to fail")
	}
	if scorer.calls != 0 {
		t.Fatalf("expected no training call without labeled snapshots, got %d", scorer.calls)
	}
}

func TestTriggerTrainingRunRejectsLabeledSnapshotsWithoutRepositoryIdentity(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "training", "snapshots.json")
	scorer := &fakeTrainingScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           filepath.Join(tempDir, "uploads"),
		TrainingDatasetPath: datasetPath,
		TrainingRunsDir:     filepath.Join(tempDir, "training", "runs"),
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	writeLabeledTrainingDatasetWithoutRepository(t, datasetPath)

	if _, _, err := service.TriggerTrainingRun(ctx, false); err == nil || !strings.Contains(err.Error(), "GitHub repository identity") {
		t.Fatalf("expected repository identity validation error, got %v", err)
	}
	if scorer.calls != 0 {
		t.Fatalf("expected no training call for non-project labeled snapshots, got %d", scorer.calls)
	}
}

func writeLabeledTrainingDataset(t *testing.T, datasetPath string) {
	t.Helper()

	falseLabel := false
	trueLabel := true
	snapshots := []analysis.TrainingSnapshotRecord{
		trainingSnapshot("real-active-001", "2021-01-01T00:00:00Z", "facebook/react", falseLabel),
		trainingSnapshot("real-active-002", "2021-04-01T00:00:00Z", "django/django", falseLabel),
		trainingSnapshot("real-inactive-001", "2021-07-01T00:00:00Z", "request/request", trueLabel),
		trainingSnapshot("real-inactive-002", "2021-10-01T00:00:00Z", "atom/atom", trueLabel),
	}
	writeTrainingDataset(t, datasetPath, snapshots)
}

func writeTrainingDataset(t *testing.T, datasetPath string, snapshots []analysis.TrainingSnapshotRecord) {
	t.Helper()

	payload, err := json.MarshalIndent(struct {
		UpdatedAt time.Time                         `json:"updatedAt"`
		Snapshots []analysis.TrainingSnapshotRecord `json:"snapshots"`
	}{
		UpdatedAt: time.Date(2026, 5, 12, 0, 0, 0, 0, time.UTC),
		Snapshots: snapshots,
	}, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal training dataset: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(datasetPath), 0o755); err != nil {
		t.Fatalf("failed to create training dataset dir: %v", err)
	}
	if err := os.WriteFile(datasetPath, payload, 0o644); err != nil {
		t.Fatalf("failed to write training dataset: %v", err)
	}
}

func writeLabeledTrainingDatasetWithoutRepository(t *testing.T, datasetPath string) {
	t.Helper()

	label := true
	snapshot := trainingSnapshot("placeholder-001", "2021-01-01T00:00:00Z", "placeholder/project", label)
	snapshot.Dependency.Repository = nil
	writeTrainingDataset(t, datasetPath, []analysis.TrainingSnapshotRecord{snapshot})
}

func trainingSnapshot(id string, observedAt string, fullName string, label bool) analysis.TrainingSnapshotRecord {
	lastPushAgeDays := 7
	lastReleaseAgeDays := 30
	releaseCadenceDays := 45
	recentContributors := 8
	concentration := 0.3
	issueGrowth := -0.05
	prResponseDays := 3.0
	if label {
		lastPushAgeDays = 720
		lastReleaseAgeDays = 900
		releaseCadenceDays = 220
		recentContributors = 0
		concentration = 0.95
		issueGrowth = 0.4
		prResponseDays = 90
	}

	return analysis.TrainingSnapshotRecord{
		AnalysisID:       "fixture-" + id,
		ObservedAt:       observedAt,
		LabelInactive12M: &label,
		Dependency: analysis.TrainingDependencySignalSnapshot{
			DependencyID:   id,
			PackageName:    fullName,
			PackageVersion: "repository-snapshot",
			Ecosystem:      "github",
			Direct:         true,
			Repository: &analysis.TrainingRepositorySignalSnapshot{
				FullName:                 fullName,
				URL:                      "https://github.com/" + fullName,
				DefaultBranch:            "main",
				Archived:                 label,
				Stars:                    1000,
				Forks:                    100,
				OpenIssues:               50,
				LastPushAgeDays:          &lastPushAgeDays,
				LastReleaseAgeDays:       &lastReleaseAgeDays,
				ReleaseCadenceDays:       &releaseCadenceDays,
				RecentContributors90d:    &recentContributors,
				ContributorConcentration: &concentration,
				OpenIssueGrowth90d:       &issueGrowth,
				PRResponseMedianDays:     &prResponseDays,
			},
			HistoricalFeatures: map[string]float64{
				"commits_90d":                     float64(maxInt(0, 120-lastPushAgeDays/10)),
				"contributors_90d":                float64(recentContributors),
				"days_since_last_commit":          float64(lastPushAgeDays),
				"days_since_last_release":         float64(lastReleaseAgeDays),
				"release_gap_risk":                map[bool]float64{true: 1, false: 0.15}[label],
				"concentration_risk_score":        concentration,
				"activity_drop_365d_vs_prev_365d": map[bool]float64{true: 0.9, false: 0.0}[label],
			},
		},
	}
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
