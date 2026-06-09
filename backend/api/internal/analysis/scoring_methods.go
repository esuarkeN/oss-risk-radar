package analysis

import (
	"sort"
	"strings"
)

type scoringMethodAccumulator struct {
	summary ScoringMethodSummary
}

func SummarizeScoringMethods(dependencies []DependencyRecord) []ScoringMethodSummary {
	byKey := map[string]*scoringMethodAccumulator{}

	for _, dependency := range dependencies {
		if dependency.RiskProfile == nil {
			continue
		}
		profile := dependency.RiskProfile
		method := strings.TrimSpace(profile.ScoringMethod)
		if method == "" {
			method = "model"
		}

		if method == "model_ensemble" {
			scoringMethodSummaryFor(byKey, ScoringMethodSummary{
				Method: "model_ensemble",
				Role:   "primary",
			}).summary.DependencyCount++
		}

		if len(profile.ModelResults) > 0 {
			role := "primary"
			if method == "model_ensemble" {
				role = "ensemble_member"
			}
			for _, result := range profile.ModelResults {
				accumulator := scoringMethodSummaryFor(byKey, ScoringMethodSummary{
					Method:                   "model",
					ModelName:                result.ModelName,
					ModelVersion:             result.ModelVersion,
					Algorithm:                result.Algorithm,
					Role:                     role,
					SampleCount:              result.SampleCount,
					RocAuc:                   cloneFloat64(result.RocAuc),
					BrierScore:               cloneFloat64(result.BrierScore),
					ExpectedCalibrationError: cloneFloat64(result.ExpectedCalibrationError),
					QualityScore:             cloneFloat64(result.QualityScore),
				})
				accumulator.summary.DependencyCount++
			}
			continue
		}

		accumulator := scoringMethodSummaryFor(byKey, ScoringMethodSummary{
			Method:    method,
			ModelName: profile.ScoringModel,
			Role:      "primary",
		})
		accumulator.summary.DependencyCount++
	}

	methods := make([]ScoringMethodSummary, 0, len(byKey))
	for _, accumulator := range byKey {
		methods = append(methods, accumulator.summary)
	}
	sort.SliceStable(methods, func(i, j int) bool {
		leftPriority := scoringMethodPriority(methods[i])
		rightPriority := scoringMethodPriority(methods[j])
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		if methods[i].Role != methods[j].Role {
			return methods[i].Role < methods[j].Role
		}
		return scoringMethodLabel(methods[i]) < scoringMethodLabel(methods[j])
	})
	return methods
}

func scoringMethodSummaryFor(byKey map[string]*scoringMethodAccumulator, summary ScoringMethodSummary) *scoringMethodAccumulator {
	key := strings.Join([]string{
		summary.Method,
		summary.ModelName,
		summary.ModelVersion,
		summary.Algorithm,
		summary.Role,
	}, "\x00")
	if accumulator, ok := byKey[key]; ok {
		return accumulator
	}
	accumulator := &scoringMethodAccumulator{summary: summary}
	byKey[key] = accumulator
	return accumulator
}

func scoringMethodPriority(summary ScoringMethodSummary) int {
	if summary.Method == "model_ensemble" {
		return 0
	}
	switch summary.ModelName {
	case "xgboost-full-history":
		return 1
	case "logistic-regression-full-history":
		return 2
	case "xgboost-cold-start":
		return 3
	case "logistic-regression-cold-start":
		return 4
	}
	switch summary.Method {
	case "model":
		return 5
	default:
		return 6
	}
}

func scoringMethodLabel(summary ScoringMethodSummary) string {
	if summary.ModelName != "" {
		return summary.ModelName
	}
	return summary.Method
}
