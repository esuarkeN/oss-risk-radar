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

func (h *Handler) TriggerTrainingRun(w http.ResponseWriter, r *http.Request) {
	var request analysis.TriggerTrainingRunRequest
	if err := decodeJSON(r, &request); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid training run payload")
		return
	}

	run, reused, err := h.service.TriggerTrainingRun(r.Context(), request.Force)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.TriggerTrainingRunResponse{Run: run, ReusedCachedRun: reused})
}
