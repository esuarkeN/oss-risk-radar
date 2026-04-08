package analysis

import "context"

func (s *Service) GetTrainingDatasetSummary(_ context.Context) (TrainingDatasetSummary, error) {
	if s.trainingDataset == nil {
		return TrainingDatasetSummary{AutoCaptureEnabled: false}, nil
	}
	return s.trainingDataset.Summary()
}
