package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ServiceName         string
	Addr                string
	AllowedOrigin       string
	ScoringBaseURL      string
	MethodologyVersion  string
	DatabaseURL         string
	DepsDevBaseURL      string
	GitHubToken         string
	ScorecardBaseURL    string
	HTTPTimeout         time.Duration
	UploadDir           string
	TrainingDatasetPath string
	TrainingRunsDir     string
	WorkerPollInterval  time.Duration
	RetryDelay          time.Duration
}

func Load() Config {
	return Config{
		ServiceName:         getEnv("API_SERVICE_NAME", "oss-risk-radar-api"),
		Addr:                getEnv("API_ADDR", ":8080"),
		AllowedOrigin:       getEnv("API_ALLOWED_ORIGIN", "http://localhost:3000"),
		ScoringBaseURL:      getEnv("SCORING_SERVICE_URL", getEnv("SCORING_BASE_URL", "http://localhost:8090")),
		MethodologyVersion:  getEnv("METHODOLOGY_VERSION", "heuristic-v1"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		DepsDevBaseURL:      getEnv("DEPSDEV_BASE_URL", "https://api.deps.dev/v3alpha"),
		GitHubToken:         os.Getenv("GITHUB_TOKEN"),
		ScorecardBaseURL:    getEnv("SCORECARD_BASE_URL", "https://api.securityscorecards.dev/projects"),
		HTTPTimeout:         durationEnv("API_HTTP_TIMEOUT_SECONDS", 10*time.Second),
		UploadDir:           getEnv("UPLOAD_DIR", "tmp/uploads"),
		TrainingDatasetPath: getEnv("TRAINING_DATASET_PATH", "tmp/training/snapshots.json"),
		TrainingRunsDir:     getEnv("TRAINING_RUNS_DIR", "tmp/training/runs"),
		WorkerPollInterval:  durationEnv("WORKER_POLL_INTERVAL_SECONDS", 3*time.Second),
		RetryDelay:          durationEnv("JOB_RETRY_DELAY_SECONDS", 30*time.Second),
	}
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
