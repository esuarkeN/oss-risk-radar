package config

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultWorkspacePathFindsRepositoryRoot(t *testing.T) {
	path := defaultWorkspacePath("tmp/training/snapshots.json")
	expectedSuffix := filepath.Join("tmp", "training", "snapshots.json")
	if !filepath.IsAbs(path) {
		t.Fatalf("expected repository-local default path to be absolute, got %q", path)
	}
	if !strings.HasSuffix(path, expectedSuffix) {
		t.Fatalf("expected path to end with %q, got %q", expectedSuffix, path)
	}

	packageLocalTmp := filepath.Join("backend", "api", "internal", "config", "tmp")
	if strings.Contains(path, packageLocalTmp) {
		t.Fatalf("expected path to avoid package-local tmp directory, got %q", path)
	}
}
