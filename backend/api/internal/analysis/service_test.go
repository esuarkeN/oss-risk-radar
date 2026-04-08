package analysis_test

import (
	"context"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeScorer struct{}

func (fakeScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{InactivityRiskScore: 42, SecurityPostureScore: 71, ConfidenceScore: 0.82, RiskBucket: analysis.RiskBucket("medium"), ActionLevel: analysis.ActionLevel("monitor")}
	}
	return result, nil
}

func (fakeScorer) Ready(context.Context) error { return nil }

func TestCreateAnalysisQueuesAndCompletesDemo(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeScorer{},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)

	created, job, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	if created.Status != analysis.AnalysisStatusPending || job.Status != analysis.JobStatusPending {
		t.Fatalf("expected pending analysis/job, got %s and %s", created.Status, job.Status)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if completed.Status != analysis.AnalysisStatusCompleted {
		t.Fatalf("expected completed analysis, got %s", completed.Status)
	}
	if completed.Summary.DependencyCount != 4 || completed.Summary.ScoreAvailabilityCount != 4 {
		t.Fatalf("unexpected summary: %#v", completed.Summary)
	}
}

func TestCreateAnalysisFromUploadParsesManifest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeScorer{},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)

	upload, err := service.CreateUpload(ctx, "requirements.txt", "text/plain", []byte("requests==2.32.3\nurllib3>=2.2.1\n"))
	if err != nil {
		t.Fatalf("CreateUpload returned error: %v", err)
	}

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionUpload, UploadID: upload.ID})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if completed.Summary.DependencyCount != 2 {
		t.Fatalf("expected 2 parsed dependencies, got %d", completed.Summary.DependencyCount)
	}
	if completed.Dependencies[0].PackageName != "requests" {
		t.Fatalf("expected requests dependency, got %#v", completed.Dependencies[0])
	}
}

func waitForAnalysis(t *testing.T, ctx context.Context, service *analysis.Service, analysisID string) analysis.AnalysisRecord {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		item, err := service.GetAnalysis(ctx, analysisID)
		if err != nil {
			t.Fatalf("GetAnalysis returned error: %v", err)
		}
		if item.Status == analysis.AnalysisStatusCompleted || item.Status == analysis.AnalysisStatusFailed {
			return item
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for analysis %s", analysisID)
	return analysis.AnalysisRecord{}
}
