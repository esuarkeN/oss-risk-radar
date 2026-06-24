package analysis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTrainingDatasetHashMatchesArtifactCanonicalFloatEncoding(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	datasetPath := filepath.Join(root, "snapshots.json")
	label := true
	writeJSONForBootstrapTest(t, datasetPath, trainingDatasetEnvelope{Snapshots: []TrainingSnapshotRecord{{
		AnalysisID: "analysis_1",
		ObservedAt: "2023-01-01T00:00:00Z",
		Dependency: TrainingDependencySignalSnapshot{
			DependencyID:   "dep_1",
			PackageName:    "requests<&",
			PackageVersion: "2.31.0",
			Ecosystem:      "pypi",
			Direct:         true,
			HistoricalFeatures: map[string]float64{
				"zeta": 2, "alpha": 1, "small": 1.2e-5, "million": 1_000_000, "huge": 1e16,
			},
		},
		LabelInactive12M: &label,
	}}})

	expectedPayload := `[{"analysis_id":"analysis_1","observed_at":"2023-01-01T00:00:00Z","dependency":{"dependency_id":"dep_1","package_name":"requests<&","package_version":"2.31.0","ecosystem":"pypi","direct":true,"historical_features":{"alpha":1.0,"huge":1e+16,"million":1000000.0,"small":1.2e-05,"zeta":2.0}},"label_inactive_12m":true}]`
	expectedSum := sha256.Sum256([]byte(expectedPayload))
	_, actualHash, err := newTrainingDatasetManager(datasetPath).LoadSnapshots()
	if err != nil {
		t.Fatalf("load snapshots: %v", err)
	}
	if actualHash != hex.EncodeToString(expectedSum[:]) {
		t.Fatalf("unexpected canonical dataset hash: %s", actualHash)
	}
}

func TestTrainingDatasetBootstrapReplacesOfflineRowsAndKeepsLiveCandidates(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	seedPath := filepath.Join(root, "seed.json")
	runtimePath := filepath.Join(root, "runtime.json")
	seed := trainingDatasetEnvelope{Snapshots: []TrainingSnapshotRecord{
		trainingSnapshotForBootstrapTest("dataset:foundation:2025-01-01", "foundation/repo", boolPointerForBootstrapTest(false)),
	}}
	current := trainingDatasetEnvelope{Snapshots: []TrainingSnapshotRecord{
		trainingSnapshotForBootstrapTest("dataset:legacy:2024-01-01", "legacy/repo", boolPointerForBootstrapTest(true)),
		trainingSnapshotForBootstrapTest("analysis_live", "live/repo", nil),
		trainingSnapshotForBootstrapTest("analysis_live", "", nil),
		trainingSnapshotForBootstrapTest("analysis_labeled", "labeled/repo", boolPointerForBootstrapTest(false)),
		trainingSnapshotForBootstrapTest("analysis_unmapped", "", nil),
		trainingSnapshotForBootstrapTest("analysis_invalid", "invalid", nil),
	}}
	writeJSONForBootstrapTest(t, seedPath, seed)
	writeJSONForBootstrapTest(t, runtimePath, current)

	manager := newTrainingDatasetManager(runtimePath)
	seeded, err := manager.BootstrapFromSeed(seedPath, true)
	if err != nil {
		t.Fatalf("bootstrap dataset: %v", err)
	}
	if !seeded {
		t.Fatal("expected dataset bootstrap to report seeded data")
	}
	result, err := readTrainingDatasetFile(runtimePath)
	if err != nil {
		t.Fatalf("read bootstrapped dataset: %v", err)
	}
	if len(result.Snapshots) != 3 {
		t.Fatalf("expected foundation plus the two captures from one verified live analysis, got %d", len(result.Snapshots))
	}
	ids := map[string]int{}
	for _, snapshot := range result.Snapshots {
		ids[snapshot.AnalysisID]++
	}
	if ids["dataset:foundation:2025-01-01"] != 1 || ids["analysis_live"] != 2 {
		t.Fatalf("unexpected retained snapshots: %#v", ids)
	}
}

func TestTrainingRunBootstrapSynchronizesSeedExactly(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	seedRoot := filepath.Join(root, "seed")
	seedRuns := filepath.Join(seedRoot, "runs")
	runtimeRoot := filepath.Join(root, "runtime")
	runtimeRuns := filepath.Join(runtimeRoot, "runs")
	if err := os.MkdirAll(seedRuns, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(runtimeRuns, 0o755); err != nil {
		t.Fatal(err)
	}
	current := TrainingRunArtifact{ModelName: "xgboost-full-history", DatasetHash: "current", Status: "completed", CachedAt: time.Now().UTC()}
	stale := TrainingRunArtifact{ModelName: "xgboost-baseline", DatasetHash: "stale", Status: "completed", CachedAt: time.Now().Add(-time.Hour).UTC()}
	writeJSONForBootstrapTest(t, filepath.Join(seedRuns, "current.json"), current)
	writeJSONForBootstrapTest(t, filepath.Join(seedRoot, "latest-run.json"), current)
	writeJSONForBootstrapTest(t, filepath.Join(runtimeRuns, "stale.json"), stale)
	writeJSONForBootstrapTest(t, filepath.Join(runtimeRoot, "latest-run.json"), stale)

	manager := newTrainingRunArtifactManager(runtimeRuns)
	seeded, err := manager.BootstrapFromSeed(seedRuns, filepath.Join(seedRoot, "latest-run.json"), false)
	if err != nil {
		t.Fatalf("bootstrap runs: %v", err)
	}
	if !seeded {
		t.Fatal("expected run bootstrap to report seeded data")
	}
	runs, err := manager.List()
	if err != nil {
		t.Fatalf("list synchronized runs: %v", err)
	}
	if len(runs) != 1 || runs[0].DatasetHash != "current" {
		t.Fatalf("unexpected synchronized runs: %#v", runs)
	}
	latest, err := manager.Latest()
	if err != nil {
		t.Fatalf("read latest synchronized run: %v", err)
	}
	if latest == nil || latest.DatasetHash != "current" {
		t.Fatalf("unexpected latest run: %#v", latest)
	}

	if err := os.Remove(filepath.Join(seedRoot, "latest-run.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.BootstrapFromSeed(seedRuns, filepath.Join(seedRoot, "latest-run.json"), false); err != nil {
		t.Fatalf("synchronize missing latest pointer: %v", err)
	}
	latest, err = manager.Latest()
	if err != nil {
		t.Fatalf("read removed latest pointer: %v", err)
	}
	if latest != nil {
		t.Fatalf("expected stale latest pointer to be removed, got %#v", latest)
	}
}

func trainingSnapshotForBootstrapTest(analysisID string, fullName string, label *bool) TrainingSnapshotRecord {
	snapshot := TrainingSnapshotRecord{
		AnalysisID:       analysisID,
		ObservedAt:       "2025-01-01T00:00:00Z",
		LabelInactive12M: label,
		Dependency: TrainingDependencySignalSnapshot{
			DependencyID:   analysisID + ":dependency",
			PackageName:    fullName,
			PackageVersion: "repository-snapshot",
			Ecosystem:      "github",
			Direct:         true,
		},
	}
	if fullName != "" {
		snapshot.Dependency.Repository = &TrainingRepositorySignalSnapshot{FullName: fullName, URL: "https://github.com/" + fullName}
	}
	return snapshot
}

func boolPointerForBootstrapTest(value bool) *bool { return &value }

func writeJSONForBootstrapTest(t *testing.T, path string, value any) {
	t.Helper()
	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatal(err)
	}
}
