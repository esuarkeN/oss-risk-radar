package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/config"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeRouterScorer struct{}

func (fakeRouterScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	results := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		results[dependency.ID] = analysis.RiskProfile{
			InactivityRiskScore:  65,
			SecurityPostureScore: 52,
			ConfidenceScore:      0.73,
			RiskBucket:           "high",
			ActionLevel:          "review",
		}
	}
	return results, nil
}

func (fakeRouterScorer) Ready(context.Context) error { return nil }

func (fakeRouterScorer) TrainModel(_ context.Context, snapshots []analysis.TrainingSnapshotRecord) (analysis.TrainingRunArtifact, error) {
	return analysis.TrainingRunArtifact{
		Status:       "completed",
		ModelName:    "logistic-regression-baseline",
		ModelVersion: "0.2.0",
		TrainedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		DatasetSummary: &analysis.TrainingRunDatasetSummary{
			TotalRows:     len(snapshots),
			LabeledRows:   0,
			UnlabeledRows: len(snapshots),
			FeatureNames:  []string{"repository_archived"},
		},
		CalibrationBins: []analysis.TrainingCalibrationBin{{LowerBound: 0, UpperBound: 0.5, Count: len(snapshots), AveragePrediction: 0.2, EmpiricalRate: 0.1}},
		Message:         "fixture",
	}, nil
}

func TestHealthEndpoint(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeRouterScorer{},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)
	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
}

func TestCreateAnalysisEndpoint(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeRouterScorer{},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)
	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/analyses", strings.NewReader(`{"submission":{"kind":"demo"}}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 201, got %d: %s", response.Code, string(body))
	}

	var payload analysis.CreateAnalysisResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload.Analysis.ID == "" || payload.Job.ID == "" {
		t.Fatal("expected analysis and job IDs to be populated")
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		item, err := service.GetAnalysis(ctx, payload.Analysis.ID)
		if err != nil {
			t.Fatalf("GetAnalysis returned error: %v", err)
		}
		if item.Status == analysis.AnalysisStatusCompleted {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("analysis did not complete in time")
}

func TestTriggerTrainingRunEndpoint(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              fakeRouterScorer{},
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     tempDir + "/runs",
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)
	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		item, getErr := service.GetAnalysis(ctx, created.ID)
		if getErr != nil {
			t.Fatalf("GetAnalysis returned error: %v", getErr)
		}
		if item.Status == analysis.AnalysisStatusCompleted {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/training/runs", strings.NewReader(`{"force":false}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.Code, string(body))
	}

	var payload analysis.TriggerTrainingRunResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload.Run.ArtifactPath == "" {
		t.Fatalf("expected cached artifact path, got %#v", payload)
	}
}
