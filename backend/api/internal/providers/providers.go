package providers

import (
	"context"
	"time"
)

type PackageMetadata struct {
	RepositoryURL string
	Ecosystem     string
	Name          string
	Version       string
}

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

type DepsDevClient interface {
	ResolvePackage(ctx context.Context, ecosystem string, name string, version string) (PackageMetadata, error)
}

type GitHubClient interface {
	GetRepository(ctx context.Context, repositoryURL string) (*RepositorySnapshot, error)
	FetchManifest(ctx context.Context, repositoryURL string, path string) ([]byte, error)
}

type ScorecardClient interface {
	GetScorecard(ctx context.Context, repositoryURL string) (*ScorecardSnapshot, error)
}
