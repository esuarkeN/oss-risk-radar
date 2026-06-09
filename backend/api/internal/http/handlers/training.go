package handlers

import (
	"net/http"

	"oss-risk-radar/backend/api/internal/analysis"
)

func (h *Handler) GetTrainingDatasetSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.service.GetTrainingDatasetSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetTrainingDatasetSummaryResponse{Dataset: summary})
}

func (h *Handler) GetLatestTrainingRun(w http.ResponseWriter, r *http.Request) {
	run, err := h.service.GetLatestTrainingRun(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetLatestTrainingRunResponse{Run: run})
}

func (h *Handler) ListTrainingRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.service.ListTrainingRuns(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.ListTrainingRunsResponse{Runs: runs})
}
