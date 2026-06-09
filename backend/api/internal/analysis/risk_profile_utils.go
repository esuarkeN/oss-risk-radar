package analysis

import (
	"errors"
	"fmt"
	"sort"
)

func requireCompleteRiskProfiles(dependencies []DependencyRecord, scores map[string]RiskProfile, method string, model string) (map[string]RiskProfile, error) {
	if scores == nil {
		return nil, errors.New("model scorer returned no scores")
	}
	for _, dependency := range dependencies {
		profile, ok := scores[dependency.ID]
		if !ok {
			return nil, fmt.Errorf("model scorer omitted dependency %s", dependency.ID)
		}
		if profile.ScoringMethod == "" {
			profile.ScoringMethod = method
		}
		if profile.ScoringModel == "" {
			profile.ScoringModel = model
		}
		scores[dependency.ID] = profile
	}
	return scores, nil
}

func riskBucketForScore(score float64) RiskBucket {
	if score >= 80 {
		return RiskBucket("critical")
	}
	if score >= 60 {
		return RiskBucket("high")
	}
	if score >= 35 {
		return RiskBucket("medium")
	}
	return RiskBucket("low")
}

func actionLevelForScore(score float64) ActionLevel {
	if score >= 80 {
		return ActionLevel("replace_candidate")
	}
	if score >= 50 {
		return ActionLevel("review")
	}
	return ActionLevel("monitor")
}

func explanationFactor(label string, direction string, weight float64, detail string) ExplanationFactor {
	return ExplanationFactor{Label: label, Direction: direction, Weight: weight, Detail: detail}
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
