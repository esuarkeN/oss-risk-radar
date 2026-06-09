package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ServiceName                  string
	Addr                         string
	AllowedOrigin                string
	ScoringBaseURL               string
	MethodologyVersion           string
	DatabaseURL                  string
	DepsDevBaseURL               string
	GitHubToken                  string
	ScorecardBaseURL             string
	HTTPTimeout                  time.Duration
	UploadDir                    string
	TrainingDatasetPath          string
	TrainingFeatureCachePath     string
	TrainingRunsDir              string
	TrainingModelName            string
	TrainingSeedDatasetPath      string
	TrainingSeedFeatureCachePath string
	TrainingSeedRunsDir          string
	TrainingSeedLatestRunPath    string
	TrainingSeedMergeExisting    bool
	WorkerPollInterval           time.Duration
	RetryDelay                   time.Duration
}

func Load() Config {
	return Config{
		ServiceName:                  getEnv("API_SERVICE_NAME", "oss-risk-radar-api"),
		Addr:                         getEnv("API_ADDR", ":8080"),
		AllowedOrigin:                getEnv("API_ALLOWED_ORIGIN", "http://localhost:3000"),
		ScoringBaseURL:               getEnv("SCORING_SERVICE_URL", getEnv("SCORING_BASE_URL", "http://localhost:8090")),
		MethodologyVersion:           getEnv("METHODOLOGY_VERSION", "inactivity-risk-v1"),
		DatabaseURL:                  os.Getenv("DATABASE_URL"),
		DepsDevBaseURL:               getEnv("DEPSDEV_BASE_URL", "https://api.deps.dev/v3alpha"),
		GitHubToken:                  os.Getenv("GITHUB_TOKEN"),
		ScorecardBaseURL:             getEnv("SCORECARD_BASE_URL", "https://api.securityscorecards.dev/projects"),
		HTTPTimeout:                  durationEnv("API_HTTP_TIMEOUT_SECONDS", 10*time.Second),
		UploadDir:                    getEnv("UPLOAD_DIR", "tmp/uploads"),
		TrainingDatasetPath:          getEnv("TRAINING_DATASET_PATH", defaultWorkspacePath("tmp/training/snapshots.json")),
		TrainingFeatureCachePath:     getEnv("TRAINING_FEATURE_CACHE_PATH", defaultWorkspacePath("tmp/training/repository-feature-cache.json")),
		TrainingRunsDir:              getEnv("TRAINING_RUNS_DIR", defaultWorkspacePath("tmp/training/runs")),
		TrainingModelName:            getEnv("TRAINING_MODEL_NAME", "all"),
		TrainingSeedDatasetPath:      os.Getenv("TRAINING_SEED_DATASET_PATH"),
		TrainingSeedFeatureCachePath: os.Getenv("TRAINING_SEED_FEATURE_CACHE_PATH"),
		TrainingSeedRunsDir:          os.Getenv("TRAINING_SEED_RUNS_DIR"),
		TrainingSeedLatestRunPath:    os.Getenv("TRAINING_SEED_LATEST_RUN_PATH"),
		TrainingSeedMergeExisting:    boolEnv("TRAINING_SEED_MERGE_EXISTING", true),
		WorkerPollInterval:           durationEnv("WORKER_POLL_INTERVAL_SECONDS", 3*time.Second),
		RetryDelay:                   durationEnv("JOB_RETRY_DELAY_SECONDS", 30*time.Second),
	}
}

func defaultWorkspacePath(relativePath string) string {
	cleanPath := filepath.FromSlash(relativePath)
	if filepath.IsAbs(cleanPath) {
		return cleanPath
	}

	workingDir, err := os.Getwd()
	if err != nil {
		return cleanPath
	}
	for dir := workingDir; dir != ""; dir = filepath.Dir(dir) {
		if isWorkspaceRoot(dir) {
			return filepath.Join(dir, cleanPath)
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return cleanPath
}

func isWorkspaceRoot(path string) bool {
	if _, err := os.Stat(filepath.Join(path, "package.json")); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(path, "compose.yaml")); err != nil {
		return false
	}
	return true
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func boolEnv(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}
