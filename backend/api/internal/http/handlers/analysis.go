package handlers

import (
	"net/http"

	"oss-risk-radar/backend/api/internal/analysis"
)

func (h *Handler) ListAnalyses(w http.ResponseWriter, r *http.Request) {
	analyses, err := h.service.ListAnalyses(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.ListAnalysesResponse{Analyses: analyses})
}

func (h *Handler) CreateAnalysis(w http.ResponseWriter, r *http.Request) {
	var request analysis.CreateAnalysisRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid analysis request payload")
		return
	}

	var (
		analysisRecord analysis.AnalysisRecord
		jobRecord      analysis.JobRecord
		reusedExisting bool
		err            error
	)
	if request.Force {
		analysisRecord, jobRecord, err = h.service.CreateAnalysis(r.Context(), request.Submission)
	} else {
		analysisRecord, jobRecord, reusedExisting, err = h.service.CreateOrReuseAnalysis(r.Context(), request.Submission)
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	statusCode := http.StatusCreated
	if reusedExisting {
		statusCode = http.StatusOK
	}
	response := analysis.CreateAnalysisResponse{
		Analysis:               analysisRecord,
		Job:                    jobRecord,
		ReusedExistingAnalysis: reusedExisting,
	}
	if reusedExisting {
		response.ReusedFromAnalysisID = analysisRecord.ID
	}
	writeJSON(w, statusCode, response)
}

func (h *Handler) GetAnalysis(w http.ResponseWriter, r *http.Request) {
	analysisRecord, err := h.service.GetAnalysis(r.Context(), r.PathValue("analysisId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetAnalysisResponse{Analysis: analysisRecord})
}

// CreateBatchAnalyses submits many repository URLs in one request. Unlike
// CreateAnalysis, a per-entry problem (an empty URL, a submission the service
// rejects) never turns into an HTTP error for the whole call — it is
// visible only on that entry's BatchAnalysisResult.Error, so the caller does
// not have to resubmit URLs that were accepted alongside one that was not.
// The request itself is rejected only for a validation problem that applies
// to the WHOLE call: an empty list or exceeding MaxBatchAnalysisSize.
func (h *Handler) CreateBatchAnalyses(w http.ResponseWriter, r *http.Request) {
	var request analysis.CreateBatchAnalysisRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid batch analysis request payload")
		return
	}

	response, err := h.service.CreateBatchAnalyses(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// GetBatchAnalyses is the polling counterpart of CreateBatchAnalyses: it reads
// back many analyses in one request instead of costing the caller one request
// per analysis ID. Same per-entry error handling as the submission side.
func (h *Handler) GetBatchAnalyses(w http.ResponseWriter, r *http.Request) {
	var request analysis.GetBatchAnalysesRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid batch status request payload")
		return
	}

	response, err := h.service.GetBatchAnalyses(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) GetDependencies(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.GetDependencies(r.Context(), r.PathValue("analysisId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetDependenciesResponse{Dependencies: items})
}

func (h *Handler) GetDependency(w http.ResponseWriter, r *http.Request) {
	dependency, err := h.service.GetDependency(r.Context(), r.PathValue("dependencyId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetDependencyResponse{Dependency: dependency})
}

func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	job, err := h.service.GetJob(r.Context(), r.PathValue("jobId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetJobResponse{Job: job})
}
