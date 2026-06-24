package analysis

import (
	"context"
	"strings"
)

var defaultTrainingModelNames = []string{
	"logistic-regression-full-history",
	"xgboost-full-history",
	"logistic-regression-cold-start",
	"xgboost-cold-start",
}

type modelCapableScorer interface {
	ScoreModel(ctx context.Context, analysisID string, dependencies []DependencyRecord, artifact TrainingRunModelArtifact) (map[string]RiskProfile, error)
}

func (s *Service) GetLatestTrainingRun(_ context.Context) (*TrainingRunArtifact, error) {
	if s.trainingRuns == nil {
		return nil, nil
	}
	return s.trainingRuns.Latest()
}

func (s *Service) ListTrainingRuns(_ context.Context) ([]TrainingRunArtifact, error) {
	if s.trainingRuns == nil {
		return []TrainingRunArtifact{}, nil
	}
	return s.trainingRuns.List()
}

func canonicalTrainingModelName(modelName string) string {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	switch normalized {
	case "", "all", "all-models", "all_available", "all-available":
		return "all"
	case "xgboost-full-history", "xgboost-cold-start", "logistic-regression-full-history", "logistic-regression-cold-start":
		return normalized
	case "xgboost-baseline":
		return "xgboost-full-history"
	case "xgboost", "xgboost_classifier", "xgboost-classifier", "gradient_boosted_trees", "gradient-boosted-trees":
		return "xgboost-full-history"
	case "logistic_regression", "logistic-regression", "logistic-regression-baseline":
		return "logistic-regression-full-history"
	default:
		return normalized
	}
}

func requestedTrainingModelNames(modelName string, fallback string) []string {
	requested := canonicalTrainingModelName(modelName)
	if requested == "" || requested == "all" {
		requested = canonicalTrainingModelName(fallback)
	}
	if requested == "" || requested == "all" {
		return append([]string(nil), defaultTrainingModelNames...)
	}
	return []string{requested}
}
