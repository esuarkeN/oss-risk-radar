package analysis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type trainingRepositoryAggregate struct {
	fullName                      string
	url                           string
	snapshotCount                 int
	packageKeys                   map[string]struct{}
	analysisIDs                   map[string]struct{}
	labeledSnapshotCount          int
	inactiveLabelCount            int
	archived                      bool
	stars                         int
	forks                         int
	openIssues                    int
	lastPushAgeDays               *int
	lastReleaseAgeDays            *int
	releaseCadenceDays            *int
	recentContributors90d         *int
	contributorConcentration      *float64
	openIssueGrowth90d            *float64
	pullRequestMedianResponseDays *float64
	lastObservedAt                string
}

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
	labeledSnapshots := 0
	inactiveLabelCount := 0
	realProjectLabeledSnapshots := 0
	repositoryAggregates := map[string]*trainingRepositoryAggregate{}
	for _, snapshot := range dataset.Snapshots {
		uniqueAnalyses[snapshot.AnalysisID] = struct{}{}
		packageKey := snapshot.Dependency.Ecosystem + "|" + snapshot.Dependency.PackageName
		uniquePackages[packageKey] = struct{}{}
		if snapshot.LabelInactive12M != nil {
			labeledSnapshots++
			if *snapshot.LabelInactive12M {
				inactiveLabelCount++
			}
			if hasTrainingSnapshotRepositoryIdentity(snapshot) {
				realProjectLabeledSnapshots++
			}
		}
		if snapshot.Dependency.Repository != nil && snapshot.Dependency.Repository.URL != "" {
			repository := snapshot.Dependency.Repository
			repositoryKey := repository.URL
			uniqueRepositories[repositoryKey] = struct{}{}
			aggregate := repositoryAggregates[repositoryKey]
			if aggregate == nil {
				aggregate = &trainingRepositoryAggregate{
					fullName:    repository.FullName,
					url:         repository.URL,
					packageKeys: map[string]struct{}{},
					analysisIDs: map[string]struct{}{},
				}
				repositoryAggregates[repositoryKey] = aggregate
			}

			if aggregate.fullName == "" {
				aggregate.fullName = repository.FullName
			}
			aggregate.snapshotCount++
			aggregate.packageKeys[packageKey] = struct{}{}
			aggregate.analysisIDs[snapshot.AnalysisID] = struct{}{}
			if snapshot.LabelInactive12M != nil {
				aggregate.labeledSnapshotCount++
				if *snapshot.LabelInactive12M {
					aggregate.inactiveLabelCount++
				}
			}
			aggregate.archived = aggregate.archived || repository.Archived
			if repository.Stars > aggregate.stars {
				aggregate.stars = repository.Stars
			}
			if repository.Forks > aggregate.forks {
				aggregate.forks = repository.Forks
			}
			if snapshot.ObservedAt >= aggregate.lastObservedAt {
				aggregate.lastObservedAt = snapshot.ObservedAt
				aggregate.openIssues = repository.OpenIssues
				aggregate.lastPushAgeDays = cloneIntPointer(repository.LastPushAgeDays)
				aggregate.lastReleaseAgeDays = cloneIntPointer(repository.LastReleaseAgeDays)
				aggregate.releaseCadenceDays = cloneIntPointer(repository.ReleaseCadenceDays)
				aggregate.recentContributors90d = cloneIntPointer(repository.RecentContributors90d)
				aggregate.contributorConcentration = cloneFloatPointer(repository.ContributorConcentration)
				aggregate.openIssueGrowth90d = cloneFloatPointer(repository.OpenIssueGrowth90d)
				aggregate.pullRequestMedianResponseDays = cloneFloatPointer(repository.PRResponseMedianDays)
			}
		}
	}

	var lastUpdatedAt *time.Time
	if !dataset.UpdatedAt.IsZero() {
		updatedAt := dataset.UpdatedAt.UTC()
		lastUpdatedAt = &updatedAt
	}

	return TrainingDatasetSummary{
		DatasetPath:                 m.path,
		TotalSnapshots:              len(dataset.Snapshots),
		LabeledSnapshots:            labeledSnapshots,
		InactiveLabelCount:          inactiveLabelCount,
		RealProjectLabeledSnapshots: realProjectLabeledSnapshots,
		UniqueAnalyses:              len(uniqueAnalyses),
		UniqueRepositories:          len(uniqueRepositories),
		UniquePackages:              len(uniquePackages),
		LastUpdatedAt:               lastUpdatedAt,
		AutoCaptureEnabled:          true,
		Repositories:                rankedTrainingRepositories(repositoryAggregates),
	}, nil
}

func rankedTrainingRepositories(aggregates map[string]*trainingRepositoryAggregate) []TrainingDatasetRepositorySummary {
	rows := make([]TrainingDatasetRepositorySummary, 0, len(aggregates))
	for _, aggregate := range aggregates {
		rows = append(rows, TrainingDatasetRepositorySummary{
			FullName:                      aggregate.fullName,
			URL:                           aggregate.url,
			SnapshotCount:                 aggregate.snapshotCount,
			PackageCount:                  len(aggregate.packageKeys),
			AnalysisCount:                 len(aggregate.analysisIDs),
			LabeledSnapshotCount:          aggregate.labeledSnapshotCount,
			InactiveLabelCount:            aggregate.inactiveLabelCount,
			Archived:                      aggregate.archived,
			Stars:                         aggregate.stars,
			Forks:                         aggregate.forks,
			OpenIssues:                    aggregate.openIssues,
			LastPushAgeDays:               cloneIntPointer(aggregate.lastPushAgeDays),
			LastReleaseAgeDays:            cloneIntPointer(aggregate.lastReleaseAgeDays),
			ReleaseCadenceDays:            cloneIntPointer(aggregate.releaseCadenceDays),
			RecentContributors90d:         cloneIntPointer(aggregate.recentContributors90d),
			ContributorConcentration:      cloneFloatPointer(aggregate.contributorConcentration),
			OpenIssueGrowth90d:            cloneFloatPointer(aggregate.openIssueGrowth90d),
			PullRequestMedianResponseDays: cloneFloatPointer(aggregate.pullRequestMedianResponseDays),
			LastObservedAt:                aggregate.lastObservedAt,
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SnapshotCount != rows[j].SnapshotCount {
			return rows[i].SnapshotCount > rows[j].SnapshotCount
		}
		if rows[i].PackageCount != rows[j].PackageCount {
			return rows[i].PackageCount > rows[j].PackageCount
		}
		return rows[i].FullName < rows[j].FullName
	})

	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneFloatPointer(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
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
	sortTrainingSnapshots(filtered)

	dataset.Snapshots = filtered
	dataset.UpdatedAt = time.Now().UTC()
	return m.write(dataset)
}

func (m *trainingDatasetManager) read() (trainingDatasetEnvelope, error) {
	return readTrainingDatasetFile(m.path)
}

func readTrainingDatasetFile(path string) (trainingDatasetEnvelope, error) {
	if path == "" {
		return trainingDatasetEnvelope{}, nil
	}
	payload, err := os.ReadFile(path)
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

func (m *trainingDatasetManager) BootstrapFromSeed(seedPath string, mergeExisting bool) (bool, error) {
	if m == nil || m.path == "" {
		return false, nil
	}

	seedDataset, err := readTrainingDatasetFile(seedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if len(seedDataset.Snapshots) == 0 {
		return false, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	merged := append([]TrainingSnapshotRecord(nil), seedDataset.Snapshots...)
	seen := make(map[string]struct{}, len(merged))
	for _, snapshot := range merged {
		seen[trainingSnapshotKey(snapshot)] = struct{}{}
	}

	if mergeExisting {
		currentDataset, err := m.read()
		if err != nil {
			return false, err
		}
		for _, snapshot := range currentDataset.Snapshots {
			if snapshot.LabelInactive12M != nil && !hasTrainingSnapshotRepositoryIdentity(snapshot) {
				continue
			}
			key := trainingSnapshotKey(snapshot)
			if _, exists := seen[key]; exists {
				continue
			}
			merged = append(merged, snapshot)
			seen[key] = struct{}{}
		}
		if currentDataset.UpdatedAt.After(seedDataset.UpdatedAt) {
			seedDataset.UpdatedAt = currentDataset.UpdatedAt
		}
	}

	sortTrainingSnapshots(merged)
	if seedDataset.UpdatedAt.IsZero() {
		seedDataset.UpdatedAt = time.Now().UTC()
	}
	return true, m.write(trainingDatasetEnvelope{UpdatedAt: seedDataset.UpdatedAt, Snapshots: merged})
}

func labeledTrainingSnapshotCount(snapshots []TrainingSnapshotRecord) int {
	count := 0
	for _, snapshot := range snapshots {
		if snapshot.LabelInactive12M != nil {
			count++
		}
	}
	return count
}

func realProjectLabeledTrainingSnapshotCount(snapshots []TrainingSnapshotRecord) int {
	count := 0
	for _, snapshot := range snapshots {
		if snapshot.LabelInactive12M != nil && hasTrainingSnapshotRepositoryIdentity(snapshot) {
			count++
		}
	}
	return count
}

func hasTrainingSnapshotRepositoryIdentity(snapshot TrainingSnapshotRecord) bool {
	repository := snapshot.Dependency.Repository
	if repository == nil {
		return false
	}
	if strings.TrimSpace(repository.FullName) == "" {
		return false
	}
	repositoryURL := strings.ToLower(strings.TrimSpace(repository.URL))
	return strings.HasPrefix(repositoryURL, "https://github.com/") || strings.HasPrefix(repositoryURL, "http://github.com/")
}

func trainingSnapshotKey(snapshot TrainingSnapshotRecord) string {
	return strings.Join([]string{
		snapshot.AnalysisID,
		snapshot.ObservedAt,
		snapshot.Dependency.DependencyID,
		snapshot.Dependency.Ecosystem,
		snapshot.Dependency.PackageName,
		snapshot.Dependency.PackageVersion,
	}, "\x00")
}

func sortTrainingSnapshots(snapshots []TrainingSnapshotRecord) {
	sort.Slice(snapshots, func(i, j int) bool {
		if snapshots[i].ObservedAt != snapshots[j].ObservedAt {
			return snapshots[i].ObservedAt < snapshots[j].ObservedAt
		}
		if snapshots[i].AnalysisID != snapshots[j].AnalysisID {
			return snapshots[i].AnalysisID < snapshots[j].AnalysisID
		}
		return snapshots[i].Dependency.DependencyID < snapshots[j].Dependency.DependencyID
	})
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
