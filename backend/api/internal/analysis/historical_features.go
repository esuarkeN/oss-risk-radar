package analysis

const (
	featureRegimeFullHistory = "full-history"
	featureRegimeColdStart   = "cold-start"
)

func (s *Service) applyHistoricalFeatures(dependency *DependencyRecord) {
	if dependency == nil || dependency.Repository == nil {
		return
	}
	values := cloneFeatureValues(dependency.HistoricalFeatures)
	if values == nil {
		values = map[string]float64{}
	}

	for key, value := range approximateHistoricalFeatures(dependency.Repository) {
		if _, exists := values[key]; !exists {
			values[key] = value
		}
	}

	dependency.FeatureRegime = featureRegimeColdStart
	dependency.HistoricalCacheHit = false
	if cached, ok := s.trainingFeatureCache.Lookup(dependency.Repository.FullName, dependency.Repository.URL); ok {
		for key, value := range cached {
			values[key] = value
		}
		dependency.FeatureRegime = featureRegimeFullHistory
		dependency.HistoricalCacheHit = true
	}
	if len(values) > 0 {
		dependency.HistoricalFeatures = values
	}
}

func approximateHistoricalFeatures(repository *RepositorySnapshot) map[string]float64 {
	if repository == nil {
		return nil
	}
	values := map[string]float64{
		"stars_total_at_obs":   float64(repository.Stars),
		"forks_total_at_obs":   float64(repository.Forks),
		"repo_archived_at_obs": boolFloat(repository.Archived),
	}
	if !repository.LastPushAt.IsZero() || repository.LastPushAgeDays > 0 {
		values["days_since_last_commit"] = float64(repository.LastPushAgeDays)
	}
	if repository.LastReleaseAgeDays != nil {
		values["days_since_last_release"] = float64(*repository.LastReleaseAgeDays)
		values["has_recent_release_flag"] = boolFloat(*repository.LastReleaseAgeDays <= 365)
	}
	if repository.ReleaseCadenceDays != nil {
		values["release_gap_risk"] = releaseGapRisk(repository.LastReleaseAgeDays, repository.ReleaseCadenceDays)
	}
	if repository.RecentContributors90d != nil {
		values["contributors_90d"] = float64(*repository.RecentContributors90d)
	}
	if repository.ContributorConcentration != nil {
		values["top1_contributor_commit_share_365d"] = *repository.ContributorConcentration
		values["concentration_risk_score"] = *repository.ContributorConcentration
	}
	if repository.OpenIssueGrowth90d != nil {
		values["issue_backlog_growth_90d"] = *repository.OpenIssueGrowth90d
	}
	if repository.PullRequestMedianResponseDays != nil {
		values["pr_response_median_days_365d"] = *repository.PullRequestMedianResponseDays
	}
	if repository.PullRequestMedianMergeDays != nil {
		values["pr_merge_latency_median_days_365d"] = *repository.PullRequestMedianMergeDays
	}
	if repository.IssueResolutionMedianDays != nil {
		values["issue_resolution_median_days_365d"] = *repository.IssueResolutionMedianDays
	}
	if repository.StaleIssueShare != nil {
		values["stale_issue_share_at_obs"] = *repository.StaleIssueShare
	}
	return values
}

func releaseGapRisk(lastReleaseAgeDays *int, releaseCadenceDays *int) float64 {
	if lastReleaseAgeDays == nil {
		return 0
	}
	baseline := 180.0
	if releaseCadenceDays != nil && *releaseCadenceDays > 0 {
		candidate := float64(*releaseCadenceDays * 2)
		if candidate > baseline {
			baseline = candidate
		}
	}
	risk := float64(*lastReleaseAgeDays) / baseline
	if risk > 1 {
		return 1
	}
	if risk < 0 {
		return 0
	}
	return risk
}

func boolFloat(value bool) float64 {
	if value {
		return 1
	}
	return 0
}
