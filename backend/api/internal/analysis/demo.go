package analysis

import "time"

func DemoDependencies(analysisID string, now time.Time) []DependencyRecord {
	requestRelease := now.AddDate(0, 0, -1400)
	lodashRelease := now.AddDate(0, 0, -40)
	urllibRelease := now.AddDate(0, 0, -170)
	muxRelease := now.AddDate(0, 0, -430)

	return []DependencyRecord{
		{
			ID:                  "dep_request",
			AnalysisID:          analysisID,
			PackageName:         "request",
			PackageVersion:      "2.88.2",
			Ecosystem:           "npm",
			Direct:              true,
			DependencyPath:      []string{"demo-app", "request"},
			RawSignalsAvailable: true,
			Repository: &RepositorySnapshot{
				FullName:                      "request/request",
				URL:                           "https://github.com/request/request",
				DefaultBranch:                 "master",
				Archived:                      true,
				Stars:                         26000,
				Forks:                         1800,
				OpenIssues:                    250,
				LastPushAt:                    now.AddDate(0, 0, -980),
				LastReleaseAt:                 &requestRelease,
				LastPushAgeDays:               980,
				LastReleaseAgeDays:            intPtr(1400),
				ReleaseCadenceDays:            intPtr(300),
				RecentContributors90d:         intPtr(0),
				ContributorConcentration:      floatPtr(0.95),
				OpenIssueGrowth90d:            floatPtr(0.41),
				PullRequestMedianResponseDays: floatPtr(63),
			},
			Scorecard: &ScorecardSnapshot{
				Score: 4.6,
				Checks: []ScorecardCheck{
					{Name: "Branch-Protection", Score: 2, Reason: "No branch protection evidence found."},
					{Name: "Binary-Artifacts", Score: 8, Reason: "No binary artifacts detected."},
				},
			},
		},
		{
			ID:                  "dep_lodash",
			AnalysisID:          analysisID,
			PackageName:         "lodash",
			PackageVersion:      "4.17.21",
			Ecosystem:           "npm",
			Direct:              true,
			DependencyPath:      []string{"demo-app", "lodash"},
			RawSignalsAvailable: true,
			Repository: &RepositorySnapshot{
				FullName:                      "lodash/lodash",
				URL:                           "https://github.com/lodash/lodash",
				DefaultBranch:                 "main",
				Archived:                      false,
				Stars:                         60000,
				Forks:                         7000,
				OpenIssues:                    40,
				LastPushAt:                    now.AddDate(0, 0, -12),
				LastReleaseAt:                 &lodashRelease,
				LastPushAgeDays:               12,
				LastReleaseAgeDays:            intPtr(40),
				ReleaseCadenceDays:            intPtr(45),
				RecentContributors90d:         intPtr(5),
				ContributorConcentration:      floatPtr(0.34),
				OpenIssueGrowth90d:            floatPtr(-0.08),
				PullRequestMedianResponseDays: floatPtr(2),
			},
			Scorecard: &ScorecardSnapshot{
				Score: 8.4,
				Checks: []ScorecardCheck{
					{Name: "Branch-Protection", Score: 9, Reason: "Branch protection evidence found."},
					{Name: "Code-Review", Score: 8, Reason: "Pull request review workflow detected."},
				},
			},
		},
		{
			ID:                  "dep_urllib3",
			AnalysisID:          analysisID,
			PackageName:         "urllib3",
			PackageVersion:      "2.2.1",
			Ecosystem:           "pypi",
			Direct:              false,
			DependencyPath:      []string{"demo-app", "requests", "urllib3"},
			RawSignalsAvailable: true,
			Repository: &RepositorySnapshot{
				FullName:                      "urllib3/urllib3",
				URL:                           "https://github.com/urllib3/urllib3",
				DefaultBranch:                 "main",
				Archived:                      false,
				Stars:                         3800,
				Forks:                         900,
				OpenIssues:                    180,
				LastPushAt:                    now.AddDate(0, 0, -72),
				LastReleaseAt:                 &urllibRelease,
				LastPushAgeDays:               72,
				LastReleaseAgeDays:            intPtr(170),
				ReleaseCadenceDays:            intPtr(120),
				RecentContributors90d:         intPtr(3),
				ContributorConcentration:      floatPtr(0.52),
				OpenIssueGrowth90d:            floatPtr(0.11),
				PullRequestMedianResponseDays: floatPtr(8),
			},
			Scorecard: &ScorecardSnapshot{
				Score: 7.2,
				Checks: []ScorecardCheck{
					{Name: "CI-Tests", Score: 8, Reason: "CI tests detected."},
					{Name: "Pinned-Dependencies", Score: 6, Reason: "Some dependency pinning evidence detected."},
				},
			},
		},
		{
			ID:                  "dep_mux",
			AnalysisID:          analysisID,
			PackageName:         "github.com/gorilla/mux",
			PackageVersion:      "v1.8.1",
			Ecosystem:           "go",
			Direct:              true,
			DependencyPath:      []string{"demo-app", "github.com/gorilla/mux"},
			RawSignalsAvailable: true,
			Repository: &RepositorySnapshot{
				FullName:                      "gorilla/mux",
				URL:                           "https://github.com/gorilla/mux",
				DefaultBranch:                 "main",
				Archived:                      true,
				Stars:                         19000,
				Forks:                         1700,
				OpenIssues:                    45,
				LastPushAt:                    now.AddDate(0, 0, -410),
				LastReleaseAt:                 &muxRelease,
				LastPushAgeDays:               410,
				LastReleaseAgeDays:            intPtr(430),
				ReleaseCadenceDays:            intPtr(260),
				RecentContributors90d:         intPtr(1),
				ContributorConcentration:      floatPtr(0.82),
				OpenIssueGrowth90d:            floatPtr(0.19),
				PullRequestMedianResponseDays: floatPtr(18),
			},
			Scorecard: &ScorecardSnapshot{
				Score: 6.1,
				Checks: []ScorecardCheck{
					{Name: "Pinned-Dependencies", Score: 6, Reason: "Dependency pinning is partially present."},
					{Name: "Token-Permissions", Score: 6, Reason: "Workflow token permissions appear partially scoped."},
				},
			},
		},
	}
}

func intPtr(value int) *int {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}
