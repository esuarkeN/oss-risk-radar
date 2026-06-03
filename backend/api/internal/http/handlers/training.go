package handlers

import (
	"errors"
	"io"
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

func (h *Handler) TriggerTrainingRun(w http.ResponseWriter, r *http.Request) {
	var request analysis.TriggerTrainingRunRequest
	if err := decodeJSON(r, &request); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid training run payload")
		return
	}

	runs, reused, err := h.service.TriggerTrainingRunsForModel(r.Context(), request.Force, request.ModelName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(runs) == 0 {
		writeError(w, http.StatusBadRequest, "training did not produce any model artifacts")
		return
	}
	writeJSON(w, http.StatusOK, analysis.TriggerTrainingRunResponse{Run: analysis.BestTrainingRun(runs), Runs: runs, ReusedCachedRun: reused})
}
