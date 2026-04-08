package handlers

import (
	"io"
	"mime/multipart"
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

	analysisRecord, jobRecord, err := h.service.CreateAnalysis(r.Context(), request.Submission)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, analysis.CreateAnalysisResponse{Analysis: analysisRecord, Job: jobRecord})
}

func (h *Handler) GetAnalysis(w http.ResponseWriter, r *http.Request) {
	analysisRecord, err := h.service.GetAnalysis(r.Context(), r.PathValue("analysisId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetAnalysisResponse{Analysis: analysisRecord})
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

func (h *Handler) GetDependencyGraph(w http.ResponseWriter, r *http.Request) {
	graph, err := h.service.GetDependencyGraph(r.Context(), r.PathValue("analysisId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetDependencyGraphResponse{Graph: graph})
}

func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	job, err := h.service.GetJob(r.Context(), r.PathValue("jobId"))
	if err != nil {
		writeError(w, statusFromErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, analysis.GetJobResponse{Job: job})
}

func (h *Handler) UploadArtifact(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse multipart upload")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	content, err := readMultipartFile(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read uploaded file")
		return
	}
	upload, err := h.service.CreateUpload(r.Context(), header.Filename, header.Header.Get("Content-Type"), content)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, analysis.CreateUploadResponse{Upload: upload})
}

func readMultipartFile(file multipart.File) ([]byte, error) {
	return io.ReadAll(file)
}

