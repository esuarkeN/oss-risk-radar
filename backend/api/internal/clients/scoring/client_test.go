package scoring

import (
	"testing"

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
