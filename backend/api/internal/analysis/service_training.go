package analysis

import (
	"context"
	"log/slog"
)

func (s *Service) GetTrainingDatasetSummary(_ context.Context) (TrainingDatasetSummary, error) {
	if s.trainingDataset == nil {
		return TrainingDatasetSummary{AutoCaptureEnabled: false, Repositories: []TrainingDatasetRepositorySummary{}}, nil
	}
	return s.trainingDataset.Summary()
}

func (s *Service) BootstrapTrainingArtifacts(datasetSeedPath string, featureCacheSeedPath string, runsSeedDir string, latestRunSeedPath string, mergeExisting bool) error {
	if s.trainingDataset != nil {
		seeded, err := s.trainingDataset.BootstrapFromSeed(datasetSeedPath, mergeExisting)
		if err != nil {
			return err
		}
		if seeded && s.logger != nil {
			s.logger.Info("seeded training dataset", slog.String("path", s.trainingDataset.path), slog.String("seed_path", datasetSeedPath), slog.Bool("merge_existing", mergeExisting))
		}
	}

	if s.trainingFeatureCache != nil {
		seeded, err := s.trainingFeatureCache.BootstrapFromSeed(featureCacheSeedPath)
		if err != nil {
			return err
		}
		if seeded && s.logger != nil {
			s.logger.Info("seeded repository feature cache", slog.String("path", s.trainingFeatureCache.path), slog.String("seed_path", featureCacheSeedPath))
		}
	}

	if s.trainingRuns != nil {
		seeded, err := s.trainingRuns.BootstrapFromSeed(runsSeedDir, latestRunSeedPath, mergeExisting)
		if err != nil {
			return err
		}
		if seeded && s.logger != nil {
			s.logger.Info("seeded training run artifacts", slog.String("runs_dir", runsSeedDir), slog.String("latest_run_path", latestRunSeedPath), slog.Bool("merge_existing", mergeExisting))
		}
	}

	return nil
}
