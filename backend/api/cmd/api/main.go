package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
	depsdevclient "oss-risk-radar/backend/api/internal/clients/depsdev"
	githubclient "oss-risk-radar/backend/api/internal/clients/github"
	scorecardclient "oss-risk-radar/backend/api/internal/clients/scorecard"
	scoringclient "oss-risk-radar/backend/api/internal/clients/scoring"
	"oss-risk-radar/backend/api/internal/config"
	httpapi "oss-risk-radar/backend/api/internal/http"
	"oss-risk-radar/backend/api/internal/storage"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	var store analysis.Store
	if cfg.DatabaseURL != "" {
		postgresStore, err := storage.NewPostgresStore(cfg.DatabaseURL)
		if err != nil {
			logger.Warn("postgres store unavailable; continuing with in-memory service state", "error", err)
			store = storage.NewMemoryStore()
		} else {
			defer postgresStore.Close()
			logger.Info("postgres connectivity check passed", "store", postgresStore.String())
			store = postgresStore
		}
	} else {
		store = storage.NewMemoryStore()
	}

	scorer := scoringclient.NewClient(cfg.ScoringBaseURL, logger)
	github := githubclient.New(cfg.GitHubToken)
	service := analysis.NewServiceWithOptions(analysis.ServiceOptions{
		MethodologyVersion:  cfg.MethodologyVersion,
		Store:               store,
		Scorer:              scorer,
		ManifestFetcher:     github,
		PackageResolver:     depsdevclient.New(cfg.DepsDevBaseURL),
		RepositoryClient:    github,
		ScorecardClient:     scorecardclient.New(cfg.ScorecardBaseURL),
		UploadDir:           cfg.UploadDir,
		TrainingDatasetPath: cfg.TrainingDatasetPath,
		TrainingRunsDir:     cfg.TrainingRunsDir,
		WorkerPollInterval:  cfg.WorkerPollInterval,
		RetryDelay:          cfg.RetryDelay,
		Logger:              logger,
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	service.Start(ctx)

	router := httpapi.NewRouter(cfg, logger, service)
	server := &http.Server{Addr: cfg.Addr, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}

	go func() {
		logger.Info("starting api service", "address", server.Addr, "scoring_url", cfg.ScoringBaseURL)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("api service stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	logger.Info("shutting down api service")
	_ = server.Shutdown(shutdownCtx)
}
