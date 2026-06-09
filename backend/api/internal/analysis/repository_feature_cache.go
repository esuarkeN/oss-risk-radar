package analysis

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type repositoryFeatureCacheManager struct {
	path string
}

type repositoryFeatureCacheEnvelope struct {
	UpdatedAt    string                        `json:"updatedAt,omitempty"`
	Repositories []repositoryFeatureCacheEntry `json:"repositories"`
}

type repositoryFeatureCacheEntry struct {
	RepositoryFullName string             `json:"repositoryFullName"`
	RepositoryURL      string             `json:"repositoryUrl,omitempty"`
	ObservedAt         string             `json:"observedAt,omitempty"`
	Source             string             `json:"source,omitempty"`
	FeatureValues      map[string]float64 `json:"featureValues"`
	MissingFeatures    []string           `json:"missingFeatures,omitempty"`
}

func newRepositoryFeatureCacheManager(path string) *repositoryFeatureCacheManager {
	return &repositoryFeatureCacheManager{path: path}
}

func (m *repositoryFeatureCacheManager) BootstrapFromSeed(seedPath string) (bool, error) {
	if m == nil || strings.TrimSpace(m.path) == "" || strings.TrimSpace(seedPath) == "" {
		return false, nil
	}
	payload, err := os.ReadFile(seedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if len(payload) == 0 {
		return false, nil
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return false, err
	}
	if err := os.WriteFile(m.path, payload, 0o644); err != nil {
		return false, err
	}
	return true, nil
}

func (m *repositoryFeatureCacheManager) Lookup(fullName string, repositoryURL string) (map[string]float64, bool) {
	if m == nil || strings.TrimSpace(m.path) == "" {
		return nil, false
	}
	payload, err := os.ReadFile(m.path)
	if err != nil || len(payload) == 0 {
		return nil, false
	}

	var envelope repositoryFeatureCacheEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return nil, false
	}

	key := normalizedRepositoryFeatureCacheKey(fullName, repositoryURL)
	if key == "" {
		return nil, false
	}
	for _, entry := range envelope.Repositories {
		entryKey := normalizedRepositoryFeatureCacheKey(entry.RepositoryFullName, entry.RepositoryURL)
		if entryKey != key || len(entry.FeatureValues) == 0 {
			continue
		}
		return cloneFeatureValues(entry.FeatureValues), true
	}
	return nil, false
}

func normalizedRepositoryFeatureCacheKey(fullName string, repositoryURL string) string {
	trimmed := strings.Trim(strings.ToLower(strings.TrimSpace(fullName)), "/")
	if trimmed != "" {
		return strings.TrimSuffix(trimmed, ".git")
	}
	parsed, err := url.Parse(strings.TrimSpace(repositoryURL))
	if err != nil {
		return ""
	}
	if !strings.EqualFold(parsed.Host, "github.com") {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 2 {
		return ""
	}
	return strings.TrimSuffix(strings.ToLower(parts[0]+"/"+parts[1]), ".git")
}

func cloneFeatureValues(values map[string]float64) map[string]float64 {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]float64, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
