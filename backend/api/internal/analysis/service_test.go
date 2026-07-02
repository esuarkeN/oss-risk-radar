package analysis_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

type failingScorer struct{}

func (failingScorer) Score(context.Context, string, []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	return nil, errors.New("scoring service unavailable")
}

func (failingScorer) Ready(context.Context) error { return errors.New("scoring service unavailable") }

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
	modelCalls        int
	modelErr          error
	validateScorecard bool
	captured          [][]analysis.DependencyRecord
}

func (f *fakeModelScorer) ScoreModel(_ context.Context, _ string, dependencies []analysis.DependencyRecord, _ analysis.TrainingRunModelArtifact) (map[string]analysis.RiskProfile, error) {
	f.modelCalls++
	captured := make([]analysis.DependencyRecord, len(dependencies))
	copy(captured, dependencies)
	f.captured = append(f.captured, captured)
	if f.modelErr != nil {
		return nil, f.modelErr
	}
	result := make(map[string]analysis.RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		if f.validateScorecard && dependency.Scorecard != nil {
			for _, check := range dependency.Scorecard.Checks {
				if check.Score < 0 || check.Score > 10 {
					return nil, errors.New("invalid scorecard check score forwarded to scorer")
				}
			}
		}
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

	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             &fakeModelScorer{},
		UploadDir:          tempDir,
		TrainingRunsDir:    runsDir,
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

func TestCreateAnalysisFailsWhenScorerDoesNotSupportModels(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             fakeScorer{},
		UploadDir:          tempDir,
		TrainingRunsDir:    runsDir,
		WorkerPollInterval: 10 * time.Millisecond,
		RetryDelay:         10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if completed.Status != analysis.AnalysisStatusFailed {
		t.Fatalf("expected failed analysis without model-capable scorer, got %s", completed.Status)
	}
	job, err := service.GetJob(ctx, completed.LatestJobID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	if job.LastError != "configured scorer does not support model artifacts" {
		t.Fatalf("unexpected model-only scoring error: %q", job.LastError)
	}
}

func TestCreateOrReuseAnalysisReturnsCompletedRepositoryMatch(t *testing.T) {
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

func TestCreateOrReuseAnalysisCreatesFreshRepositoryAnalysisWhenCachedResultLacksStagedModels(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)

	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               store,
		Scorer:              &fakeModelScorer{},
		UploadDir:           tempDir,
		TrainingDatasetPath: filepath.Join(tempDir, "snapshots.json"),
		TrainingRunsDir:     runsDir,
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
					ScoringMethod:              "legacy_unstaged",
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

	created, createdJob, reused, err := service.CreateOrReuseAnalysis(ctx, analysis.AnalysisSubmission{
		Kind:          analysis.SubmissionRepositoryURL,
		RepositoryURL: "https://github.com/vercel/next.js/",
	})
	if err != nil {
		t.Fatalf("CreateOrReuseAnalysis returned error: %v", err)
	}
	if reused {
		t.Fatal("expected cached repository analysis without staged model outputs to be bypassed")
	}
	if created.ID == existing.ID || createdJob.ID == job.ID {
		t.Fatalf("expected fresh analysis/job, got %#v and %#v", created, createdJob)
	}
	if created.Status != analysis.AnalysisStatusPending || createdJob.Status != analysis.JobStatusPending {
		t.Fatalf("expected fresh pending analysis/job, got %s and %s", created.Status, createdJob.Status)
	}

	analyses, err := service.ListAnalyses(ctx)
	if err != nil {
		t.Fatalf("ListAnalyses returned error: %v", err)
	}
	if len(analyses) != 2 {
		t.Fatalf("expected a new analysis to be created beside the stale cached one, got %d", len(analyses))
	}
}

func TestCreateOrReuseAnalysisReusesRepositoryAnalysisWithCurrentStagedModels(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)

	store := storage.NewMemoryStore()
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               store,
		Scorer:              &fakeModelScorer{},
		UploadDir:           tempDir,
		TrainingDatasetPath: filepath.Join(tempDir, "snapshots.json"),
		TrainingRunsDir:     runsDir,
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
					InactivityRiskScore:        11,
					MaintenanceOutlook12MScore: 89,
					SecurityPostureScore:       83,
					ConfidenceScore:            0.91,
					RiskBucket:                 analysis.RiskBucket("low"),
					ActionLevel:                analysis.ActionLevel("monitor"),
					ScoringMethod:              "model_ensemble",
					ScoringModel:               "logistic-regression-full-history+xgboost-full-history",
					ModelResults:               currentModelResultsFixture(),
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
		t.Fatal("expected repository analysis with current staged model outputs to be reused")
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

func TestCreateAnalysisFailsWhenNoModelArtifactExists(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	scorer := &fakeModelScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     tempDir + "/runs",
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}
	completed := waitForAnalysis(t, ctx, service, created.ID)

	if scorer.modelCalls != 0 {
		t.Fatalf("expected no model scoring calls without cached artifacts, got %d", scorer.modelCalls)
	}
	if completed.Status != analysis.AnalysisStatusFailed {
		t.Fatalf("expected failed analysis without model artifacts, got %s", completed.Status)
	}
	job, err := service.GetJob(ctx, completed.LatestJobID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	if job.LastError != "no staged Logistic/XGBoost model artifact is available for scoring" {
		t.Fatalf("unexpected missing artifact error: %q", job.LastError)
	}
}

func TestCreateAnalysisUsesLatestTrainedModelWhenAvailable(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	scorer := &fakeModelScorer{}
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           tempDir,
		TrainingDatasetPath: filepath.Join(tempDir, "snapshots.json"),
		TrainingRunsDir:     runsDir,
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if scorer.modelCalls == 0 {
		t.Fatal("expected model scoring to be used when a trained artifact is available")
	}
	if len(completed.Dependencies) == 0 || completed.Dependencies[0].RiskProfile == nil {
		t.Fatalf("expected scored dependencies, got %#v", completed.Dependencies)
	}
	if completed.Dependencies[0].RiskProfile.MaintenanceOutlook12MScore != 89 {
		t.Fatalf("expected model-backed maintenance outlook, got %#v", completed.Dependencies[0].RiskProfile)
	}
	if len(completed.Dependencies[0].RiskProfile.ModelResults) != 2 {
		t.Fatalf("expected both model outputs on the risk profile, got %#v", completed.Dependencies[0].RiskProfile.ModelResults)
	}
	firstModelResult := completed.Dependencies[0].RiskProfile.ModelResults[0]
	if firstModelResult.RocAuc == nil || *firstModelResult.RocAuc != 0.82 || firstModelResult.ExpectedCalibrationError == nil {
		t.Fatalf("expected model metrics to be copied onto risk profile, got %#v", firstModelResult)
	}
	if len(completed.Summary.ScoringMethods) < 3 {
		t.Fatalf("expected ensemble and per-model scoring summaries, got %#v", completed.Summary.ScoringMethods)
	}
}

func TestCreateAnalysisFailsWhenModelScoringFails(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	scorer := &fakeModelScorer{modelErr: errors.New("model scorer unavailable")}
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  "model-v1",
		Store:               storage.NewMemoryStore(),
		Scorer:              scorer,
		UploadDir:           tempDir,
		TrainingDatasetPath: filepath.Join(tempDir, "snapshots.json"),
		TrainingRunsDir:     runsDir,
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
	})
	service.Start(ctx)

	created, _, err := service.CreateAnalysis(ctx, analysis.AnalysisSubmission{Kind: analysis.SubmissionDemo})
	if err != nil {
		t.Fatalf("CreateAnalysis returned error: %v", err)
	}

	completed := waitForAnalysis(t, ctx, service, created.ID)
	if scorer.modelCalls == 0 {
		t.Fatal("expected model scoring to be attempted")
	}
	if completed.Status != analysis.AnalysisStatusFailed {
		t.Fatalf("expected failed analysis when all model scoring fails, got %s", completed.Status)
	}
	job, err := service.GetJob(ctx, completed.LatestJobID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	if job.LastError != "all staged cold-start model scorers failed: logistic-regression-cold-start, xgboost-cold-start" {
		t.Fatalf("unexpected model scoring failure error: %q", job.LastError)
	}
}

func TestRepositorySubmissionCreatesRepositoryProfileWithoutManifest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	now := time.Now().UTC()
	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             &fakeModelScorer{},
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
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     runsDir,
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
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

	summary, err := service.GetTrainingDatasetSummary(ctx)
	if err != nil {
		t.Fatalf("GetTrainingDatasetSummary returned error: %v", err)
	}
	var repository *analysis.TrainingDatasetRepositorySummary
	for index := range summary.Repositories {
		if summary.Repositories[index].FullName == "facebook/react" {
			repository = &summary.Repositories[index]
			break
		}
	}
	if repository == nil {
		t.Fatalf("expected ranked training repository for facebook/react, got %#v", summary.Repositories)
	}
	if repository.SnapshotCount != 1 || repository.PackageCount != 1 || repository.AnalysisCount != 1 {
		t.Fatalf("unexpected ranked training repository: %#v", repository)
	}
	if repository.Stars != 230000 || repository.OpenIssues != 1000 {
		t.Fatalf("expected repository popularity and issue signals in training summary, got %#v", repository)
	}
	if repository.LastPushAgeDays == nil || *repository.LastPushAgeDays != 2 {
		t.Fatalf("expected activity signal in training summary, got %#v", repository)
	}
	if repository.RecentContributors90d == nil || *repository.RecentContributors90d != 35 {
		t.Fatalf("expected contributor activity signal in training summary, got %#v", repository)
	}
}

func TestRepositorySubmissionUsesCachedHistoricalFeaturesForModelScoring(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	now := time.Now().UTC()
	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	cachePath := filepath.Join(tempDir, "repository-feature-cache.json")
	writeModelArtifactBundle(t, runsDir)
	writeRunFixtureAt(
		t,
		cachePath,
		map[string]any{
			"updatedAt": now.Format(time.RFC3339Nano),
			"repositories": []map[string]any{
				{
					"repositoryFullName": "facebook/react",
					"repositoryUrl":      "https://github.com/facebook/react",
					"observedAt":         now.AddDate(0, 0, -1).Format(time.RFC3339Nano),
					"source":             "gharchive",
					"featureValues": map[string]float64{
						"contributors_90d":                      91,
						"top1_contributor_commit_share_365d":    0.77,
						"issue_backlog_growth_90d":              0.42,
						"pr_response_median_days_365d":          6,
						"issue_first_response_median_days_365d": 2,
						"issue_resolution_median_days_365d":     14,
						"stale_issue_share_at_obs":              0.25,
						"pr_merge_latency_median_days_365d":     3,
						"stars_total_at_obs":                    222000,
						"forks_total_at_obs":                    45000,
						"repo_archived_at_obs":                  0,
					},
				},
			},
		},
	)

	scorer := &fakeModelScorer{}
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             scorer,
		RepositoryClient: fakeGitHubClient{
			repository: &providers.RepositorySnapshot{
				FullName:                      "facebook/react",
				URL:                           "https://github.com/facebook/react",
				DefaultBranch:                 "main",
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
		UploadDir:                tempDir,
		TrainingDatasetPath:      filepath.Join(tempDir, "snapshots.json"),
		TrainingFeatureCachePath: cachePath,
		TrainingRunsDir:          runsDir,
		WorkerPollInterval:       10 * time.Millisecond,
		RetryDelay:               10 * time.Millisecond,
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
	if len(scorer.captured) == 0 || len(scorer.captured[0]) == 0 {
		t.Fatalf("expected scorer to capture dependencies, got %#v", scorer.captured)
	}

	features := scorer.captured[0][0].HistoricalFeatures
	if features["top1_contributor_commit_share_365d"] != 0.77 {
		t.Fatalf("expected cached concentration to win over GitHub approximation, got %#v", features)
	}
	if features["contributors_90d"] != 91 {
		t.Fatalf("expected cached contributor count, got %#v", features)
	}
	if features["days_since_last_commit"] != 2 {
		t.Fatalf("expected GitHub approximation to fill uncached activity age, got %#v", features)
	}
}

func TestRepositorySubmissionFiltersInvalidScorecardChecks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	now := time.Now().UTC()
	tempDir := t.TempDir()
	runsDir := filepath.Join(tempDir, "runs")
	writeModelArtifactBundle(t, runsDir)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion: "model-v1",
		Store:              storage.NewMemoryStore(),
		Scorer:             &fakeModelScorer{validateScorecard: true},
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
		UploadDir:           tempDir,
		TrainingDatasetPath: tempDir + "/snapshots.json",
		TrainingRunsDir:     runsDir,
		WorkerPollInterval:  10 * time.Millisecond,
		RetryDelay:          10 * time.Millisecond,
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

func writeModelArtifactBundle(t *testing.T, runsDir string) {
	t.Helper()

	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatalf("failed to create runs dir: %v", err)
	}

	runs := []analysis.TrainingRunArtifact{
		modelRunFixture("logistic-regression-full-history", "logistic_regression", filepath.Join(runsDir, "20260601-logistic-full.json")),
		modelRunFixture("xgboost-full-history", "xgboost", filepath.Join(runsDir, "20260601-xgboost-full.json")),
		modelRunFixture("logistic-regression-cold-start", "logistic_regression", filepath.Join(runsDir, "20260601-logistic-cold.json")),
		modelRunFixture("xgboost-cold-start", "xgboost", filepath.Join(runsDir, "20260601-xgboost-cold.json")),
	}
	for _, run := range runs {
		writeRunFixture(t, run)
	}
	writeRunFixtureAt(t, filepath.Join(filepath.Dir(runsDir), "latest-run.json"), runs[1])
}

func modelRunFixture(modelName string, algorithm string, artifactPath string) analysis.TrainingRunArtifact {
	ece := 0.07
	cachedAt := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	trainedAt := cachedAt.Format(time.RFC3339Nano)
	return analysis.TrainingRunArtifact{
		DatasetPath:  "tmp/training/snapshots.json",
		DatasetHash:  "fixture-dataset-hash",
		ArtifactPath: artifactPath,
		CachedAt:     cachedAt,
		Status:       "completed",
		ModelName:    modelName,
		ModelVersion: "0.2.0",
		TrainedAt:    trainedAt,
		Metrics: &analysis.TrainingRunMetrics{
			Threshold:                0.5,
			SampleCount:              4,
			PositiveRate:             0.5,
			Accuracy:                 0.75,
			Precision:                0.8,
			Recall:                   0.7,
			F1Score:                  0.746,
			BrierScore:               0.18,
			LogLoss:                  0.44,
			RocAuc:                   0.82,
			ExpectedCalibrationError: &ece,
			QualityScore:             0.72,
		},
		ModelArtifact: &analysis.TrainingRunModelArtifact{
			ModelName:      modelName,
			ModelVersion:   "0.2.0",
			FeatureVersion: modelFeatureVersionFixture(modelName),
			TrainedAt:      trainedAt,
			Threshold:      0.5,
			Algorithm:      algorithm,
			FeatureNames:   []string{"has_repository_mapping"},
			Coefficients:   []float64{1},
			Intercept:      0,
			Standardization: analysis.TrainingRunStandardizationProfile{
				Means:  []float64{0},
				Scales: []float64{1},
			},
			BoosterJSON:  "fixture",
			TreeCount:    1,
			MaxDepth:     2,
			LearningRate: 0.08,
		},
		Message: "fixture staged model artifact",
	}
}

func writeRunFixture(t *testing.T, run analysis.TrainingRunArtifact) {
	t.Helper()
	writeRunFixtureAt(t, run.ArtifactPath, run)
}

func modelFeatureVersionFixture(modelName string) string {
	if strings.Contains(modelName, "cold-start") {
		return "feature-set-v3-cold-start"
	}
	return "feature-set-v3-full-history"
}

func writeRunFixtureAt(t *testing.T, path string, value any) {
	t.Helper()
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal run fixture: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create run fixture dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("failed to write run fixture: %v", err)
	}
}

func currentModelResultsFixture() []analysis.ModelRiskProfile {
	trainedAt := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
	return []analysis.ModelRiskProfile{
		{
			ModelName:                  "logistic-regression-full-history",
			ModelVersion:               "0.2.0",
			Algorithm:                  "logistic_regression",
			TrainedAt:                  trainedAt,
			SampleCount:                4,
			InactivityRiskScore:        11,
			MaintenanceOutlook12MScore: 89,
			SecurityPostureScore:       83,
			ConfidenceScore:            0.91,
			RiskBucket:                 analysis.RiskBucket("low"),
			ActionLevel:                analysis.ActionLevel("monitor"),
		},
		{
			ModelName:                  "xgboost-full-history",
			ModelVersion:               "0.2.0",
			Algorithm:                  "xgboost",
			TrainedAt:                  trainedAt,
			SampleCount:                4,
			InactivityRiskScore:        11,
			MaintenanceOutlook12MScore: 89,
			SecurityPostureScore:       83,
			ConfidenceScore:            0.91,
			RiskBucket:                 analysis.RiskBucket("low"),
			ActionLevel:                analysis.ActionLevel("monitor"),
		},
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
