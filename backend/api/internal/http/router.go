package httpapi

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	"oss-risk-radar/backend/api/internal/config"
	"oss-risk-radar/backend/api/internal/http/handlers"
)

func NewRouter(cfg config.Config, logger *slog.Logger, service *analysis.Service) http.Handler {
	handler := handlers.New(cfg.ServiceName, service)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.Health)
	mux.HandleFunc("GET /ready", handler.Ready)
	mux.HandleFunc("GET /api/v1/analyses", handler.ListAnalyses)
	mux.HandleFunc("POST /api/v1/analyses", handler.CreateAnalysis)
	mux.HandleFunc("GET /api/v1/analyses/{analysisId}", handler.GetAnalysis)
	mux.HandleFunc("GET /api/v1/analyses/{analysisId}/dependencies", handler.GetDependencies)
	mux.HandleFunc("GET /api/v1/analyses/{analysisId}/graph", handler.GetDependencyGraph)
	mux.HandleFunc("GET /api/v1/dependencies/{dependencyId}", handler.GetDependency)
	mux.HandleFunc("GET /api/v1/jobs/{jobId}", handler.GetJob)
	mux.HandleFunc("GET /api/v1/training/dataset", handler.GetTrainingDatasetSummary)
	mux.HandleFunc("GET /api/v1/training/runs", handler.ListTrainingRuns)
	mux.HandleFunc("GET /api/v1/training/runs/latest", handler.GetLatestTrainingRun)
	mux.HandleFunc("POST /api/v1/training/runs", handler.TriggerTrainingRun)
	mux.HandleFunc("POST /api/v1/uploads", handler.UploadArtifact)

	return withCORS(withLogging(logger, mux), cfg.AllowedOrigin)
}

func withLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		next.ServeHTTP(w, r)
		logger.Info("request completed", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(startedAt).Milliseconds())
	})
}

func withCORS(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (origin == allowedOrigin || strings.HasPrefix(origin, "http://localhost:")) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
