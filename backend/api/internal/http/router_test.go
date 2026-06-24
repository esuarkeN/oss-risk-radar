package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/config"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeRouterScorer struct{}

func (fakeRouterScorer) ScoreModel(_ context.Context, _ string, dependencies []analysis.DependencyRecord, _ analysis.TrainingRunModelArtifact) (map[string]analysis.RiskProfile, error) {
	results := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		results[dependency.ID] = analysis.RiskProfile{
			InactivityRiskScore:        65,
			MaintenanceOutlook12MScore: 35,
			SecurityPostureScore:       52,
			ConfidenceScore:            0.73,
			RiskBucket:                 "high",
			ActionLevel:                "review",
		}
	}
	return results, nil
}

func (fakeRouterScorer) Ready(context.Context) error { return nil }

func TestHealthEndpoint(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
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

	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeRouterModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeRouterScorer{},
		UploadDir:          tempDir,
		TrainingRunsDir:    runsDir,
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

func writeRouterModelArtifactBundle(t *testing.T, runsDir string) {
	t.Helper()
	cachedAt := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	trainedAt := cachedAt.Format(time.RFC3339Nano)
	for _, modelName := range []string{"logistic-regression-full-history", "xgboost-full-history", "logistic-regression-cold-start", "xgboost-cold-start"} {
		algorithm := "logistic_regression"
		if strings.HasPrefix(modelName, "xgboost") {
			algorithm = "xgboost"
		}
		featureVersion := "feature-set-v3-full-history"
		if strings.Contains(modelName, "cold-start") {
			featureVersion = "feature-set-v3-cold-start"
		}
		run := analysis.TrainingRunArtifact{
			DatasetHash:  "router-fixture-hash",
			ArtifactPath: filepath.Join(runsDir, modelName+".json"),
			CachedAt:     cachedAt,
			Status:       "completed",
			ModelName:    modelName,
			ModelVersion: "0.2.0",
			TrainedAt:    trainedAt,
			ModelArtifact: &analysis.TrainingRunModelArtifact{
				ModelName:      modelName,
				ModelVersion:   "0.2.0",
				FeatureVersion: featureVersion,
				TrainedAt:      trainedAt,
				Threshold:      0.5,
				Algorithm:      algorithm,
				FeatureNames:   []string{"has_repository_mapping"},
				Coefficients:   []float64{1},
				Standardization: analysis.TrainingRunStandardizationProfile{
					Means:  []float64{0},
					Scales: []float64{1},
				},
				BoosterJSON:  "fixture",
				TreeCount:    1,
				MaxDepth:     2,
				LearningRate: 0.08,
			},
		}
		payload, err := json.MarshalIndent(run, "", "  ")
		if err != nil {
			t.Fatalf("failed to marshal model fixture: %v", err)
		}
		if err := os.MkdirAll(runsDir, 0o755); err != nil {
			t.Fatalf("failed to create model fixture dir: %v", err)
		}
		if err := os.WriteFile(run.ArtifactPath, payload, 0o644); err != nil {
			t.Fatalf("failed to write model fixture: %v", err)
		}
	}
}

func TestCreateAnalysisEndpointReusesExistingRepositoryAnalysis(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              store,
		Scorer:             fakeRouterScorer{},
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
			{ID: "dep_existing", AnalysisID: "analysis_existing", PackageName: "next", PackageVersion: "15.5.14", Ecosystem: "npm", Direct: true, DependencyPath: []string{"next"}},
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

	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/analyses", strings.NewReader(`{"submission":{"kind":"repository_url","repositoryUrl":"https://github.com/vercel/next.js/"}}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.Code, string(body))
	}

	var payload analysis.CreateAnalysisResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !payload.ReusedExistingAnalysis || payload.Analysis.ID != existing.ID {
		t.Fatalf("expected reused existing analysis, got %#v", payload)
	}
}

func TestCreateAnalysisEndpointForceBypassesExistingRepositoryAnalysis(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              store,
		Scorer:             fakeRouterScorer{},
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
			{ID: "dep_existing", AnalysisID: "analysis_existing", PackageName: "next", PackageVersion: "15.5.14", Ecosystem: "npm", Direct: true, DependencyPath: []string{"next"}},
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

	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/analyses", strings.NewReader(`{"force":true,"submission":{"kind":"repository_url","repositoryUrl":"https://github.com/vercel/next.js/"}}`))
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
	if payload.ReusedExistingAnalysis {
		t.Fatalf("expected fresh analysis, got reused response %#v", payload)
	}
	if payload.Analysis.ID == existing.ID {
		t.Fatalf("expected new analysis id, got existing id %s", payload.Analysis.ID)
	}
	if payload.Analysis.Status != analysis.AnalysisStatusPending {
		t.Fatalf("expected pending rerun analysis, got %#v", payload.Analysis)
	}
}

func TestTrainingRunMutationEndpointIsNotRegistered(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeRouterScorer{},
		UploadDir:          tempDir,
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)
	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/training/runs", strings.NewReader(`{"force":false}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 405, got %d: %s", response.Code, string(body))
	}
}

func TestTrainingEffectsEndpoint(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "snapshots.json")
	writeRouterTrainingEffectsDataset(t, datasetPath)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              fakeRouterScorer{},
		UploadDir:           tempDir,
		TrainingDatasetPath: datasetPath,
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)
	router := NewRouter(config.Config{ServiceName: "oss-risk-radar-api", AllowedOrigin: "http://localhost:3000"}, slog.Default(), service)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/training/effects", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.Code, string(body))
	}

	var payload analysis.GetTrainingEffectsResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload.LabeledSnapshots != 2 || payload.ActiveCount != 1 || payload.InactiveCount != 1 {
		t.Fatalf("unexpected effect counts: %#v", payload)
	}
	if len(payload.Effects) == 0 {
		t.Fatal("expected effect rows")
	}
}

func writeRouterTrainingEffectsDataset(t *testing.T, path string) {
	t.Helper()
	active := false
	inactive := true
	now := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
	dataset := map[string]any{
		"updatedAt": now,
		"snapshots": []analysis.TrainingSnapshotRecord{
			{
				AnalysisID:       "active",
				ObservedAt:       now,
				LabelInactive12M: &active,
				Dependency: analysis.TrainingDependencySignalSnapshot{
					DependencyID: "active",
					PackageName:  "fixture",
					Ecosystem:    "npm",
					HistoricalFeatures: map[string]float64{
						"commits_365d": 10,
					},
				},
			},
			{
				AnalysisID:       "inactive",
				ObservedAt:       now,
				LabelInactive12M: &inactive,
				Dependency: analysis.TrainingDependencySignalSnapshot{
					DependencyID: "inactive",
					PackageName:  "fixture",
					Ecosystem:    "npm",
					HistoricalFeatures: map[string]float64{
						"commits_365d": 0,
					},
				},
			},
		},
	}
	payload, err := json.MarshalIndent(dataset, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal dataset fixture: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create dataset fixture dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("failed to write dataset fixture: %v", err)
	}
}
