package analysis

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
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

func (m *trainingRunArtifactManager) BootstrapFromSeed(seedRunsDir string, seedLatestPath string, mergeExisting bool) (bool, error) {
	if m == nil || m.runsDir == "" {
		return false, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	seeded := false
	if seedRunsDir != "" {
		entries, err := os.ReadDir(seedRunsDir)
		if err != nil {
			if !os.IsNotExist(err) {
				return false, err
			}
		} else {
			if !mergeExisting {
				if err := os.RemoveAll(m.runsDir); err != nil {
					return false, err
				}
			}
			if err := os.MkdirAll(m.runsDir, 0o755); err != nil {
				return false, err
			}
			for _, entry := range entries {
				if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
					continue
				}
				source := filepath.Join(seedRunsDir, entry.Name())
				target := filepath.Join(m.runsDir, entry.Name())
				if mergeExisting {
					if _, err := os.Stat(target); err == nil {
						continue
					} else if !os.IsNotExist(err) {
						return false, err
					}
				}
				if err := copyFile(source, target); err != nil {
					return false, err
				}
				seeded = true
			}
		}
	}

	if seedLatestPath != "" && m.latestPath != "" {
		if _, err := os.Stat(seedLatestPath); err == nil {
			if !mergeExisting {
				if err := os.Remove(m.latestPath); err != nil && !os.IsNotExist(err) {
					return false, err
				}
			}
			if _, err := os.Stat(m.latestPath); os.IsNotExist(err) || !mergeExisting {
				if err := os.MkdirAll(filepath.Dir(m.latestPath), 0o755); err != nil {
					return false, err
				}
				if err := copyFile(seedLatestPath, m.latestPath); err != nil {
					return false, err
				}
				seeded = true
			} else if err != nil {
				return false, err
			}
		} else if os.IsNotExist(err) {
			if !mergeExisting {
				if removeErr := os.Remove(m.latestPath); removeErr == nil {
					seeded = true
				} else if !os.IsNotExist(removeErr) {
					return false, removeErr
				}
			}
		} else {
			return false, err
		}
	}

	return seeded, nil
}

func copyFile(source string, target string) error {
	payload, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, payload, 0o644)
}
