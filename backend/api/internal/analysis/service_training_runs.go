package analysis

import (
	"context"
	"errors"
	"sort"
	"strings"
)

var defaultTrainingModelNames = []string{"logistic-regression-baseline", "xgboost-baseline"}

type trainingCapableScorer interface {
	TrainModel(ctx context.Context, snapshots []TrainingSnapshotRecord, modelName string) (TrainingRunArtifact, error)
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

func (s *Service) TriggerTrainingRun(ctx context.Context, force bool) (TrainingRunArtifact, bool, error) {
	return s.TriggerTrainingRunForModel(ctx, force, "")
}

func (s *Service) TriggerTrainingRunForModel(ctx context.Context, force bool, modelName string) (TrainingRunArtifact, bool, error) {
	runs, reused, err := s.TriggerTrainingRunsForModel(ctx, force, modelName)
	if err != nil {
		return TrainingRunArtifact{}, false, err
	}
	if len(runs) == 0 {
		return TrainingRunArtifact{}, false, errors.New("training did not produce any model artifacts")
	}
	return BestTrainingRun(runs), reused, nil
}

func (s *Service) TriggerTrainingRunsForModel(ctx context.Context, force bool, modelName string) ([]TrainingRunArtifact, bool, error) {
	if s.trainingDataset == nil {
		return nil, false, errors.New("training dataset is unavailable")
	}
	if s.trainingRuns == nil {
		return nil, false, errors.New("training run cache is unavailable")
	}
	runner, ok := s.scorer.(trainingCapableScorer)
	if !ok {
		return nil, false, errors.New("training is unavailable without a training-capable scoring client")
	}

	snapshots, datasetHash, err := s.trainingDataset.LoadSnapshots()
	if err != nil {
		return nil, false, err
	}
	if len(snapshots) == 0 {
		return nil, false, errors.New("no training snapshots are available yet")
	}
	labeledSnapshots := labeledTrainingSnapshotCount(snapshots)
	if labeledSnapshots == 0 {
		return nil, false, errors.New("no labeled real-project training snapshots are available yet; build a historical dataset before training")
	}
	realProjectLabeledSnapshots := realProjectLabeledTrainingSnapshotCount(snapshots)
	if realProjectLabeledSnapshots == 0 {
		return nil, false, errors.New("no labeled real-project training snapshots include a GitHub repository identity; rebuild the historical dataset from real repositories before training")
	}
	if realProjectLabeledSnapshots < labeledSnapshots {
		return nil, false, errors.New("all labeled training snapshots must include a GitHub repository identity before training")
	}

	requestedModels := requestedTrainingModelNames(modelName, s.trainingModelName)
	history, err := s.trainingRuns.List()
	if err != nil {
		return nil, false, err
	}

	runs := make([]TrainingRunArtifact, 0, len(requestedModels))
	allReused := true
	for _, requestedModelName := range requestedModels {
		if !force {
			if cached := latestTrainingRunForModel(history, datasetHash, requestedModelName); cached != nil {
				runs = append(runs, *cached)
				continue
			}
		}

		allReused = false
		run, err := runner.TrainModel(ctx, snapshots, requestedModelName)
		if err != nil {
			return nil, false, err
		}
		run.DatasetPath = s.trainingDataset.path
		run.DatasetHash = datasetHash

		saved, err := s.trainingRuns.Save(run)
		if err != nil {
			return nil, false, err
		}
		runs = append(runs, saved)
	}

	if len(runs) > 0 {
		if err := s.trainingRuns.MarkLatest(BestTrainingRun(runs)); err != nil {
			return nil, false, err
		}
	}
	return runs, allReused, nil
}

func canonicalTrainingModelName(modelName string) string {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	switch normalized {
	case "", "all", "all-models", "all_available", "all-available":
		return "all"
	case "xgboost-baseline":
		return normalized
	case "xgboost", "xgboost_classifier", "xgboost-classifier", "gradient_boosted_trees", "gradient-boosted-trees":
		return "xgboost-baseline"
	case "logistic_regression", "logistic-regression", "logistic-regression-baseline":
		return "logistic-regression-baseline"
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

func latestTrainingRunForModel(runs []TrainingRunArtifact, datasetHash string, modelName string) *TrainingRunArtifact {
	for index := len(runs) - 1; index >= 0; index-- {
		run := runs[index]
		if run.Status != "completed" || run.ModelArtifact == nil {
			continue
		}
		if run.DatasetHash == datasetHash && run.ModelName == modelName {
			return &run
		}
	}
	return nil
}

func BestTrainingRun(runs []TrainingRunArtifact) TrainingRunArtifact {
	if len(runs) == 0 {
		return TrainingRunArtifact{}
	}
	sorted := append([]TrainingRunArtifact(nil), runs...)
	sort.SliceStable(sorted, func(i, j int) bool {
		left := trainingRunQuality(sorted[i])
		right := trainingRunQuality(sorted[j])
		if left == right {
			return sorted[i].CachedAt.After(sorted[j].CachedAt)
		}
		return left > right
	})
	return sorted[0]
}

func trainingRunQuality(run TrainingRunArtifact) float64 {
	if run.Metrics == nil {
		return -1
	}
	return run.Metrics.QualityScore
}
