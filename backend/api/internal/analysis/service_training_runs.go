package analysis

import (
	"context"
	"errors"
)

type trainingCapableScorer interface {
	TrainModel(ctx context.Context, snapshots []TrainingSnapshotRecord) (TrainingRunArtifact, error)
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
	if s.trainingDataset == nil {
		return TrainingRunArtifact{}, false, errors.New("training dataset is unavailable")
	}
	if s.trainingRuns == nil {
		return TrainingRunArtifact{}, false, errors.New("training run cache is unavailable")
	}
	runner, ok := s.scorer.(trainingCapableScorer)
	if !ok {
		return TrainingRunArtifact{}, false, errors.New("training is unavailable without a training-capable scoring client")
	}

	snapshots, datasetHash, err := s.trainingDataset.LoadSnapshots()
	if err != nil {
		return TrainingRunArtifact{}, false, err
	}
	if len(snapshots) == 0 {
		return TrainingRunArtifact{}, false, errors.New("no training snapshots are available yet")
	}
	labeledSnapshots := labeledTrainingSnapshotCount(snapshots)
	if labeledSnapshots == 0 {
		return TrainingRunArtifact{}, false, errors.New("no labeled real-project training snapshots are available yet; build a historical dataset before training")
	}
	realProjectLabeledSnapshots := realProjectLabeledTrainingSnapshotCount(snapshots)
	if realProjectLabeledSnapshots == 0 {
		return TrainingRunArtifact{}, false, errors.New("no labeled real-project training snapshots include a GitHub repository identity; rebuild the historical dataset from real repositories before training")
	}
	if realProjectLabeledSnapshots < labeledSnapshots {
		return TrainingRunArtifact{}, false, errors.New("all labeled training snapshots must include a GitHub repository identity before training")
	}

	latest, err := s.trainingRuns.Latest()
	if err != nil {
		return TrainingRunArtifact{}, false, err
	}
	if !force && latest != nil && latest.DatasetHash == datasetHash {
		return *latest, true, nil
	}

	run, err := runner.TrainModel(ctx, snapshots)
	if err != nil {
		return TrainingRunArtifact{}, false, err
	}
	run.DatasetPath = s.trainingDataset.path
	run.DatasetHash = datasetHash

	saved, err := s.trainingRuns.Save(run)
	if err != nil {
		return TrainingRunArtifact{}, false, err
	}
	return saved, false, nil
}
