package storage

import (
	"context"
	"sort"
	"sync"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
)

type MemoryStore struct {
	mu           sync.RWMutex
	analyses     map[string]analysis.AnalysisRecord
	jobs         map[string]analysis.JobRecord
	uploads      map[string]analysis.UploadArtifact
	dependencies map[string]analysis.DependencyRecord
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		analyses:     make(map[string]analysis.AnalysisRecord),
		jobs:         make(map[string]analysis.JobRecord),
		uploads:      make(map[string]analysis.UploadArtifact),
		dependencies: make(map[string]analysis.DependencyRecord),
	}
}

func (s *MemoryStore) Ready(context.Context) error { return nil }

func (s *MemoryStore) SaveUpload(_ context.Context, upload analysis.UploadArtifact) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.uploads[upload.ID] = upload
	return nil
}

func (s *MemoryStore) UpdateUpload(_ context.Context, upload analysis.UploadArtifact) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.uploads[upload.ID]; !ok {
		return analysis.ErrNotFound
	}
	s.uploads[upload.ID] = upload
	return nil
}

func (s *MemoryStore) GetUpload(_ context.Context, id string) (analysis.UploadArtifact, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	upload, ok := s.uploads[id]
	if !ok {
		return analysis.UploadArtifact{}, analysis.ErrNotFound
	}
	return upload, nil
}

func (s *MemoryStore) CreateAnalysisJob(_ context.Context, item analysis.AnalysisRecord, job analysis.JobRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if item.Submission.Kind == analysis.SubmissionUpload {
		if upload, ok := s.uploads[item.Submission.UploadID]; ok {
			upload.AnalysisID = item.ID
			s.uploads[upload.ID] = upload
			item.Uploads = []analysis.UploadArtifact{upload}
		}
	}
	s.analyses[item.ID] = item
	s.jobs[job.ID] = job
	return nil
}

func (s *MemoryStore) LeaseNextJob(_ context.Context, now time.Time) (analysis.JobRecord, analysis.AnalysisRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var selected analysis.JobRecord
	found := false
	for _, job := range s.jobs {
		if job.Status != analysis.JobStatusPending && job.Status != analysis.JobStatusFailed {
			continue
		}
		if job.NextRunAt != nil && job.NextRunAt.After(now) {
			continue
		}
		if found && !job.CreatedAt.Before(selected.CreatedAt) {
			continue
		}
		selected = job
		found = true
	}
	if !found {
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, analysis.ErrNotFound
	}

	selected.Status = analysis.JobStatusRunning
	selected.Attempts++
	selected.UpdatedAt = now
	s.jobs[selected.ID] = selected

	item := s.analyses[selected.AnalysisID]
	item.Status = analysis.AnalysisStatusRunning
	item.UpdatedAt = now
	item.LatestJobID = selected.ID
	item.Dependencies = s.dependenciesForAnalysisLocked(item.ID)
	item.Uploads = s.uploadsForAnalysisLocked(item.ID)
	item.Summary = summarize(item.Dependencies)
	s.analyses[item.ID] = item

	return selected, item, nil
}

func (s *MemoryStore) SaveAnalysisResult(_ context.Context, item analysis.AnalysisRecord, job analysis.JobRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for dependencyID, dependency := range s.dependencies {
		if dependency.AnalysisID == item.ID {
			delete(s.dependencies, dependencyID)
		}
	}
	for _, dependency := range item.Dependencies {
		s.dependencies[dependency.ID] = dependency
	}
	item.Uploads = s.uploadsForAnalysisLocked(item.ID)
	item.Summary = summarize(item.Dependencies)
	item.LatestJobID = job.ID
	s.analyses[item.ID] = item
	s.jobs[job.ID] = job
	return nil
}

func (s *MemoryStore) ListAnalyses(_ context.Context) ([]analysis.AnalysisRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]analysis.AnalysisRecord, 0, len(s.analyses))
	for _, item := range s.analyses {
		item.Dependencies = s.dependenciesForAnalysisLocked(item.ID)
		item.Uploads = s.uploadsForAnalysisLocked(item.ID)
		item.Summary = summarize(item.Dependencies)
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

func (s *MemoryStore) GetAnalysis(_ context.Context, id string) (analysis.AnalysisRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	item, ok := s.analyses[id]
	if !ok {
		return analysis.AnalysisRecord{}, analysis.ErrNotFound
	}
	item.Dependencies = s.dependenciesForAnalysisLocked(id)
	item.Uploads = s.uploadsForAnalysisLocked(id)
	item.Summary = summarize(item.Dependencies)
	return item, nil
}

func (s *MemoryStore) ListDependenciesByAnalysis(_ context.Context, analysisID string) ([]analysis.DependencyRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.dependenciesForAnalysisLocked(analysisID), nil
}

func (s *MemoryStore) GetDependency(_ context.Context, id string) (analysis.DependencyRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	dependency, ok := s.dependencies[id]
	if !ok {
		return analysis.DependencyRecord{}, analysis.ErrNotFound
	}
	return dependency, nil
}

func (s *MemoryStore) GetJob(_ context.Context, id string) (analysis.JobRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	if !ok {
		return analysis.JobRecord{}, analysis.ErrNotFound
	}
	return job, nil
}

func (s *MemoryStore) uploadsForAnalysisLocked(analysisID string) []analysis.UploadArtifact {
	uploads := make([]analysis.UploadArtifact, 0)
	for _, upload := range s.uploads {
		if upload.AnalysisID == analysisID {
			uploads = append(uploads, upload)
		}
	}
	sort.Slice(uploads, func(i, j int) bool { return uploads[i].UploadedAt.Before(uploads[j].UploadedAt) })
	return uploads
}

func (s *MemoryStore) dependenciesForAnalysisLocked(analysisID string) []analysis.DependencyRecord {
	dependencies := make([]analysis.DependencyRecord, 0)
	for _, dependency := range s.dependencies {
		if dependency.AnalysisID == analysisID {
			dependencies = append(dependencies, dependency)
		}
	}
	sort.Slice(dependencies, func(i, j int) bool {
		if dependencies[i].Direct != dependencies[j].Direct {
			return dependencies[i].Direct && !dependencies[j].Direct
		}
		return dependencies[i].PackageName < dependencies[j].PackageName
	})
	return dependencies
}

func summarize(dependencies []analysis.DependencyRecord) analysis.AnalysisSummary {
	summary := analysis.AnalysisSummary{
		DependencyCount:        len(dependencies),
		RiskDistribution:       map[string]int{"low": 0, "medium": 0, "high": 0, "critical": 0},
		EcosystemBreakdown:     map[string]int{},
		HighRiskCount:          0,
		MappedRepositoryCount:  0,
		ScoreAvailabilityCount: 0,
	}
	for _, dependency := range dependencies {
		summary.EcosystemBreakdown[dependency.Ecosystem]++
		if dependency.Repository != nil {
			summary.MappedRepositoryCount++
		}
		if dependency.RiskProfile == nil {
			continue
		}
		summary.ScoreAvailabilityCount++
		summary.RiskDistribution[string(dependency.RiskProfile.RiskBucket)]++
		if dependency.RiskProfile.RiskBucket == analysis.RiskBucket("high") || dependency.RiskProfile.RiskBucket == analysis.RiskBucket("critical") {
			summary.HighRiskCount++
		}
	}
	return summary
}
