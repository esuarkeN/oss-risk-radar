package analysis_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/providers"
	"oss-risk-radar/backend/api/internal/storage"
)

type fakeScorer struct{}

func (fakeScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{InactivityRiskScore: 42, MaintenanceOutlook12MScore: 58, SecurityPostureScore: 71, ConfidenceScore: 0.82, RiskBucket: analysis.RiskBucket("medium"), ActionLevel: analysis.ActionLevel("monitor")}
	}
	return result, nil
}

func (fakeScorer) Ready(context.Context) error { return nil }

type validatingScorecardScorer struct{}

func (validatingScorecardScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		if dependency.Scorecard != nil {
			for _, check := range dependency.Scorecard.Checks {
				if check.Score < 0 || check.Score > 10 {
					return nil, errors.New("invalid scorecard check score forwarded to scorer")
				}
			}
		}
		result[dependency.ID] = analysis.RiskProfile{InactivityRiskScore: 42, MaintenanceOutlook12MScore: 58, SecurityPostureScore: 71, ConfidenceScore: 0.82, RiskBucket: analysis.RiskBucket("medium"), ActionLevel: analysis.ActionLevel("monitor")}
	}
	return result, nil
}

func (validatingScorecardScorer) Ready(context.Context) error { return nil }

type fakeModelScorer struct {
	heuristicCalls int
	modelCalls     int
	trainCalls     int
	modelErr       error
}

func (f *fakeModelScorer) Score(_ context.Context, _ string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	f.heuristicCalls++
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{
			InactivityRiskScore:        42,
			MaintenanceOutlook12MScore: 58,
			SecurityPostureScore:       71,
			ConfidenceScore:            0.82,
			RiskBucket:                 analysis.RiskBucket("medium"),
			ActionLevel:                analysis.ActionLevel("monitor"),
		}
	}
	return result, nil
}

func (f *fakeModelScorer) ScoreModel(_ context.Context, _ string, dependencies []analysis.DependencyRecord, _ analysis.TrainingRunModelArtifact) (map[string]analysis.RiskProfile, error) {
	f.modelCalls++
	if f.modelErr != nil {
		return nil, f.modelErr
	}
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		result[dependency.ID] = analysis.RiskProfile{
			InactivityRiskScore:        11,
			MaintenanceOutlook12MScore: 89,
			SecurityPostureScore:       83,
			ConfidenceScore:            0.91,
			RiskBucket:                 analysis.RiskBucket("low"),
			ActionLevel:                analysis.ActionLevel("monitor"),
		}
	}
	return result, nil
}

func (f *fakeModelScorer) TrainModel(_ context.Context, snapshots []analysis.TrainingSnapshotRecord) (analysis.TrainingRunArtifact, error) {
	f.trainCalls++
	return analysis.TrainingRunArtifact{
		Status:       "completed",
		ModelName:    "logistic-regression-baseline",
		ModelVersion: "0.2.0",
		TrainedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		ModelArtifact: &analysis.TrainingRunModelArtifact{
			ModelName:      "logistic-regression-baseline",
			ModelVersion:   "0.2.0",
			FeatureVersion: "feature-set-v1",
			TrainedAt:      time.Now().UTC().Format(time.RFC3339Nano),
			Threshold:      0.5,
			FeatureNames:   []string{"has_repository_mapping"},
			Coefficients:   []float64{1},
			Intercept:      0,
			Standardization: analysis.TrainingRunStandardizationProfile{
				Means:  []float64{0},
				Scales: []float64{1},
			},
		},
		Message: "fixture training run",
	}, nil
}

func (f *fakeModelScorer) Ready(context.Context) error { return nil }

type fakeGitHubClient struct {
	repository *providers.RepositorySnapshot
	manifests  map[string][]byte
}

func (f fakeGitHubClient) GetRepository(context.Context, string) (*providers.RepositorySnapshot, error) {
	if f.repository == nil {
		return nil, errors.New("repository not found")
	}
	snapshot := *f.repository
	return &snapshot, nil
}

func (f fakeGitHubClient) FetchManifest(_ context.Context, _ string, path string) ([]byte, error) {
	content, ok := f.manifests[path]
	if !ok {
		return nil, errors.New("manifest not found")
	}
	return content, nil
}

type fakeScorecardClient struct {
	snapshot *providers.ScorecardSnapshot
}

func (f fakeScorecardClient) GetScorecard(context.Context, string) (*providers.ScorecardSnapshot, error) {
	if f.snapshot == nil {
		return nil, errors.New("scorecard not found")
	}
	snapshot := *f.snapshot
	return &snapshot, nil
}

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

func TestCreateOrReuseAnalysisReturnsCompletedRepositoryMatch(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
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
					ConfidenceScore:            0.89,
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

	reusedAnalysis, reusedJob, reused, err := service.CreateOrReuseAnalysis(ctx, analysis.AnalysisSubmission{
		Kind:          analysis.SubmissionRepositoryURL,
		RepositoryURL: "https://github.com/vercel/next.js/",
	})
	if err != nil {
		t.Fatalf("CreateOrReuseAnalysis returned error: %v", err)
	}
	if !reused {
		t.Fatal("expected repository submission to reuse the existing completed analysis")
	}
	if reusedAnalysis.ID != existing.ID || reusedJob.ID != job.ID {
		t.Fatalf("expected reused analysis/job, got %#v and %#v", reusedAnalysis, reusedJob)
	}

	analyses, err := service.ListAnalyses(ctx)
	if err != nil {
		t.Fatalf("ListAnalyses returned error: %v", err)
	}
	if len(analyses) != 1 {
		t.Fatalf("expected no new analysis to be created, got %d", len(analyses))
	}
}

func TestCreateAnalysisUsesLatestTrainedModelWhenAvailable(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	scorer := &fakeModelScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     tempDir + "/runs",
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)

	initial, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	waitForAnalysis(t, ctx, service, initial.ID)

	if _, _, err := service.TriggerTrainingRun(ctx, true); err != nil {
		t.Fatalf("TriggerTrainingRun returned error: %v", err)
	}

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis second call returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if scorer.modelCalls == 0 {
		t.Fatal("expected model scoring to be used when a trained artifact is available")
	}
	if scorer.trainCalls != 1 {
		t.Fatalf("expected one training run, got %d", scorer.trainCalls)
	}
	if len(completed.Dependencies) == 0 || completed.Dependencies[0].RiskProfile == nil {
		t.Fatalf("expected scored dependencies, got %#v", completed.Dependencies)
	}
	if completed.Dependencies[0].RiskProfile.MaintenanceOutlook12MScore != 89 {
		t.Fatalf("expected model-backed maintenance outlook, got %#v", completed.Dependencies[0].RiskProfile)
	}
}

func TestCreateAnalysisFallsBackToHeuristicWhenModelScoringFails(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	scorer := &fakeModelScorer{modelErr: errors.New("model scorer unavailable")}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "heuristic-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     tempDir + "/runs",
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)

	initial, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	waitForAnalysis(t, ctx, service, initial.ID)

	if _, _, err := service.TriggerTrainingRun(ctx, true); err != nil {
		t.Fatalf("TriggerTrainingRun returned error: %v", err)
	}

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis second call returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if scorer.modelCalls == 0 {
		t.Fatal("expected model scoring to be attempted before fallback")
	}
	if scorer.heuristicCalls < 2 {
		t.Fatalf("expected heuristic scoring to handle the fallback path, got %d calls", scorer.heuristicCalls)
	}
	if len(completed.Dependencies) == 0 || completed.Dependencies[0].RiskProfile == nil {
		t.Fatalf("expected scored dependencies, got %#v", completed.Dependencies)
	}
	if completed.Dependencies[0].RiskProfile.MaintenanceOutlook12MScore != 58 {
		t.Fatalf("expected heuristic fallback score, got %#v", completed.Dependencies[0].RiskProfile)
	}
}

func TestRepositorySubmissionCreatesRepositoryProfileWithoutManifest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	now := time.Now().UTC()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeScorer{},
		ManifestFetcher: fakeGitHubClient{
			repository: &providers.RepositorySnapshot{
				FullName:                      "facebook/react",
				URL:                           "https://github.com/facebook/react",
				DefaultBranch:                 "main",
				Archived:                      false,
				Stars:                         230000,
				Forks:                         47000,
				OpenIssues:                    1000,
				LastPushAt:                    now.AddDate(0, 0, -2),
				LastPushAgeDays:               2,
				RecentContributors90d:         intPtr(35),
				ContributorConcentration:      floatPtr(0.14),
				PullRequestMedianResponseDays: floatPtr(2),
				OpenIssueGrowth90d:            floatPtr(0.06),
			},
			manifests: map[string][]byte{},
		},
		RepositoryClient: fakeGitHubClient{
			repository: &providers.RepositorySnapshot{
				FullName:                      "facebook/react",
				URL:                           "https://github.com/facebook/react",
				DefaultBranch:                 "main",
				Archived:                      false,
				Stars:                         230000,
				Forks:                         47000,
				OpenIssues:                    1000,
				LastPushAt:                    now.AddDate(0, 0, -2),
				LastPushAgeDays:               2,
				RecentContributors90d:         intPtr(35),
				ContributorConcentration:      floatPtr(0.14),
				PullRequestMedianResponseDays: floatPtr(2),
				OpenIssueGrowth90d:            floatPtr(0.06),
			},
		},
		ScorecardClient: fakeScorecardClient{
			snapshot: &providers.ScorecardSnapshot{
				Score: 8.9,
				Checks: []providers.ScorecardCheck{
					{Name: "Branch-Protection", Score: 9, Reason: "fixture"},
				},
			},
		},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{
		Kind:          analysis.SubmissionRepositoryURL,
		RepositoryURL: "https://github.com/facebook/react",
	})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if completed.Status != analysis.AnalysisStatusCompleted {
		t.Fatalf("expected completed analysis, got %s", completed.Status)
	}
	if len(completed.Dependencies) != 1 {
		t.Fatalf("expected one repository profile dependency, got %d", len(completed.Dependencies))
	}

	dependency := completed.Dependencies[0]
	if dependency.PackageVersion != "repository profile" || dependency.PackageName != "facebook/react" {
		t.Fatalf("expected repository profile dependency, got %#v", dependency)
	}
	if dependency.Repository == nil || dependency.Repository.FullName != "facebook/react" {
		t.Fatalf("expected enriched repository snapshot, got %#v", dependency.Repository)
	}
	if dependency.RiskProfile == nil {
		t.Fatalf("expected repository profile to be scored, got %#v", dependency)
	}
}

func TestRepositorySubmissionFiltersInvalidScorecardChecks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	now := time.Now().UTC()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "heuristic-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             validatingScorecardScorer{},
		ManifestFetcher: fakeGitHubClient{
			repository: &providers.RepositorySnapshot{
				FullName:                      "vercel/next.js",
				URL:                           "https://github.com/vercel/next.js",
				DefaultBranch:                 "canary",
				Archived:                      false,
				Stars:                         132000,
				Forks:                         28600,
				OpenIssues:                    3200,
				LastPushAt:                    now.AddDate(0, 0, -1),
				LastPushAgeDays:               1,
				RecentContributors90d:         intPtr(48),
				ContributorConcentration:      floatPtr(0.12),
				PullRequestMedianResponseDays: floatPtr(3),
				OpenIssueGrowth90d:            floatPtr(0.08),
			},
			manifests: map[string][]byte{},
		},
		RepositoryClient: fakeGitHubClient{
			repository: &providers.RepositorySnapshot{
				FullName:                      "vercel/next.js",
				URL:                           "https://github.com/vercel/next.js",
				DefaultBranch:                 "canary",
				Archived:                      false,
				Stars:                         132000,
				Forks:                         28600,
				OpenIssues:                    3200,
				LastPushAt:                    now.AddDate(0, 0, -1),
				LastPushAgeDays:               1,
				RecentContributors90d:         intPtr(48),
				ContributorConcentration:      floatPtr(0.12),
				PullRequestMedianResponseDays: floatPtr(3),
				OpenIssueGrowth90d:            floatPtr(0.08),
			},
		},
		ScorecardClient: fakeScorecardClient{
			snapshot: &providers.ScorecardSnapshot{
				Score: 8.7,
				Checks: []providers.ScorecardCheck{
					{Name: "Binary-Artifacts", Score: 10, Reason: "fixture"},
					{Name: "Token-Permissions", Score: -1, Reason: "not available from API"},
					{Name: "Dangerous-Workflow", Score: -1, Reason: "not available from API"},
				},
			},
		},
		UploadDir:          t.TempDir(),
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{
		Kind:          analysis.SubmissionRepositoryURL,
		RepositoryURL: "https://github.com/vercel/next.js",
	})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if completed.Status != analysis.AnalysisStatusCompleted {
		t.Fatalf("expected completed analysis, got %s", completed.Status)
	}
	if len(completed.Dependencies) != 1 {
		t.Fatalf("expected one repository profile dependency, got %d", len(completed.Dependencies))
	}
	if completed.Dependencies[0].Scorecard == nil {
		t.Fatalf("expected scorecard data, got %#v", completed.Dependencies[0])
	}
	if len(completed.Dependencies[0].Scorecard.Checks) != 1 {
		t.Fatalf("expected invalid scorecard checks to be filtered, got %#v", completed.Dependencies[0].Scorecard.Checks)
	}
	if completed.Dependencies[0].Scorecard.Checks[0].Name != "Binary-Artifacts" {
		t.Fatalf("unexpected surviving scorecard check: %#v", completed.Dependencies[0].Scorecard.Checks[0])
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

func intPtr(value int) *int {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}
