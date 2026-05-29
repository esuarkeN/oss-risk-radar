package scoring

import (
	"testing"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
)

func TestToDependencySignalFiltersInvalidScorecardChecks(t *testing.T) {
	input := toDependencySignal(analysis.DependencyRecord{
		ID:             "dep_1",
		PackageName:    "next",
		PackageVersion: "15.0.0",
		Ecosystem:      "npm",
		Direct:         true,
		Scorecard: &analysis.ScorecardSnapshot{
			Score: 8.5,
			Checks: []analysis.ScorecardCheck{
				{Name: "Binary-Artifacts", Score: 10, Reason: "fixture"},
				{Name: "Token-Permissions", Score: -1, Reason: "not available"},
			},
		},
	})

	if input.Scorecard == nil {
		t.Fatal("expected scorecard payload to be preserved")
	}
	if len(input.Scorecard.Checks) != 1 {
		t.Fatalf("expected invalid scorecard checks to be filtered, got %#v", input.Scorecard.Checks)
	}
	if input.Scorecard.Checks[0].Name != "Binary-Artifacts" {
		t.Fatalf("unexpected scorecard check payload: %#v", input.Scorecard.Checks[0])
	}
}

func TestToDependencySignalOmitsUnknownLastPushAge(t *testing.T) {
	input := toDependencySignal(analysis.DependencyRecord{
		ID:             "dep_1",
		PackageName:    "demo/repo",
		PackageVersion: "repository profile",
		Ecosystem:      "unknown",
		Direct:         true,
		Repository: &analysis.RepositorySnapshot{
			FullName: "demo/repo",
			URL:      "https://github.com/demo/repo",
		},
	})

	if input.Repository == nil {
		t.Fatal("expected repository payload")
	}
	if input.Repository.LastPushAgeDays != nil {
		t.Fatalf("expected unknown last push age to be omitted, got %#v", *input.Repository.LastPushAgeDays)
	}
}

func TestToDependencySignalPreservesKnownFreshLastPushAge(t *testing.T) {
	input := toDependencySignal(analysis.DependencyRecord{
		ID:             "dep_1",
		PackageName:    "demo/repo",
		PackageVersion: "repository profile",
		Ecosystem:      "unknown",
		Direct:         true,
		Repository: &analysis.RepositorySnapshot{
			FullName:        "demo/repo",
			URL:             "https://github.com/demo/repo",
			LastPushAt:      time.Now().UTC(),
			LastPushAgeDays: 0,
		},
	})

	if input.Repository == nil || input.Repository.LastPushAgeDays == nil {
		t.Fatalf("expected known fresh last push age to be preserved, got %#v", input.Repository)
	}
	if *input.Repository.LastPushAgeDays != 0 {
		t.Fatalf("expected last push age 0, got %d", *input.Repository.LastPushAgeDays)
	}
}
