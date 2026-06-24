package analysis

import (
	"context"
	"math"
	"sort"
	"strings"
)

type trainingEffectMetricDefinition struct {
	key      string
	label    string
	features []string
	ignored  bool
	note     string
	value    func(TrainingSnapshotRecord) float64
}

func (s *Service) GetTrainingEffects(_ context.Context) (GetTrainingEffectsResponse, error) {
	if s.trainingDataset == nil {
		return GetTrainingEffectsResponse{Effects: []TrainingEffectMetric{}}, nil
	}

	snapshots, datasetHash, err := s.trainingDataset.LoadSnapshots()
	if err != nil {
		return GetTrainingEffectsResponse{}, err
	}

	runs := []TrainingRunArtifact{}
	if s.trainingRuns != nil {
		runs, err = s.trainingRuns.List()
		if err != nil {
			return GetTrainingEffectsResponse{}, err
		}
	}

	xgboostImportances := featureImportanceLookup(latestCompletedTrainingRun(runs, "xgboost-full-history"))
	logisticCoefficients := logisticCoefficientLookup(latestCompletedTrainingRun(runs, "logistic-regression-full-history"))

	response := GetTrainingEffectsResponse{
		Effects:     make([]TrainingEffectMetric, 0, len(trainingEffectMetricDefinitions())),
		DatasetHash: datasetHash,
	}

	for _, definition := range trainingEffectMetricDefinitions() {
		activeValues := []float64{}
		inactiveValues := []float64{}
		for _, snapshot := range snapshots {
			if snapshot.LabelInactive12M == nil {
				continue
			}

			value := definition.value(snapshot)
			if *snapshot.LabelInactive12M {
				inactiveValues = append(inactiveValues, value)
			} else {
				activeValues = append(activeValues, value)
			}
		}

		if response.LabeledSnapshots == 0 {
			response.ActiveCount = len(activeValues)
			response.InactiveCount = len(inactiveValues)
			response.LabeledSnapshots = response.ActiveCount + response.InactiveCount
		}

		effectSize := rankBiserialInactiveVsActive(inactiveValues, activeValues)
		note := trainingEffectNote(definition.note, activeValues, inactiveValues)
		response.Effects = append(response.Effects, TrainingEffectMetric{
			Key:                 definition.key,
			Label:               definition.label,
			EffectSize:          effectSize,
			Strength:            trainingEffectStrength(effectSize, definition.ignored),
			Direction:           trainingEffectDirection(effectSize, definition.ignored),
			ActiveMedian:        medianFloat64(activeValues),
			InactiveMedian:      medianFloat64(inactiveValues),
			ActiveCount:         len(activeValues),
			InactiveCount:       len(inactiveValues),
			Features:            append([]string(nil), definition.features...),
			XGBoostImportance:   summedFeatureValuePointer(xgboostImportances, definition.features),
			LogisticCoefficient: summedFeatureValuePointer(logisticCoefficients, definition.features),
			Ignored:             definition.ignored,
			Note:                note,
		})
	}

	return response, nil
}

func trainingEffectMetricDefinitions() []trainingEffectMetricDefinition {
	return []trainingEffectMetricDefinition{
		{
			key:      "commits_per_week",
			label:    "Commits per week",
			features: []string{"commits_365d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "commits_365d") / 52 },
		},
		{
			key:      "commits_last_year",
			label:    "Commits last year",
			features: []string{"commits_365d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "commits_365d") },
		},
		{
			key:      "releases_last_year",
			label:    "Releases last year",
			features: []string{"releases_365d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "releases_365d") },
		},
		{
			key:      "merged_pull_requests",
			label:    "Merged pull requests",
			features: []string{"merged_prs_90d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "merged_prs_90d") },
		},
		{
			key:      "pr_ratio",
			label:    "PR ratio",
			features: []string{"pr_merge_ratio_90d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "pr_merge_ratio_90d") },
		},
		{
			key:      "pr_close_rate",
			label:    "PR close rate",
			features: []string{"opened_prs_90d", "merged_prs_90d", "closed_unmerged_prs_90d"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				opened := featureValue(snapshot, "opened_prs_90d")
				closed := featureValue(snapshot, "merged_prs_90d") + featureValue(snapshot, "closed_unmerged_prs_90d")
				return closed / math.Max(1, opened)
			},
		},
		{
			key:      "commits_recent_proxy",
			label:    "Recent commits proxy",
			features: []string{"commits_90d"},
			note:     "Lifetime commits are not staged; this uses the 90-day activity window.",
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "commits_90d") },
		},
		{
			key:      "closed_pull_requests",
			label:    "Closed pull requests",
			features: []string{"merged_prs_90d", "closed_unmerged_prs_90d"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				return featureValue(snapshot, "merged_prs_90d") + featureValue(snapshot, "closed_unmerged_prs_90d")
			},
		},
		{
			key:      "contributors_90d",
			label:    "Contributors",
			features: []string{"contributors_90d", "recent_contributors_90d"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				if value := featureValue(snapshot, "contributors_90d"); value != 0 {
					return value
				}
				return featureValue(snapshot, "recent_contributors_90d")
			},
		},
		{
			key:      "contributors_365d",
			label:    "Contributors last year",
			features: []string{"contributors_365d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "contributors_365d") },
		},
		{
			key:      "issue_ratio",
			label:    "Issue ratio",
			features: []string{"issue_closure_ratio_90d"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				return featureValue(snapshot, "issue_closure_ratio_90d")
			},
		},
		{
			key:      "closed_issues",
			label:    "Closed issues",
			features: []string{"closed_issues_90d"},
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "closed_issues_90d") },
		},
		{
			key:      "bus_factor_proxy",
			label:    "Bus factor proxy",
			features: []string{"contributors_365d", "top1_contributor_commit_share_365d"},
			note:     "Proxy from contributor count and top contributor commit share.",
			value: func(snapshot TrainingSnapshotRecord) float64 {
				contributors := featureValue(snapshot, "contributors_365d")
				topShare := math.Max(0, math.Min(1, featureValue(snapshot, "top1_contributor_commit_share_365d")))
				return contributors * (1 - topShare)
			},
		},
		{
			key:      "days_since_last_commit",
			label:    "Days since last commit",
			features: []string{"days_since_last_commit", "last_push_age_days"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				if value := featureValue(snapshot, "days_since_last_commit"); value != 0 {
					return value
				}
				return featureValue(snapshot, "last_push_age_days")
			},
		},
		{
			key:      "days_since_last_release",
			label:    "Days since last release",
			features: []string{"days_since_last_release", "last_release_age_days"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				if value := featureValue(snapshot, "days_since_last_release"); value != 0 {
					return value
				}
				return featureValue(snapshot, "last_release_age_days")
			},
		},
		{
			key:      "open_issues",
			label:    "Open issues",
			features: []string{"open_issues_log1p", "stale_open_issues_count_at_obs"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				if snapshot.Dependency.Repository != nil {
					return float64(snapshot.Dependency.Repository.OpenIssues)
				}
				return math.Expm1(featureValue(snapshot, "open_issues_log1p"))
			},
		},
		{
			key:      "open_pull_requests",
			label:    "Open pull requests proxy",
			features: []string{"stale_open_prs_count_at_obs"},
			value: func(snapshot TrainingSnapshotRecord) float64 {
				return featureValue(snapshot, "stale_open_prs_count_at_obs")
			},
		},
		{
			key:      "forks",
			label:    "Forks",
			features: []string{"forks_total_at_obs", "forks_log1p"},
			ignored:  true,
			note:     "Ignored for health interpretation; forks mostly reflect popularity.",
			value: func(snapshot TrainingSnapshotRecord) float64 {
				if snapshot.Dependency.Repository != nil {
					return float64(snapshot.Dependency.Repository.Forks)
				}
				return featureValue(snapshot, "forks_total_at_obs")
			},
		},
		{
			key:      "release_frequency",
			label:    "Release frequency",
			features: []string{"release_cadence_days"},
			note:     "Lower cadence days mean more frequent releases; current foundation rows may not have reliable cadence metadata.",
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "release_cadence_days") },
		},
		{
			key:      "project_age",
			label:    "Project age",
			features: []string{"repo_age_days"},
			note:     "Current foundation rows do not consistently stage repository age.",
			value:    func(snapshot TrainingSnapshotRecord) float64 { return featureValue(snapshot, "repo_age_days") },
		},
		{
			key:      "dependencies_total",
			label:    "Dependencies total",
			features: []string{"dependency_count_at_obs"},
			note:     "Dependency count is mainly a cold-start/API signal; foundation rows may be zero.",
			value: func(snapshot TrainingSnapshotRecord) float64 {
				return featureValue(snapshot, "dependency_count_at_obs")
			},
		},
	}
}

func rankBiserialInactiveVsActive(inactiveValues []float64, activeValues []float64) float64 {
	inactiveCount := len(inactiveValues)
	activeCount := len(activeValues)
	if inactiveCount == 0 || activeCount == 0 {
		return 0
	}

	type rankedValue struct {
		value    float64
		inactive bool
	}

	values := make([]rankedValue, 0, inactiveCount+activeCount)
	for _, value := range inactiveValues {
		values = append(values, rankedValue{value: value, inactive: true})
	}
	for _, value := range activeValues {
		values = append(values, rankedValue{value: value})
	}
	sort.Slice(values, func(i, j int) bool {
		return values[i].value < values[j].value
	})

	inactiveRankSum := 0.0
	for start := 0; start < len(values); {
		end := start + 1
		for end < len(values) && values[end].value == values[start].value {
			end++
		}
		averageRank := (float64(start+1) + float64(end)) / 2
		for index := start; index < end; index++ {
			if values[index].inactive {
				inactiveRankSum += averageRank
			}
		}
		start = end
	}

	inactive := float64(inactiveCount)
	active := float64(activeCount)
	u := inactiveRankSum - inactive*(inactive+1)/2
	return 2*u/(inactive*active) - 1
}

func medianFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	middle := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[middle]
	}
	return (sorted[middle-1] + sorted[middle]) / 2
}

func trainingEffectStrength(effectSize float64, ignored bool) string {
	if ignored {
		return "ignored"
	}
	absolute := math.Abs(effectSize)
	switch {
	case absolute >= 0.5:
		return "strong"
	case absolute >= 0.3:
		return "medium"
	case absolute > 0:
		return "weak"
	default:
		return "none"
	}
}

func trainingEffectDirection(effectSize float64, ignored bool) string {
	if ignored {
		return "ignored"
	}
	switch {
	case effectSize < -0.000001:
		return "healthy"
	case effectSize > 0.000001:
		return "inactive"
	default:
		return "neutral"
	}
}

func trainingEffectNote(baseNote string, activeValues []float64, inactiveValues []float64) *string {
	notes := []string{}
	if strings.TrimSpace(baseNote) != "" {
		notes = append(notes, strings.TrimSpace(baseNote))
	}

	allValues := append(append([]float64(nil), activeValues...), inactiveValues...)
	if len(allValues) == 0 {
		notes = append(notes, "No labeled rows are available for this metric.")
	} else if trainingEffectNoVariance(allValues) {
		notes = append(notes, "No meaningful variance in the staged rows, so this should not be interpreted as a learned health separator.")
	}

	if len(notes) == 0 {
		return nil
	}
	note := strings.Join(notes, " ")
	return &note
}

func trainingEffectNoVariance(values []float64) bool {
	if len(values) == 0 {
		return true
	}
	first := values[0]
	for _, value := range values[1:] {
		if value != first {
			return false
		}
	}
	return true
}

func featureValue(snapshot TrainingSnapshotRecord, feature string) float64 {
	if snapshot.Dependency.HistoricalFeatures != nil {
		if value, ok := snapshot.Dependency.HistoricalFeatures[feature]; ok {
			return value
		}
	}

	repository := snapshot.Dependency.Repository
	if repository == nil {
		return 0
	}

	switch feature {
	case "last_push_age_days", "days_since_last_commit":
		if repository.LastPushAgeDays != nil {
			return float64(*repository.LastPushAgeDays)
		}
	case "last_release_age_days", "days_since_last_release":
		if repository.LastReleaseAgeDays != nil {
			return float64(*repository.LastReleaseAgeDays)
		}
	case "release_cadence_days":
		if repository.ReleaseCadenceDays != nil {
			return float64(*repository.ReleaseCadenceDays)
		}
	case "recent_contributors_90d", "contributors_90d":
		if repository.RecentContributors90d != nil {
			return float64(*repository.RecentContributors90d)
		}
	case "contributor_concentration":
		if repository.ContributorConcentration != nil {
			return *repository.ContributorConcentration
		}
	case "open_issue_growth_90d", "issue_backlog_growth_90d":
		if repository.OpenIssueGrowth90d != nil {
			return *repository.OpenIssueGrowth90d
		}
	case "pr_response_median_days", "pr_response_median_days_365d":
		if repository.PRResponseMedianDays != nil {
			return *repository.PRResponseMedianDays
		}
	case "stars_total_at_obs":
		return float64(repository.Stars)
	case "stars_log1p":
		return math.Log1p(float64(repository.Stars))
	case "forks_total_at_obs":
		return float64(repository.Forks)
	case "forks_log1p":
		return math.Log1p(float64(repository.Forks))
	case "open_issues_log1p":
		return math.Log1p(float64(repository.OpenIssues))
	}

	return 0
}

func latestCompletedTrainingRun(runs []TrainingRunArtifact, modelName string) *TrainingRunArtifact {
	var selected *TrainingRunArtifact
	for index := range runs {
		run := runs[index]
		if run.Status != "completed" || run.ModelName != modelName {
			continue
		}
		if selected == nil || run.CachedAt.After(selected.CachedAt) {
			selected = &runs[index]
		}
	}
	return selected
}

func featureImportanceLookup(run *TrainingRunArtifact) map[string]float64 {
	if run == nil || run.ModelArtifact == nil {
		return nil
	}
	result := map[string]float64{}
	for _, importance := range run.ModelArtifact.FeatureImportances {
		result[importance.Feature] = importance.Importance
	}
	return result
}

func logisticCoefficientLookup(run *TrainingRunArtifact) map[string]float64 {
	if run == nil || run.ModelArtifact == nil {
		return nil
	}
	artifact := run.ModelArtifact
	if len(artifact.FeatureNames) != len(artifact.Coefficients) {
		return nil
	}
	result := map[string]float64{}
	for index, feature := range artifact.FeatureNames {
		result[feature] = artifact.Coefficients[index]
	}
	return result
}

func summedFeatureValuePointer(values map[string]float64, features []string) *float64 {
	if len(values) == 0 || len(features) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	sum := 0.0
	matched := false
	for _, feature := range features {
		if _, exists := seen[feature]; exists {
			continue
		}
		seen[feature] = struct{}{}
		value, ok := values[feature]
		if !ok {
			continue
		}
		sum += value
		matched = true
	}
	if !matched {
		return nil
	}
	return &sum
}
