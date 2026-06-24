package analysis

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRankBiserialInactiveVsActiveHandlesTies(t *testing.T) {
	effect := rankBiserialInactiveVsActive([]float64{2, 3}, []float64{1, 2})

	if effect != 0.75 {
		t.Fatalf("expected tied rank-biserial effect 0.75, got %f", effect)
	}
}

func TestMedianFloat64(t *testing.T) {
	if median := medianFloat64([]float64{3, 1, 7, 5}); median != 4 {
		t.Fatalf("expected even median 4, got %f", median)
	}
	if median := medianFloat64([]float64{3, 1, 7}); median != 3 {
		t.Fatalf("expected odd median 3, got %f", median)
	}
	if median := medianFloat64(nil); median != 0 {
		t.Fatalf("expected empty median 0, got %f", median)
	}
}

func TestGetTrainingEffectsGroupsLabelsAndMarksIgnoredSignals(t *testing.T) {
	tempDir := t.TempDir()
	datasetPath := filepath.Join(tempDir, "snapshots.json")
	runsDir := filepath.Join(tempDir, "runs")
	writeTrainingEffectDatasetFixture(t, datasetPath)
	writeTrainingEffectRunFixtures(t, runsDir)

	service := NewServiceWithOptions(ServiceOptions{
		TrainingDatasetPath: datasetPath,
		TrainingRunsDir:     runsDir,
	})

	effects, err := service.GetTrainingEffects(context.Background())
	if err != nil {
		t.Fatalf("GetTrainingEffects returned error: %v", err)
	}

	if effects.LabeledSnapshots != 4 || effects.ActiveCount != 2 || effects.InactiveCount != 2 {
		t.Fatalf("expected 4 labeled rows split 2/2, got %#v", effects)
	}
	if effects.DatasetHash == "" {
		t.Fatal("expected dataset hash to be populated")
	}

	commits := trainingEffectByKey(t, effects.Effects, "commits_last_year")
	if commits.EffectSize != -1 {
		t.Fatalf("expected commits to be a perfect healthy indicator, got %#v", commits)
	}
	if commits.Direction != "healthy" || commits.Strength != "strong" {
		t.Fatalf("expected strong healthy commits effect, got %#v", commits)
	}
	if commits.ActiveMedian != 15 || commits.InactiveMedian != 0 {
		t.Fatalf("expected active/inactive medians 15/0, got %#v", commits)
	}
	if commits.XGBoostImportance == nil || *commits.XGBoostImportance != 0.4 {
		t.Fatalf("expected XGBoost importance alignment, got %#v", commits.XGBoostImportance)
	}
	if commits.LogisticCoefficient == nil || *commits.LogisticCoefficient != -0.7 {
		t.Fatalf("expected logistic coefficient alignment, got %#v", commits.LogisticCoefficient)
	}

	forks := trainingEffectByKey(t, effects.Effects, "forks")
	if !forks.Ignored || forks.Direction != "ignored" || forks.Strength != "ignored" {
		t.Fatalf("expected forks to be present but ignored, got %#v", forks)
	}

	projectAge := trainingEffectByKey(t, effects.Effects, "project_age")
	if projectAge.Note == nil {
		t.Fatalf("expected zero-variance project age note, got %#v", projectAge)
	}
	dependencies := trainingEffectByKey(t, effects.Effects, "dependencies_total")
	if dependencies.Note == nil {
		t.Fatalf("expected zero-variance dependency count note, got %#v", dependencies)
	}
	releaseFrequency := trainingEffectByKey(t, effects.Effects, "release_frequency")
	if releaseFrequency.Note == nil {
		t.Fatalf("expected zero-variance release frequency note, got %#v", releaseFrequency)
	}
}

func trainingEffectByKey(t *testing.T, effects []TrainingEffectMetric, key string) TrainingEffectMetric {
	t.Helper()
	for _, effect := range effects {
		if effect.Key == key {
			return effect
		}
	}
	t.Fatalf("effect %q not found in %#v", key, effects)
	return TrainingEffectMetric{}
}

func writeTrainingEffectDatasetFixture(t *testing.T, path string) {
	t.Helper()
	active := false
	inactive := true
	updatedAt := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)
	dataset := trainingDatasetEnvelope{
		UpdatedAt: updatedAt,
		Snapshots: []TrainingSnapshotRecord{
			trainingEffectSnapshot("active-1", active, 10, 10),
			trainingEffectSnapshot("active-2", active, 20, 11),
			trainingEffectSnapshot("inactive-1", inactive, 0, 50),
			trainingEffectSnapshot("inactive-2", inactive, 0, 55),
			{
				AnalysisID: "unlabeled",
				ObservedAt: updatedAt.Format(time.RFC3339Nano),
				Dependency: TrainingDependencySignalSnapshot{
					DependencyID: "unlabeled",
					PackageName:  "fixture",
					Ecosystem:    "npm",
					HistoricalFeatures: map[string]float64{
						"commits_365d": 999,
					},
				},
			},
		},
	}
	payload, err := json.MarshalIndent(dataset, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal dataset fixture: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create dataset fixture dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("failed to write dataset fixture: %v", err)
	}
}

func trainingEffectSnapshot(id string, inactive bool, commits float64, forks int) TrainingSnapshotRecord {
	observedAt := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
	return TrainingSnapshotRecord{
		AnalysisID:       id,
		ObservedAt:       observedAt,
		LabelInactive12M: &inactive,
		Dependency: TrainingDependencySignalSnapshot{
			DependencyID: id,
			PackageName:  "fixture",
			Ecosystem:    "npm",
			Repository: &TrainingRepositorySignalSnapshot{
				FullName:   "fixture/" + id,
				URL:        "https://github.com/fixture/" + id,
				Forks:      forks,
				OpenIssues: 3,
			},
			HistoricalFeatures: map[string]float64{
				"commits_365d":                       commits,
				"commits_90d":                        commits / 4,
				"release_cadence_days":               0,
				"repo_age_days":                      0,
				"dependency_count_at_obs":            0,
				"top1_contributor_commit_share_365d": 0.5,
				"contributors_365d":                  commits / 10,
			},
		},
	}
}

func writeTrainingEffectRunFixtures(t *testing.T, runsDir string) {
	t.Helper()
	cachedAt := time.Date(2026, 6, 17, 12, 30, 0, 0, time.UTC)
	runs := []TrainingRunArtifact{
		{
			ArtifactPath: filepath.Join(runsDir, "logistic.json"),
			CachedAt:     cachedAt,
			Status:       "completed",
			ModelName:    "logistic-regression-full-history",
			ModelVersion: "0.2.0",
			ModelArtifact: &TrainingRunModelArtifact{
				ModelName:    "logistic-regression-full-history",
				ModelVersion: "0.2.0",
				FeatureNames: []string{
					"commits_365d",
				},
				Coefficients: []float64{-0.7},
			},
		},
		{
			ArtifactPath: filepath.Join(runsDir, "xgboost.json"),
			CachedAt:     cachedAt.Add(time.Second),
			Status:       "completed",
			ModelName:    "xgboost-full-history",
			ModelVersion: "0.2.0",
			ModelArtifact: &TrainingRunModelArtifact{
				ModelName:    "xgboost-full-history",
				ModelVersion: "0.2.0",
				FeatureImportances: []TrainingRunFeatureImportance{
					{Feature: "commits_365d", Gain: 10, Importance: 0.4},
				},
			},
		},
	}
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatalf("failed to create runs dir: %v", err)
	}
	for _, run := range runs {
		payload, err := json.MarshalIndent(run, "", "  ")
		if err != nil {
			t.Fatalf("failed to marshal run fixture: %v", err)
		}
		if err := os.WriteFile(run.ArtifactPath, payload, 0o644); err != nil {
			t.Fatalf("failed to write run fixture: %v", err)
		}
	}
}
