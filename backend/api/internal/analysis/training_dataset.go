package analysis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type trainingDatasetEnvelope struct {
	UpdatedAt time.Time                `json:"updatedAt"`
	Snapshots []TrainingSnapshotRecord `json:"snapshots"`
}

type trainingDatasetManager struct {
	path string
	mu   sync.Mutex
}

func newTrainingDatasetManager(path string) *trainingDatasetManager {
	return &trainingDatasetManager{path: path}
}

func (m *trainingDatasetManager) Summary() (TrainingDatasetSummary, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	dataset, err := m.read()
	if err != nil {
		return TrainingDatasetSummary{}, err
	}

	uniqueAnalyses := map[string]struct{}{}
	uniqueRepositories := map[string]struct{}{}
	uniquePackages := map[string]struct{}{}
	for _, snapshot := range dataset.Snapshots {
		uniqueAnalyses[snapshot.AnalysisID] = struct{}{}
		packageKey := snapshot.Dependency.Ecosystem + "|" + snapshot.Dependency.PackageName
		uniquePackages[packageKey] = struct{}{}
		if snapshot.Dependency.Repository != nil && snapshot.Dependency.Repository.URL != "" {
			uniqueRepositories[snapshot.Dependency.Repository.URL] = struct{}{}
		}
	}

	var lastUpdatedAt *time.Time
	if !dataset.UpdatedAt.IsZero() {
		updatedAt := dataset.UpdatedAt.UTC()
		lastUpdatedAt = &updatedAt
	}

	return TrainingDatasetSummary{
		DatasetPath:        m.path,
		TotalSnapshots:     len(dataset.Snapshots),
		UniqueAnalyses:     len(uniqueAnalyses),
		UniqueRepositories: len(uniqueRepositories),
		UniquePackages:     len(uniquePackages),
		LastUpdatedAt:      lastUpdatedAt,
		AutoCaptureEnabled: true,
	}, nil
}

func (m *trainingDatasetManager) LoadSnapshots() ([]TrainingSnapshotRecord, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	dataset, err := m.read()
	if err != nil {
		return nil, "", err
	}

	snapshots := append([]TrainingSnapshotRecord(nil), dataset.Snapshots...)
	payload, err := json.Marshal(snapshots)
	if err != nil {
		return nil, "", err
	}
	checksum := sha256.Sum256(payload)
	return snapshots, hex.EncodeToString(checksum[:]), nil
}

func (m *trainingDatasetManager) UpsertAnalysisSnapshots(item AnalysisRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	dataset, err := m.read()
	if err != nil {
		return err
	}

	filtered := make([]TrainingSnapshotRecord, 0, len(dataset.Snapshots)+len(item.Dependencies))
	for _, snapshot := range dataset.Snapshots {
		if snapshot.AnalysisID != item.ID {
			filtered = append(filtered, snapshot)
		}
	}

	filtered = append(filtered, snapshotsFromAnalysis(item)...)
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].ObservedAt != filtered[j].ObservedAt {
			return filtered[i].ObservedAt < filtered[j].ObservedAt
		}
		if filtered[i].AnalysisID != filtered[j].AnalysisID {
			return filtered[i].AnalysisID < filtered[j].AnalysisID
		}
		return filtered[i].Dependency.DependencyID < filtered[j].Dependency.DependencyID
	})

	dataset.Snapshots = filtered
	dataset.UpdatedAt = time.Now().UTC()
	return m.write(dataset)
}

func (m *trainingDatasetManager) read() (trainingDatasetEnvelope, error) {
	if m == nil || m.path == "" {
		return trainingDatasetEnvelope{}, nil
	}
	payload, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			return trainingDatasetEnvelope{Snapshots: []TrainingSnapshotRecord{}}, nil
		}
		return trainingDatasetEnvelope{}, err
	}
	if len(payload) == 0 {
		return trainingDatasetEnvelope{Snapshots: []TrainingSnapshotRecord{}}, nil
	}

	var dataset trainingDatasetEnvelope
	if err := json.Unmarshal(payload, &dataset); err != nil {
		return trainingDatasetEnvelope{}, err
	}
	if dataset.Snapshots == nil {
		dataset.Snapshots = []TrainingSnapshotRecord{}
	}
	return dataset, nil
}

func (m *trainingDatasetManager) write(dataset trainingDatasetEnvelope) error {
	if m == nil || m.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(dataset, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.path, payload, 0o644)
}

func snapshotsFromAnalysis(item AnalysisRecord) []TrainingSnapshotRecord {
	observedAt := item.UpdatedAt.UTC().Format(time.RFC3339Nano)
	result := make([]TrainingSnapshotRecord, 0, len(item.Dependencies))
	for _, dependency := range item.Dependencies {
		snapshot := TrainingSnapshotRecord{
			AnalysisID: item.ID,
			ObservedAt: observedAt,
			Dependency: TrainingDependencySignalSnapshot{
				DependencyID:   dependency.ID,
				PackageName:    dependency.PackageName,
				PackageVersion: dependency.PackageVersion,
				Ecosystem:      dependency.Ecosystem,
				Direct:         dependency.Direct,
			},
		}

		if dependency.Repository != nil {
			lastPushAgeDays := dependency.Repository.LastPushAgeDays
			snapshot.Dependency.Repository = &TrainingRepositorySignalSnapshot{
				FullName:                 dependency.Repository.FullName,
				URL:                      dependency.Repository.URL,
				DefaultBranch:            dependency.Repository.DefaultBranch,
				Archived:                 dependency.Repository.Archived,
				Stars:                    dependency.Repository.Stars,
				Forks:                    dependency.Repository.Forks,
				OpenIssues:               dependency.Repository.OpenIssues,
				LastPushAgeDays:          &lastPushAgeDays,
				LastReleaseAgeDays:       dependency.Repository.LastReleaseAgeDays,
				ReleaseCadenceDays:       dependency.Repository.ReleaseCadenceDays,
				RecentContributors90d:    dependency.Repository.RecentContributors90d,
				ContributorConcentration: dependency.Repository.ContributorConcentration,
				OpenIssueGrowth90d:       dependency.Repository.OpenIssueGrowth90d,
				PRResponseMedianDays:     dependency.Repository.PullRequestMedianResponseDays,
			}
		}

		if normalizedScorecard := NormalizeScorecardSnapshot(dependency.Scorecard); normalizedScorecard != nil {
			score := normalizedScorecard.Score
			checks := make([]TrainingScorecardCheckSnapshot, 0, len(normalizedScorecard.Checks))
			for _, check := range normalizedScorecard.Checks {
				checks = append(checks, TrainingScorecardCheckSnapshot{Name: check.Name, Score: check.Score, Reason: check.Reason})
			}
			snapshot.Dependency.Scorecard = &TrainingScorecardSnapshot{Score: &score, Checks: checks}
		}

		result = append(result, snapshot)
	}
	return result
}
