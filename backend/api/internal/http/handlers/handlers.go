package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"oss-risk-radar/backend/api/internal/analysis"
)

type Handler struct {
	serviceName string
	service     *analysis.Service
}

func New(serviceName string, service *analysis.Service) *Handler {
	return &Handler{serviceName: serviceName, service: service}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, analysis.ErrorResponse{Error: message})
}

func statusFromErr(err error) int {
	if errors.Is(err, analysis.ErrNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
