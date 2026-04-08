package handlers

import (
	"context"
	"net/http"
	"time"
)

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": h.serviceName,
		"time":    time.Now().UTC(),
	})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	status := "ready"
	checks := []map[string]string{{"name": "scoring", "status": "ready"}}
	if err := h.service.Ready(ctx); err != nil {
		status = "degraded"
		checks = []map[string]string{{"name": "scoring", "status": "unavailable", "detail": err.Error()}}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  status,
		"service": h.serviceName,
		"checks":  checks,
		"time":    time.Now().UTC(),
	})
}
