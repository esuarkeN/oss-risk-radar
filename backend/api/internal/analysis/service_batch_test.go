package analysis_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/storage"
)

func newBatchTestService(t *testing.T) *analysis.Service {
	t.Helper()
	return analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeScorer{},
		UploadDir:          t.TempDir(),
	})
}

func TestCreateBatchAnalysesEnqueuesOnePerURL(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	response, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{
		RepositoryURLs: []string{
			"https://github.com/vercel/next.js",
			"https://github.com/golang/go",
		},
	})
	if err != nil {
		t.Fatalf("CreateBatchAnalyses returned error: %v", err)
	}
	if len(response.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(response.Results))
	}
	for _, result := range response.Results {
		if result.Error != "" {
			t.Fatalf("unexpected per-entry error for %s: %s", result.RepositoryURL, result.Error)
		}
		if result.Analysis == nil || result.Job == nil {
			t.Fatalf("expected analysis and job for %s", result.RepositoryURL)
		}
		if result.ReusedExistingAnalysis {
			t.Fatalf("expected a fresh analysis for %s, got reused", result.RepositoryURL)
		}
	}
	if response.Results[0].Analysis.ID == response.Results[1].Analysis.ID {
		t.Fatalf("expected distinct analyses for distinct repository URLs")
	}
}

// One bad URL in the batch must not take the others down with it — the
// service validates each submission independently, the same way a caller
// looping single CreateAnalysis calls would see one failure among many
// successes.
func TestCreateBatchAnalysesIsolatesPerEntryFailures(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	response, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{
		RepositoryURLs: []string{
			"https://github.com/vercel/next.js",
			"   ",
		},
	})
	if err != nil {
		t.Fatalf("CreateBatchAnalyses returned error: %v", err)
	}
	if len(response.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(response.Results))
	}
	if response.Results[0].Error != "" {
		t.Fatalf("expected the valid URL to succeed, got error: %s", response.Results[0].Error)
	}
	if response.Results[1].Error == "" {
		t.Fatalf("expected the blank URL to fail with a per-entry error")
	}
	if response.Results[1].Analysis != nil {
		t.Fatalf("expected no analysis for the failed entry")
	}
}

func TestCreateBatchAnalysesReusesCompletedRepositoryMatch(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              store,
		Scorer:             fakeScorer{},
		UploadDir:          t.TempDir(),
	})

	now := time.Now().UTC()
	existing := analysis.AnalysisRecord{
		ID:         "analysis_existing",
		Status:     analysis.AnalysisStatusCompleted,
		CreatedAt:  now.Add(-time.Hour),
		UpdatedAt:  now,
		Submission: analysis.AnalysisSubmission{Kind: analysis.SubmissionRepositoryURL, RepositoryURL: "https://github.com/vercel/next.js"},
		Dependencies: []analysis.DependencyRecord{
			{
				ID:             "dep_existing",
				AnalysisID:     "analysis_existing",
				PackageName:    "next",
				PackageVersion: "15.5.14",
				Ecosystem:      "npm",
				Direct:         true,
				DependencyPath: []string{"next"},
				RiskProfile: &analysis.RiskProfile{
					InactivityRiskScore:        22,
					MaintenanceOutlook12MScore: 78,
					SecurityPostureScore:       81,
					EvidenceSupport:            0.89,
					RiskBucket:                 analysis.RiskBucket("low"),
					ActionLevel:                analysis.ActionLevel("monitor"),
				},
			},
		},
		LatestJobID: "job_existing",
	}
	job := analysis.JobRecord{
		ID:         "job_existing",
		AnalysisID: existing.ID,
		Type:       "analysis",
		Status:     analysis.JobStatusCompleted,
		CreatedAt:  existing.CreatedAt,
		UpdatedAt:  existing.UpdatedAt,
		Message:    "completed",
	}
	if err := store.CreateAnalysisJob(ctx, existing, job); err != nil {
		t.Fatalf("CreateAnalysisJob returned error: %v", err)
	}
	if err := store.SaveAnalysisResult(ctx, existing, job); err != nil {
		t.Fatalf("SaveAnalysisResult returned error: %v", err)
	}

	response, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{
		RepositoryURLs: []string{"https://github.com/vercel/next.js/"},
	})
	if err != nil {
		t.Fatalf("CreateBatchAnalyses returned error: %v", err)
	}
	if len(response.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(response.Results))
	}
	result := response.Results[0]
	if !result.ReusedExistingAnalysis {
		t.Fatalf("expected the completed analysis to be reused")
	}
	if result.Analysis.ID != existing.ID {
		t.Fatalf("expected reused analysis id %s, got %s", existing.ID, result.Analysis.ID)
	}
}

func TestCreateBatchAnalysesRejectsEmptyList(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	if _, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{}); err == nil {
		t.Fatalf("expected an error for an empty batch")
	}
}

func TestCreateBatchAnalysesRejectsOversizedBatch(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	urls := make([]string, analysis.MaxBatchAnalysisSize+1)
	for i := range urls {
		urls[i] = "https://github.com/example/repo"
	}

	_, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{RepositoryURLs: urls})
	if err == nil {
		t.Fatalf("expected an error for a batch exceeding MaxBatchAnalysisSize")
	}
	if !strings.Contains(err.Error(), "exceeds the maximum") {
		t.Fatalf("unexpected error for oversized batch: %v", err)
	}
}

func TestGetBatchAnalysesReadsBackSubmittedAnalyses(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	submitted, err := service.CreateBatchAnalyses(ctx, analysis.CreateBatchAnalysisRequest{
		RepositoryURLs: []string{"https://github.com/vercel/next.js"},
	})
	if err != nil {
		t.Fatalf("CreateBatchAnalyses returned error: %v", err)
	}
	analysisID := submitted.Results[0].Analysis.ID

	statusResponse, err := service.GetBatchAnalyses(ctx, analysis.GetBatchAnalysesRequest{
		AnalysisIDs: []string{analysisID, "analysis_does_not_exist"},
	})
	if err != nil {
		t.Fatalf("GetBatchAnalyses returned error: %v", err)
	}
	if len(statusResponse.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(statusResponse.Results))
	}
	if statusResponse.Results[0].Error != "" {
		t.Fatalf("expected the known id to resolve, got error: %s", statusResponse.Results[0].Error)
	}
	if statusResponse.Results[0].Analysis == nil || statusResponse.Results[0].Analysis.ID != analysisID {
		t.Fatalf("expected analysis %s in first result", analysisID)
	}
	if statusResponse.Results[1].Error == "" {
		t.Fatalf("expected the unknown id to produce a per-entry error")
	}
	if statusResponse.Results[1].Analysis != nil {
		t.Fatalf("expected no analysis for the unknown id")
	}
}

func TestGetBatchAnalysesRejectsEmptyList(t *testing.T) {
	ctx := context.Background()
	service := newBatchTestService(t)

	if _, err := service.GetBatchAnalyses(ctx, analysis.GetBatchAnalysesRequest{}); err == nil {
		t.Fatalf("expected an error for an empty id list")
	}
}
