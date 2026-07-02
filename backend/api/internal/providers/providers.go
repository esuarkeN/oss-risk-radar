package providers

import (
	"context"
	"time"
)

type RepositorySnapshot struct {
	FullName                      string
	URL                           string
	DefaultBranch                 string
	Archived                      bool
	Stars                         int
	Forks                         int
	OpenIssues                    int
	LastPushAt                    time.Time
	LastReleaseAt                 *time.Time
	RecentContributors90d         *int
	ContributorConcentration      *float64
	PullRequestMedianResponseDays *float64
	PullRequestMedianMergeDays    *float64
	IssueResolutionMedianDays     *float64
	StaleIssueShare               *float64
	LastPushAgeDays               int
	LastReleaseAgeDays            *int
	ReleaseCadenceDays            *int
	OpenIssueGrowth90d            *float64
}

type ScorecardCheck struct {
	Name   string
	Score  float64
	Reason string
}

type ScorecardSnapshot struct {
	Score  float64
	Checks []ScorecardCheck
}

type GitHubClient interface {
	GetRepository(ctx context.Context, repositoryURL string) (*RepositorySnapshot, error)
}

type ScorecardClient interface {
	GetScorecard(ctx context.Context, repositoryURL string) (*ScorecardSnapshot, error)
}
