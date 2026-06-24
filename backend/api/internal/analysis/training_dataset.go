package analysis

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
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

// datasetHashFloat preserves the Python artifact exporter's canonical JSON
// representation for float-valued signals. In particular, integer-valued
// floats remain `1.0` instead of being shortened to `1` by encoding/json.
type datasetHashFloat float64

func (value datasetHashFloat) MarshalJSON() ([]byte, error) {
	numeric := float64(value)
	if math.IsNaN(numeric) || math.IsInf(numeric, 0) {
		return nil, &json.UnsupportedValueError{Value: reflect.ValueOf(numeric), Str: strconv.FormatFloat(numeric, 'g', -1, 64)}
	}
	absolute := math.Abs(numeric)
	formatted := ""
	if numeric != 0 && (absolute < 1e-4 || absolute >= 1e16) {
		formatted = strconv.FormatFloat(numeric, 'e', -1, 64)
	} else {
		formatted = strconv.FormatFloat(numeric, 'f', -1, 64)
		if !strings.Contains(formatted, ".") {
			formatted += ".0"
		}
	}
	return []byte(formatted), nil
}

type datasetHashScorecardCheck struct {
	Name   string           `json:"name"`
	Score  datasetHashFloat `json:"score"`
	Reason string           `json:"reason"`
}

type datasetHashScorecard struct {
	Score  *datasetHashFloat           `json:"score,omitempty"`
	Checks []datasetHashScorecardCheck `json:"checks"`
}

type datasetHashRepository struct {
	FullName                 string            `json:"full_name"`
	URL                      string            `json:"url"`
	DefaultBranch            string            `json:"default_branch"`
	Archived                 bool              `json:"archived"`
	Stars                    int               `json:"stars"`
	Forks                    int               `json:"forks"`
	OpenIssues               int               `json:"open_issues"`
	LastPushAgeDays          *int              `json:"last_push_age_days,omitempty"`
	LastReleaseAgeDays       *int              `json:"last_release_age_days,omitempty"`
	ReleaseCadenceDays       *int              `json:"release_cadence_days,omitempty"`
	RecentContributors90d    *int              `json:"recent_contributors_90d,omitempty"`
	ContributorConcentration *datasetHashFloat `json:"contributor_concentration,omitempty"`
	OpenIssueGrowth90d       *datasetHashFloat `json:"open_issue_growth_90d,omitempty"`
	PRResponseMedianDays     *datasetHashFloat `json:"pr_response_median_days,omitempty"`
}

type datasetHashDependency struct {
	DependencyID       string                      `json:"dependency_id"`
	PackageName        string                      `json:"package_name"`
	PackageVersion     string                      `json:"package_version"`
	Ecosystem          string                      `json:"ecosystem"`
	Direct             bool                        `json:"direct"`
	Repository         *datasetHashRepository      `json:"repository,omitempty"`
	Scorecard          *datasetHashScorecard       `json:"scorecard,omitempty"`
	HistoricalFeatures map[string]datasetHashFloat `json:"historical_features,omitempty"`
}

type datasetHashSnapshot struct {
	AnalysisID       string                `json:"analysis_id"`
	ObservedAt       string                `json:"observed_at"`
	Dependency       datasetHashDependency `json:"dependency"`
	LabelInactive12M *bool                 `json:"label_inactive_12m,omitempty"`
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

func datasetHashFloatPointer(value *float64) *datasetHashFloat {
	if value == nil {
		return nil
	}
	converted := datasetHashFloat(*value)
	return &converted
}

func canonicalDatasetHashSnapshot(snapshot TrainingSnapshotRecord) datasetHashSnapshot {
	dependency := snapshot.Dependency
	canonicalDependency := datasetHashDependency{
		DependencyID:   dependency.DependencyID,
		PackageName:    dependency.PackageName,
		PackageVersion: dependency.PackageVersion,
		Ecosystem:      dependency.Ecosystem,
		Direct:         dependency.Direct,
	}
	if dependency.Repository != nil {
		repository := dependency.Repository
		canonicalDependency.Repository = &datasetHashRepository{
			FullName:                 repository.FullName,
			URL:                      repository.URL,
			DefaultBranch:            repository.DefaultBranch,
			Archived:                 repository.Archived,
			Stars:                    repository.Stars,
			Forks:                    repository.Forks,
			OpenIssues:               repository.OpenIssues,
			LastPushAgeDays:          cloneIntPointer(repository.LastPushAgeDays),
			LastReleaseAgeDays:       cloneIntPointer(repository.LastReleaseAgeDays),
			ReleaseCadenceDays:       cloneIntPointer(repository.ReleaseCadenceDays),
			RecentContributors90d:    cloneIntPointer(repository.RecentContributors90d),
			ContributorConcentration: datasetHashFloatPointer(repository.ContributorConcentration),
			OpenIssueGrowth90d:       datasetHashFloatPointer(repository.OpenIssueGrowth90d),
			PRResponseMedianDays:     datasetHashFloatPointer(repository.PRResponseMedianDays),
		}
	}
	if dependency.Scorecard != nil {
		scorecard := dependency.Scorecard
		checks := make([]datasetHashScorecardCheck, len(scorecard.Checks))
		for index, check := range scorecard.Checks {
			checks[index] = datasetHashScorecardCheck{
				Name:   check.Name,
				Score:  datasetHashFloat(check.Score),
				Reason: check.Reason,
			}
		}
		canonicalDependency.Scorecard = &datasetHashScorecard{
			Score:  datasetHashFloatPointer(scorecard.Score),
			Checks: checks,
		}
	}
	if len(dependency.HistoricalFeatures) > 0 {
		canonicalDependency.HistoricalFeatures = make(map[string]datasetHashFloat, len(dependency.HistoricalFeatures))
		for name, value := range dependency.HistoricalFeatures {
			canonicalDependency.HistoricalFeatures[name] = datasetHashFloat(value)
		}
	}
	return datasetHashSnapshot{
		AnalysisID:       snapshot.AnalysisID,
		ObservedAt:       snapshot.ObservedAt,
		Dependency:       canonicalDependency,
		LabelInactive12M: snapshot.LabelInactive12M,
	}
}

func canonicalDatasetHashSnapshots(snapshots []TrainingSnapshotRecord) []datasetHashSnapshot {
	canonical := make([]datasetHashSnapshot, len(snapshots))
	for index, snapshot := range snapshots {
		canonical[index] = canonicalDatasetHashSnapshot(snapshot)
	}
	return canonical
}

func (m *trainingDatasetManager) LoadSnapshots() ([]TrainingSnapshotRecord, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	dataset, err := m.read()
	if err != nil {
		return nil, "", err
	}

	snapshots := append([]TrainingSnapshotRecord(nil), dataset.Snapshots...)
	var payload bytes.Buffer
	encoder := json.NewEncoder(&payload)
	encoder.SetEscapeHTML(false)
	err = encoder.Encode(canonicalDatasetHashSnapshots(snapshots))
	if err != nil {
		return nil, "", err
	}
	checksum := sha256.Sum256(bytes.TrimSuffix(payload.Bytes(), []byte("\n")))
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
		verifiedLiveAnalyses := map[string]struct{}{}
		for _, snapshot := range currentDataset.Snapshots {
			analysisID := strings.TrimSpace(snapshot.AnalysisID)
			if snapshot.LabelInactive12M == nil && analysisID != "" && !strings.HasPrefix(analysisID, "dataset:") && hasTrainingSnapshotRepositoryIdentity(snapshot) {
				verifiedLiveAnalyses[analysisID] = struct{}{}
			}
		}
		for _, snapshot := range currentDataset.Snapshots {
			// Historical dataset rows are replaced by the staged offline corpus.
			// Keep every unlabeled capture from a live analysis once at least one
			// snapshot in that analysis has a valid GitHub repository identity. This
			// preserves unmapped manifest dependencies without trusting unmapped-only
			// or synthetic analyses.
			analysisID := strings.TrimSpace(snapshot.AnalysisID)
			_, verified := verifiedLiveAnalyses[analysisID]
			if snapshot.LabelInactive12M != nil || strings.HasPrefix(analysisID, "dataset:") || !verified {
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

func hasTrainingSnapshotRepositoryIdentity(snapshot TrainingSnapshotRecord) bool {
	repository := snapshot.Dependency.Repository
	if repository == nil {
		return false
	}
	fullName := strings.Trim(strings.TrimSpace(repository.FullName), "/")
	parts := strings.Split(fullName, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" || strings.ContainsAny(fullName, " \t\r\n") {
		return false
	}
	repositoryURL := strings.ToLower(strings.TrimSuffix(strings.TrimRight(strings.TrimSpace(repository.URL), "/"), ".git"))
	for _, prefix := range []string{"https://github.com/", "http://github.com/"} {
		if strings.HasPrefix(repositoryURL, prefix) {
			return strings.EqualFold(strings.TrimPrefix(repositoryURL, prefix), fullName)
		}
	}
	return false
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
		if len(dependency.HistoricalFeatures) > 0 {
			snapshot.Dependency.HistoricalFeatures = make(map[string]float64, len(dependency.HistoricalFeatures))
			for key, value := range dependency.HistoricalFeatures {
				snapshot.Dependency.HistoricalFeatures[key] = value
			}
		}

		result = append(result, snapshot)
	}
	return result
}
