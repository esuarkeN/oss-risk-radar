package analysis

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type trainingRunArtifactManager struct {
	runsDir    string
	latestPath string
	mu         sync.Mutex
}

func newTrainingRunArtifactManager(runsDir string) *trainingRunArtifactManager {
	cleanRunsDir := strings.TrimSpace(runsDir)
	latestPath := ""
	if cleanRunsDir != "" {
		latestPath = filepath.Join(filepath.Dir(cleanRunsDir), "latest-run.json")
	}
	return &trainingRunArtifactManager{runsDir: cleanRunsDir, latestPath: latestPath}
}

func (m *trainingRunArtifactManager) Latest() (*TrainingRunArtifact, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.readLatest()
}

func (m *trainingRunArtifactManager) List() ([]TrainingRunArtifact, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m == nil || m.runsDir == "" {
		return []TrainingRunArtifact{}, nil
	}

	entries, err := os.ReadDir(m.runsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []TrainingRunArtifact{}, nil
		}
		return nil, err
	}

	runs := make([]TrainingRunArtifact, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		payload, err := os.ReadFile(filepath.Join(m.runsDir, entry.Name()))
		if err != nil {
			return nil, err
		}
		if len(payload) == 0 {
			continue
		}

		var run TrainingRunArtifact
		if err := json.Unmarshal(payload, &run); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}

	sort.Slice(runs, func(i, j int) bool {
		if runs[i].CachedAt.Equal(runs[j].CachedAt) {
			return runs[i].ArtifactPath < runs[j].ArtifactPath
		}
		return runs[i].CachedAt.Before(runs[j].CachedAt)
	})
	return runs, nil
}

func (m *trainingRunArtifactManager) Save(run TrainingRunArtifact) (TrainingRunArtifact, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m == nil || m.runsDir == "" {
		return run, nil
	}
	if run.CachedAt.IsZero() {
		run.CachedAt = time.Now().UTC()
	}
	if err := os.MkdirAll(m.runsDir, 0o755); err != nil {
		return TrainingRunArtifact{}, err
	}
	if m.latestPath != "" {
		if err := os.MkdirAll(filepath.Dir(m.latestPath), 0o755); err != nil {
			return TrainingRunArtifact{}, err
		}
	}
	if strings.TrimSpace(run.ArtifactPath) == "" {
		stamp := run.CachedAt.UTC().Format("20060102T150405.000000000Z")
		shortHash := "adhoc"
		switch {
		case len(run.DatasetHash) >= 12:
			shortHash = run.DatasetHash[:12]
		case run.DatasetHash != "":
			shortHash = run.DatasetHash
		}
		run.ArtifactPath = filepath.Join(m.runsDir, stamp+"-"+shortHash+".json")
	}

	payload, err := json.MarshalIndent(run, "", "  ")
	if err != nil {
		return TrainingRunArtifact{}, err
	}
	if err := os.WriteFile(run.ArtifactPath, payload, 0o644); err != nil {
		return TrainingRunArtifact{}, err
	}
	if m.latestPath != "" {
		if err := os.WriteFile(m.latestPath, payload, 0o644); err != nil {
			return TrainingRunArtifact{}, err
		}
	}
	return run, nil
}

func (m *trainingRunArtifactManager) readLatest() (*TrainingRunArtifact, error) {
	if m == nil || m.latestPath == "" {
		return nil, nil
	}
	payload, err := os.ReadFile(m.latestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	if len(payload) == 0 {
		return nil, nil
	}

	var run TrainingRunArtifact
	if err := json.Unmarshal(payload, &run); err != nil {
		return nil, err
	}
	return &run, nil
}
