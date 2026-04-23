package analysis

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"oss-risk-radar/backend/api/internal/manifest"
	"oss-risk-radar/backend/api/internal/providers"
)

var ErrNotFound = errors.New("resource not found")

type Scorer interface {
	Score(ctx context.Context, analysisID string, dependencies []DependencyRecord) (map[string]RiskProfile, error)
	Ready(ctx context.Context) error
}

type Store interface {
	Ready(ctx context.Context) error
	SaveUpload(ctx context.Context, upload UploadArtifact) error
	UpdateUpload(ctx context.Context, upload UploadArtifact) error
	GetUpload(ctx context.Context, id string) (UploadArtifact, error)
	CreateAnalysisJob(ctx context.Context, analysis AnalysisRecord, job JobRecord) error
	LeaseNextJob(ctx context.Context, now time.Time) (JobRecord, AnalysisRecord, error)
	SaveAnalysisResult(ctx context.Context, analysis AnalysisRecord, job JobRecord) error
	ListAnalyses(ctx context.Context) ([]AnalysisRecord, error)
	GetAnalysis(ctx context.Context, id string) (AnalysisRecord, error)
	ListDependenciesByAnalysis(ctx context.Context, analysisID string) ([]DependencyRecord, error)
	GetDependency(ctx context.Context, id string) (DependencyRecord, error)
	GetJob(ctx context.Context, id string) (JobRecord, error)
}

type ServiceOptions struct {
	MethodologyVersion  string
	Store               Store
	Scorer              Scorer
	ManifestFetcher     providers.GitHubClient
	PackageResolver     providers.DepsDevClient
	RepositoryClient    providers.GitHubClient
	ScorecardClient     providers.ScorecardClient
	UploadDir           string
	TrainingDatasetPath string
	TrainingRunsDir     string
	WorkerPollInterval  time.Duration
	RetryDelay          time.Duration
	Logger              *slog.Logger
}

type Service struct {
	methodologyVersion string
	store              Store
	scorer             Scorer
	manifestFetcher    providers.GitHubClient
	packageResolver    providers.DepsDevClient
	repositoryClient   providers.GitHubClient
	scorecardClient    providers.ScorecardClient
	uploadDir          string
	trainingDataset    *trainingDatasetManager
	trainingRuns       *trainingRunArtifactManager
	workerPollInterval time.Duration
	retryDelay         time.Duration
	logger             *slog.Logger
	startOnce          sync.Once
}

func NewServiceWithOptions(options ServiceOptions) *Service {
	logger := options.Logger
	if logger == nil {
		logger = slog.Default()
	}
	if options.UploadDir == "" {
		options.UploadDir = filepath.Join("tmp", "uploads")
	}
	if options.TrainingDatasetPath == "" {
		options.TrainingDatasetPath = filepath.Join("tmp", "training", "snapshots.json")
	}
	if options.TrainingRunsDir == "" {
		options.TrainingRunsDir = filepath.Join("tmp", "training", "runs")
	}
	if options.WorkerPollInterval <= 0 {
		options.WorkerPollInterval = 3 * time.Second
	}
	if options.RetryDelay <= 0 {
		options.RetryDelay = 30 * time.Second
	}
	_ = os.MkdirAll(options.UploadDir, 0o755)

	return &Service{
		methodologyVersion: options.MethodologyVersion,
		store:              options.Store,
		scorer:             options.Scorer,
		manifestFetcher:    options.ManifestFetcher,
		packageResolver:    options.PackageResolver,
		repositoryClient:   options.RepositoryClient,
		scorecardClient:    options.ScorecardClient,
		uploadDir:          options.UploadDir,
		trainingDataset:    newTrainingDatasetManager(options.TrainingDatasetPath),
		trainingRuns:       newTrainingRunArtifactManager(options.TrainingRunsDir),
		workerPollInterval: options.WorkerPollInterval,
		retryDelay:         options.RetryDelay,
		logger:             logger,
	}
}

func (s *Service) Start(ctx context.Context) {
	s.startOnce.Do(func() {
		go s.workerLoop(ctx)
	})
}

func (s *Service) CreateUpload(ctx context.Context, fileName string, contentType string, content []byte) (UploadArtifact, error) {
	if strings.TrimSpace(fileName) == "" {
		return UploadArtifact{}, errors.New("file name is required")
	}
	uploadID := newID("upload")
	safeName := sanitizeFileName(fileName)
	storagePath := filepath.Join(s.uploadDir, uploadID+"_"+safeName)
	if err := os.MkdirAll(filepath.Dir(storagePath), 0o755); err != nil {
		return UploadArtifact{}, err
	}
	if err := os.WriteFile(storagePath, content, 0o600); err != nil {
		return UploadArtifact{}, err
	}

	upload := UploadArtifact{
		ID:          uploadID,
		FileName:    safeName,
		ContentType: contentType,
		SizeBytes:   int64(len(content)),
		UploadedAt:  time.Now().UTC(),
		Status:      UploadStatusReceived,
		StorageHint: storagePath,
	}
	if err := s.store.SaveUpload(ctx, upload); err != nil {
		return UploadArtifact{}, err
	}
	return upload, nil
}

func (s *Service) ListAnalyses(ctx context.Context) ([]AnalysisRecord, error) {
	return s.store.ListAnalyses(ctx)
}

func (s *Service) CreateOrReuseAnalysis(ctx context.Context, submission AnalysisSubmission) (AnalysisRecord, JobRecord, bool, error) {
	if submission.Kind == SubmissionRepositoryURL {
		submission.RepositoryURL = NormalizeRepositoryURL(submission.RepositoryURL)
		reusedAnalysis, reusedJob, reused, err := s.findReusableAnalysis(ctx, submission)
		if err != nil {
			return AnalysisRecord{}, JobRecord{}, false, err
		}
		if reused {
			return reusedAnalysis, reusedJob, true, nil
		}
	}

	analysisRecord, jobRecord, err := s.CreateAnalysis(ctx, submission)
	if err != nil {
		return AnalysisRecord{}, JobRecord{}, false, err
	}
	return analysisRecord, jobRecord, false, nil
}

func (s *Service) CreateAnalysis(ctx context.Context, submission AnalysisSubmission) (AnalysisRecord, JobRecord, error) {
	if err := validateSubmission(submission); err != nil {
		return AnalysisRecord{}, JobRecord{}, err
	}
	if submission.Kind == SubmissionRepositoryURL {
		submission.RepositoryURL = NormalizeRepositoryURL(submission.RepositoryURL)
	}
	if submission.Kind == SubmissionUpload {
		if _, err := s.store.GetUpload(ctx, submission.UploadID); err != nil {
			return AnalysisRecord{}, JobRecord{}, err
		}
	}

	now := time.Now().UTC()
	analysisID := newID("analysis")
	jobID := newID("job")
	analysisRecord := AnalysisRecord{
		ID:                 analysisID,
		Status:             AnalysisStatusPending,
		CreatedAt:          now,
		UpdatedAt:          now,
		Submission:         submission,
		Summary:            summarizeDependencies(nil),
		MethodologyVersion: s.methodologyVersion,
		LatestJobID:        jobID,
	}
	jobRecord := JobRecord{
		ID:          jobID,
		AnalysisID:  analysisID,
		Type:        "analysis",
		Status:      JobStatusPending,
		Attempts:    0,
		MaxAttempts: 3,
		CreatedAt:   now,
		UpdatedAt:   now,
		Message:     "Analysis accepted and queued for parsing, enrichment, and scoring.",
	}

	if err := s.store.CreateAnalysisJob(ctx, analysisRecord, jobRecord); err != nil {
		return AnalysisRecord{}, JobRecord{}, err
	}
	return analysisRecord, jobRecord, nil
}

func (s *Service) findReusableAnalysis(ctx context.Context, submission AnalysisSubmission) (AnalysisRecord, JobRecord, bool, error) {
	if submission.Kind != SubmissionRepositoryURL {
		return AnalysisRecord{}, JobRecord{}, false, nil
	}

	normalizedURL := NormalizeRepositoryURL(submission.RepositoryURL)
	if normalizedURL == "" {
		return AnalysisRecord{}, JobRecord{}, false, nil
	}

	analyses, err := s.store.ListAnalyses(ctx)
	if err != nil {
		return AnalysisRecord{}, JobRecord{}, false, err
	}

	for _, existing := range analyses {
		if existing.Submission.Kind != SubmissionRepositoryURL {
			continue
		}
		if existing.Status != AnalysisStatusCompleted {
			continue
		}
		if NormalizeRepositoryURL(existing.Submission.RepositoryURL) != normalizedURL {
			continue
		}
		if len(existing.Dependencies) == 0 {
			continue
		}

		job, err := s.reusedJobForAnalysis(ctx, existing)
		if err != nil {
			return AnalysisRecord{}, JobRecord{}, false, err
		}
		return existing, job, true, nil
	}

	return AnalysisRecord{}, JobRecord{}, false, nil
}

func (s *Service) reusedJobForAnalysis(ctx context.Context, existing AnalysisRecord) (JobRecord, error) {
	if strings.TrimSpace(existing.LatestJobID) != "" {
		job, err := s.store.GetJob(ctx, existing.LatestJobID)
		if err == nil {
			return job, nil
		}
		if !errors.Is(err, ErrNotFound) {
			return JobRecord{}, err
		}
	}

	reusedAt := existing.UpdatedAt
	if reusedAt.IsZero() {
		reusedAt = time.Now().UTC()
	}
	return JobRecord{
		ID:         existing.LatestJobID,
		AnalysisID: existing.ID,
		Type:       "analysis",
		Status:     JobStatusCompleted,
		CreatedAt:  reusedAt,
		UpdatedAt:  reusedAt,
		Message:    "Existing completed analysis reused from cache.",
	}, nil
}

func (s *Service) GetAnalysis(ctx context.Context, id string) (AnalysisRecord, error) {
	return s.store.GetAnalysis(ctx, id)
}

func (s *Service) GetDependencies(ctx context.Context, analysisID string) ([]DependencyRecord, error) {
	if _, err := s.store.GetAnalysis(ctx, analysisID); err != nil {
		return nil, err
	}
	return s.store.ListDependenciesByAnalysis(ctx, analysisID)
}

func (s *Service) GetDependency(ctx context.Context, id string) (DependencyRecord, error) {
	return s.store.GetDependency(ctx, id)
}

func (s *Service) GetDependencyGraph(ctx context.Context, analysisID string) (DependencyGraphResponse, error) {
	analysisRecord, err := s.store.GetAnalysis(ctx, analysisID)
	if err != nil {
		return DependencyGraphResponse{}, err
	}
	return DependencyGraphResponse{AnalysisID: analysisID, Nodes: analysisRecord.Dependencies, Edges: analysisRecord.DependencyEdges}, nil
}

func (s *Service) GetJob(ctx context.Context, id string) (JobRecord, error) {
	return s.store.GetJob(ctx, id)
}

func (s *Service) Ready(ctx context.Context) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	return s.scorer.Ready(ctx)
}

func (s *Service) workerLoop(ctx context.Context) {
	ticker := time.NewTicker(s.workerPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			s.processNextJob(ctx)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) processNextJob(ctx context.Context) {
	job, queuedAnalysis, err := s.store.LeaseNextJob(ctx, time.Now().UTC())
	if err != nil {
		if !errors.Is(err, ErrNotFound) {
			s.logger.Warn("failed to lease analysis job", "error", err)
		}
		return
	}

	result, err := s.executeAnalysis(ctx, queuedAnalysis)
	if err != nil {
		s.handleProcessingError(ctx, queuedAnalysis, job, err)
		return
	}

	completedAt := time.Now().UTC()
	result.Status = AnalysisStatusCompleted
	result.UpdatedAt = completedAt
	result.MethodologyVersion = s.methodologyVersion
	result.LatestJobID = job.ID

	job.Status = JobStatusCompleted
	job.UpdatedAt = completedAt
	job.LastError = ""
	job.NextRunAt = nil
	job.Message = "Analysis completed with parsed dependency metadata, provider enrichment, and runtime scoring."

	if err := s.store.SaveAnalysisResult(ctx, result, job); err != nil {
		s.logger.Error("failed to persist completed analysis", "analysis_id", result.ID, "job_id", job.ID, "error", err)
		return
	}
	if err := s.trainingDataset.UpsertAnalysisSnapshots(result); err != nil {
		s.logger.Warn("failed to refresh training dataset", "analysis_id", result.ID, "dataset_path", s.trainingDataset.path, "error", err)
	}
}

func (s *Service) executeAnalysis(ctx context.Context, queued AnalysisRecord) (AnalysisRecord, error) {
	analysisRecord := queued
	analysisRecord.Status = AnalysisStatusRunning
	analysisRecord.UpdatedAt = time.Now().UTC()

	var dependencies []DependencyRecord
	switch queued.Submission.Kind {
	case SubmissionDemo:
		dependencies = DemoDependencies(queued.ID, time.Now().UTC())
	case SubmissionUpload:
		upload, err := s.store.GetUpload(ctx, queued.Submission.UploadID)
		if err != nil {
			return analysisRecord, err
		}
		parsed, err := s.parseUpload(upload)
		if err != nil {
			upload.Status = UploadStatusFailed
			upload.ParseError = err.Error()
			_ = s.store.UpdateUpload(ctx, upload)
			return analysisRecord, err
		}
		upload.Status = UploadStatusParsed
		upload.ParseError = ""
		if err := s.store.UpdateUpload(ctx, upload); err != nil {
			s.logger.Warn("failed to update upload status", "upload_id", upload.ID, "error", err)
		}
		dependencies = parsed
	case SubmissionRepositoryURL:
		parsed, err := s.parseRepositorySubmission(ctx, queued.Submission)
		if err != nil {
			return analysisRecord, err
		}
		dependencies = parsed
	default:
		return analysisRecord, errors.New("unsupported submission kind")
	}

	for index := range dependencies {
		if dependencies[index].ID == "" {
			dependencies[index].ID = newID("dep")
		}
		if dependencies[index].AnalysisID == "" {
			dependencies[index].AnalysisID = queued.ID
		}
	}

	if queued.Submission.Kind != SubmissionDemo {
		dependencies = s.enrichDependencies(ctx, dependencies)
	}

	scores, err := s.scoreDependencies(ctx, queued.ID, dependencies)
	if err != nil {
		return analysisRecord, err
	}
	for index := range dependencies {
		if score, ok := scores[dependencies[index].ID]; ok {
			scored := score
			dependencies[index].RiskProfile = &scored
		}
	}

	analysisRecord.Dependencies = dependencies
	analysisRecord.DependencyEdges = buildDependencyEdges(analysisRecord.ID, dependencies)
	analysisRecord.Summary = summarizeDependencies(dependencies)
	if queued.Submission.Kind == SubmissionUpload {
		if upload, err := s.store.GetUpload(ctx, queued.Submission.UploadID); err == nil {
			analysisRecord.Uploads = []UploadArtifact{upload}
		}
	}
	return analysisRecord, nil
}

func (s *Service) scoreDependencies(ctx context.Context, analysisID string, dependencies []DependencyRecord) (map[string]RiskProfile, error) {
	if s.trainingRuns != nil {
		latestRun, err := s.trainingRuns.Latest()
		if err != nil {
			s.logger.Warn("failed to read latest training artifact", "analysis_id", analysisID, "error", err)
		} else if latestRun != nil && latestRun.Status == "completed" && latestRun.ModelArtifact != nil {
			modelScorer, ok := s.scorer.(modelCapableScorer)
			if ok {
				scores, scoreErr := modelScorer.ScoreModel(ctx, analysisID, dependencies, *latestRun.ModelArtifact)
				if scoreErr == nil {
					return scores, nil
				}
				s.logger.Warn(
					"model scoring failed, falling back to heuristic scoring",
					"analysis_id", analysisID,
					"model_name", latestRun.ModelArtifact.ModelName,
					"model_version", latestRun.ModelArtifact.ModelVersion,
					"error", scoreErr,
				)
			}
		}
	}

	return s.scorer.Score(ctx, analysisID, dependencies)
}

func (s *Service) parseUpload(upload UploadArtifact) ([]DependencyRecord, error) {
	content, err := os.ReadFile(upload.StorageHint)
	if err != nil {
		return nil, err
	}
	packages, err := manifest.ParseArtifact(upload.FileName, content)
	if err != nil {
		return nil, fmt.Errorf("parse upload: %w", err)
	}
	return packageRefsToDependencies(upload.AnalysisID, upload.ID, packages.Dependencies), nil
}

func (s *Service) parseRepositorySubmission(ctx context.Context, submission AnalysisSubmission) ([]DependencyRecord, error) {
	if s.manifestFetcher == nil && s.repositoryClient == nil && s.scorecardClient == nil {
		return nil, errors.New("repository analysis is unavailable without a GitHub client")
	}

	repositoryProfile := repositoryProfileDependency(submission)
	candidates := manifestCandidates(submission.ArtifactName)
	merged := map[string]DependencyRecord{}
	parsedAny := false

	if s.manifestFetcher != nil {
		for _, candidate := range candidates {
			content, err := s.manifestFetcher.FetchManifest(ctx, submission.RepositoryURL, candidate)
			if err != nil {
				continue
			}
			packages, err := manifest.ParseArtifact(candidate, content)
			if err != nil {
				continue
			}
			parsedAny = true
			for _, dependency := range packageRefsToDependencies("", "", packages.Dependencies) {
				key := dependency.Ecosystem + "|" + dependency.PackageName + "|" + dependency.PackageVersion
				existing, ok := merged[key]
				if ok {
					if dependency.Direct {
						existing.Direct = true
					}
					if len(existing.DependencyPath) == 0 || len(dependency.DependencyPath) < len(existing.DependencyPath) {
						existing.DependencyPath = dependency.DependencyPath
					}
					merged[key] = existing
					continue
				}
				merged[key] = dependency
			}
		}
	}

	dependencies := make([]DependencyRecord, 0, len(merged)+1)
	dependencies = append(dependencies, repositoryProfile)
	for _, dependency := range merged {
		dependencies = append(dependencies, dependency)
	}
	sort.Slice(dependencies, func(i, j int) bool {
		if dependencies[i].PackageVersion == "repository profile" || dependencies[j].PackageVersion == "repository profile" {
			return dependencies[i].PackageVersion == "repository profile"
		}
		if dependencies[i].Direct != dependencies[j].Direct {
			return dependencies[i].Direct && !dependencies[j].Direct
		}
		if dependencies[i].Ecosystem != dependencies[j].Ecosystem {
			return dependencies[i].Ecosystem < dependencies[j].Ecosystem
		}
		return dependencies[i].PackageName < dependencies[j].PackageName
	})

	if !parsedAny {
		s.logger.Info("repository submission produced repository profile without supported manifests", "repository_url", submission.RepositoryURL)
	}
	return dependencies, nil
}

func (s *Service) enrichDependencies(ctx context.Context, dependencies []DependencyRecord) []DependencyRecord {
	for index := range dependencies {
		dependency := dependencies[index]
		repositoryURL := ""
		if dependency.Repository != nil {
			repositoryURL = dependency.Repository.URL
		}
		if repositoryURL == "" && s.packageResolver != nil {
			if metadata, err := s.packageResolver.ResolvePackage(ctx, dependency.Ecosystem, dependency.PackageName, dependency.PackageVersion); err == nil {
				repositoryURL = metadata.RepositoryURL
			}
		}
		if repositoryURL == "" {
			repositoryURL = inferRepositoryURL(dependency)
		}
		if repositoryURL != "" {
			dependency.Repository = &RepositorySnapshot{URL: repositoryURL, FullName: strings.TrimPrefix(strings.TrimPrefix(repositoryURL, "https://github.com/"), "http://github.com/"), DefaultBranch: "main"}
		}
		if dependency.Repository != nil && dependency.Repository.URL != "" && s.repositoryClient != nil {
			if repositorySnapshot, err := s.repositoryClient.GetRepository(ctx, dependency.Repository.URL); err == nil && repositorySnapshot != nil {
				dependency.Repository = providerRepositoryToAnalysis(*repositorySnapshot)
			}
		}
		if dependency.Repository != nil && dependency.Repository.URL != "" && s.scorecardClient != nil {
			if scorecardSnapshot, err := s.scorecardClient.GetScorecard(ctx, dependency.Repository.URL); err == nil && scorecardSnapshot != nil {
				dependency.Scorecard = providerScorecardToAnalysis(*scorecardSnapshot)
			}
		}
		dependency.RawSignals = buildRawSignals(dependency)
		dependency.RawSignalsAvailable = len(dependency.RawSignals) > 0
		dependencies[index] = dependency
	}
	return dependencies
}

func (s *Service) handleProcessingError(ctx context.Context, analysisRecord AnalysisRecord, job JobRecord, processingErr error) {
	now := time.Now().UTC()
	analysisRecord.UpdatedAt = now
	analysisRecord.MethodologyVersion = s.methodologyVersion
	analysisRecord.LatestJobID = job.ID
	job.UpdatedAt = now
	job.LastError = processingErr.Error()

	if job.Attempts >= job.MaxAttempts {
		analysisRecord.Status = AnalysisStatusFailed
		job.Status = JobStatusFailed
		job.NextRunAt = nil
		job.Message = "Analysis failed after exhausting retries."
	} else {
		analysisRecord.Status = AnalysisStatusPending
		job.Status = JobStatusPending
		nextRunAt := now.Add(s.retryDelay)
		job.NextRunAt = &nextRunAt
		job.Message = "Analysis processing failed; retry scheduled."
	}

	if err := s.store.SaveAnalysisResult(ctx, analysisRecord, job); err != nil {
		s.logger.Error("failed to persist errored analysis", "analysis_id", analysisRecord.ID, "job_id", job.ID, "error", err)
		return
	}
	s.logger.Warn("analysis processing failed", "analysis_id", analysisRecord.ID, "job_id", job.ID, "attempts", job.Attempts, "error", processingErr)
}

func validateSubmission(submission AnalysisSubmission) error {
	switch submission.Kind {
	case SubmissionDemo:
		return nil
	case SubmissionRepositoryURL:
		if strings.TrimSpace(submission.RepositoryURL) == "" {
			return errors.New("repositoryUrl is required")
		}
		return nil
	case SubmissionUpload:
		if strings.TrimSpace(submission.UploadID) == "" {
			return errors.New("uploadId is required")
		}
		return nil
	default:
		return errors.New("unsupported submission kind")
	}
}

func packageRefsToDependencies(analysisID string, uploadID string, packages []manifest.PackageRef) []DependencyRecord {
	dependencies := make([]DependencyRecord, 0, len(packages))
	for _, pkg := range packages {
		dependency := DependencyRecord{
			ID:                  newID("dep"),
			AnalysisID:          analysisID,
			PackageName:         pkg.Name,
			PackageVersion:      pkg.Version,
			Ecosystem:           pkg.Ecosystem,
			Direct:              pkg.Direct,
			DependencyPath:      pkg.Path,
			RawSignalsAvailable: false,
			ParsedFromUploadID:  uploadID,
		}
		dependencies = append(dependencies, dependency)
	}
	return dependencies
}

func repositoryProfileDependency(submission AnalysisSubmission) DependencyRecord {
	repositoryURL := NormalizeRepositoryURL(submission.RepositoryURL)
	fullName := repositoryDisplayNameFromURL(repositoryURL)
	if fullName == "" {
		fullName = repositoryURL
	}

	return DependencyRecord{
		ID:                  newID("dep"),
		PackageName:         fullName,
		PackageVersion:      "repository profile",
		Ecosystem:           "unknown",
		Direct:              true,
		DependencyPath:      []string{fullName},
		RawSignalsAvailable: false,
		Repository: &RepositorySnapshot{
			FullName:      fullName,
			URL:           repositoryURL,
			DefaultBranch: "main",
		},
	}
}

func repositoryDisplayNameFromURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return strings.Trim(strings.TrimSuffix(strings.TrimPrefix(raw, "https://github.com/"), ".git"), "/")
	}

	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) >= 2 {
		return parts[0] + "/" + parts[1]
	}
	return strings.Trim(parsed.Path, "/")
}

func providerRepositoryToAnalysis(snapshot providers.RepositorySnapshot) *RepositorySnapshot {
	return &RepositorySnapshot{
		FullName:                      snapshot.FullName,
		URL:                           snapshot.URL,
		DefaultBranch:                 snapshot.DefaultBranch,
		Archived:                      snapshot.Archived,
		Stars:                         snapshot.Stars,
		Forks:                         snapshot.Forks,
		OpenIssues:                    snapshot.OpenIssues,
		LastPushAt:                    snapshot.LastPushAt,
		LastReleaseAt:                 snapshot.LastReleaseAt,
		RecentContributors90d:         snapshot.RecentContributors90d,
		ContributorConcentration:      snapshot.ContributorConcentration,
		PullRequestMedianResponseDays: snapshot.PullRequestMedianResponseDays,
		LastPushAgeDays:               snapshot.LastPushAgeDays,
		LastReleaseAgeDays:            snapshot.LastReleaseAgeDays,
		ReleaseCadenceDays:            snapshot.ReleaseCadenceDays,
		OpenIssueGrowth90d:            snapshot.OpenIssueGrowth90d,
	}
}

func providerScorecardToAnalysis(snapshot providers.ScorecardSnapshot) *ScorecardSnapshot {
	checks := make([]ScorecardCheck, 0, len(snapshot.Checks))
	for _, check := range snapshot.Checks {
		checks = append(checks, ScorecardCheck{Name: check.Name, Score: check.Score, Reason: check.Reason})
	}
	return NormalizeScorecardSnapshot(&ScorecardSnapshot{Score: snapshot.Score, Checks: checks})
}

func buildRawSignals(dependency DependencyRecord) []RawSignalItem {
	signals := make([]RawSignalItem, 0)
	if dependency.Repository != nil {
		observedAt := dependency.Repository.LastPushAt
		signals = append(signals,
			NewRawSignal("repository.archived", dependency.Repository.Archived, "github", &observedAt),
			NewRawSignal("repository.stars", dependency.Repository.Stars, "github", &observedAt),
			NewRawSignal("repository.forks", dependency.Repository.Forks, "github", &observedAt),
			NewRawSignal("repository.open_issues", dependency.Repository.OpenIssues, "github", &observedAt),
			NewRawSignal("repository.last_push_age_days", dependency.Repository.LastPushAgeDays, "github", &observedAt),
		)
		if dependency.Repository.LastReleaseAgeDays != nil {
			signals = append(signals, NewRawSignal("repository.last_release_age_days", *dependency.Repository.LastReleaseAgeDays, "github", &observedAt))
		}
		if dependency.Repository.ReleaseCadenceDays != nil {
			signals = append(signals, NewRawSignal("repository.release_cadence_days", *dependency.Repository.ReleaseCadenceDays, "github", &observedAt))
		}
		if dependency.Repository.RecentContributors90d != nil {
			signals = append(signals, NewRawSignal("repository.recent_contributors_90d", *dependency.Repository.RecentContributors90d, "github", &observedAt))
		}
		if dependency.Repository.ContributorConcentration != nil {
			signals = append(signals, NewRawSignal("repository.contributor_concentration", *dependency.Repository.ContributorConcentration, "github", &observedAt))
		}
		if dependency.Repository.OpenIssueGrowth90d != nil {
			signals = append(signals, NewRawSignal("repository.open_issue_growth_90d", *dependency.Repository.OpenIssueGrowth90d, "github", &observedAt))
		}
		if dependency.Repository.PullRequestMedianResponseDays != nil {
			signals = append(signals, NewRawSignal("repository.pr_median_response_days", *dependency.Repository.PullRequestMedianResponseDays, "github", &observedAt))
		}
	}
	if dependency.Scorecard != nil {
		signals = append(signals, NewRawSignal("scorecard.score", dependency.Scorecard.Score, "openssf_scorecard", nil))
		for _, check := range dependency.Scorecard.Checks {
			signals = append(signals, NewRawSignal("scorecard.check."+strings.ToLower(strings.ReplaceAll(check.Name, " ", "_")), check.Score, "openssf_scorecard", nil))
		}
	}
	return signals
}

func buildDependencyEdges(analysisID string, dependencies []DependencyRecord) []DependencyEdge {
	nameToID := map[string]string{}
	for _, dependency := range dependencies {
		if _, exists := nameToID[dependency.PackageName]; !exists {
			nameToID[dependency.PackageName] = dependency.ID
		}
	}

	seen := map[string]bool{}
	edges := make([]DependencyEdge, 0)
	rootNode := "root:" + analysisID
	for _, dependency := range dependencies {
		if len(dependency.DependencyPath) <= 1 {
			if dependency.Direct {
				key := rootNode + "->" + dependency.ID
				if !seen[key] {
					seen[key] = true
					edges = append(edges, DependencyEdge{From: rootNode, To: dependency.ID, Kind: "direct"})
				}
			}
			continue
		}

		for index := 1; index < len(dependency.DependencyPath); index++ {
			currentName := dependency.DependencyPath[index]
			currentID := nameToID[currentName]
			if currentID == "" {
				continue
			}
			if index == 1 {
				key := rootNode + "->" + currentID
				if !seen[key] {
					seen[key] = true
					kind := "direct"
					if !dependency.Direct {
						kind = "transitive"
					}
					edges = append(edges, DependencyEdge{From: rootNode, To: currentID, Kind: kind})
				}
				continue
			}

			previousID := nameToID[dependency.DependencyPath[index-1]]
			if previousID == "" {
				continue
			}
			key := previousID + "->" + currentID
			if !seen[key] {
				seen[key] = true
				edges = append(edges, DependencyEdge{From: previousID, To: currentID, Kind: "transitive"})
			}
		}
	}
	return edges
}

func summarizeDependencies(dependencies []DependencyRecord) AnalysisSummary {
	summary := AnalysisSummary{
		DependencyCount:        len(dependencies),
		HighRiskCount:          0,
		MappedRepositoryCount:  0,
		ScoreAvailabilityCount: 0,
		RiskDistribution: map[string]int{
			"low":      0,
			"medium":   0,
			"high":     0,
			"critical": 0,
		},
		EcosystemBreakdown: map[string]int{},
	}
	for _, dependency := range dependencies {
		if dependency.Repository != nil {
			summary.MappedRepositoryCount++
		}
		summary.EcosystemBreakdown[dependency.Ecosystem]++
		if dependency.RiskProfile == nil {
			continue
		}
		summary.ScoreAvailabilityCount++
		summary.RiskDistribution[string(dependency.RiskProfile.RiskBucket)]++
		if dependency.RiskProfile.RiskBucket == RiskBucket("high") || dependency.RiskProfile.RiskBucket == RiskBucket("critical") {
			summary.HighRiskCount++
		}
	}
	return summary
}

func inferRepositoryURL(dependency DependencyRecord) string {
	if strings.HasPrefix(dependency.PackageName, "github.com/") {
		parts := strings.Split(strings.TrimPrefix(dependency.PackageName, "github.com/"), "/")
		if len(parts) >= 2 {
			return "https://github.com/" + parts[0] + "/" + parts[1]
		}
	}
	return ""
}

func manifestCandidates(artifactName string) []string {
	if trimmed := strings.TrimSpace(artifactName); trimmed != "" {
		return []string{trimmed}
	}
	return []string{"package-lock.json", "requirements.txt", "poetry.lock", "go.mod"}
}

func sanitizeFileName(fileName string) string {
	cleaned := filepath.Base(strings.ReplaceAll(fileName, "\\", "/"))
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return "upload.dat"
	}
	return cleaned
}

func newID(prefix string) string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return prefix + "_fallback"
	}
	return prefix + "_" + hex.EncodeToString(buffer)
}
