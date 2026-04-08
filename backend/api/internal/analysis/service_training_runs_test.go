package analysis_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeTrainingScorer struct {
	calls int
}

func (f *fakeTrainingScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{InactivityRiskScore: 42, SecurityPostureScore: 71, ConfidenceScore: 0.82, RiskBucket: analysis.RiskBucket("medium"), ActionLevel: analysis.ActionLevel("monitor")}
	}
	return result, nil
}

func (*fakeTrainingScorer) Ready(context.Context) error { return nil }

func (f *fakeTrainingScorer) TrainModel(_ context.Context, snapshots []analysis.TrainingSnapshotRecord) (analysis.TrainingRunArtifact, error) {
	f.calls++
	return analysis.TrainingRunArtifact{
		Status:       "completed",
		ModelName:    "logistic-regression-baseline",
		ModelVersion: "0.2.0",
		TrainedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		DatasetSummary: &analysis.TrainingRunDatasetSummary{
			TotalRows:     len(snapshots),
			LabeledRows:   0,
			UnlabeledRows: len(snapshots),
			FeatureNames:  []string{"repository_archived", "release_cadence_days"},
		},
		SplitSummary: &analysis.TrainingRunSplitSummary{TrainRows: 2, ValidationRows: 1, TestRows: 1},
		Metrics: &analysis.TrainingRunMetrics{
			Threshold:    0.5,
			SampleCount:  4,
			PositiveRate: 0.25,
			Accuracy:     0.75,
			Precision:    0.8,
			Recall:       0.5,
			F1Score:      0.615,
			BrierScore:   0.188,
			LogLoss:      0.433,
			RocAuc:       0.801,
		},
		CalibrationBins: []analysis.TrainingCalibrationBin{{LowerBound: 0, UpperBound: 0.5, Count: len(snapshots), AveragePrediction: 0.21, EmpiricalRate: 0.1}},
		Message:         "fixture training run",
	}, nil
}

func TestTriggerTrainingRunCachesLatestArtifact(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	scorer := &fakeTrainingScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           filepath.Join(tempDir, "uploads"),
		TrainingDatasetPath: filepath.Join(tempDir, "training", "snapshots.json"),
		TrainingRunsDir:     filepath.Join(tempDir, "training", "runs"),
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
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
	if scorer.calls != 1 {
		t.Fatalf("expected one training call, got %d", scorer.calls)
	}
	if firstRun.ArtifactPath == "" || firstRun.DatasetHash == "" {
		t.Fatalf("expected cached artifact metadata, got %#v", firstRun)
	}

	secondRun, reused, err := service.TriggerTrainingRun(ctx, false)
	if err != nil {
		t.Fatalf("TriggerTrainingRun second call returned error: %v", err)
	}
	if !reused {
		t.Fatal("expected second training run to reuse cache")
	}
	if scorer.calls != 1 {
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
}
