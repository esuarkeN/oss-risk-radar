package scorecard

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"oss-risk-radar/backend/api/internal/providers"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(baseURL string) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.securityscorecards.dev/projects"
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), httpClient: &http.Client{Timeout: 8 * time.Second}}
}

func (c *Client) GetScorecard(ctx context.Context, repositoryURL string) (*providers.ScorecardSnapshot, error) {
	ownerRepo, err := ownerRepoFromURL(repositoryURL)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/github.com/%s", c.baseURL, ownerRepo), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("scorecard returned %d", response.StatusCode)
	}

	var payload struct {
		Score  float64 `json:"score"`
		Checks []struct {
			Name   string  `json:"name"`
			Score  float64 `json:"score"`
			Reason string  `json:"reason"`
		} `json:"checks"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	checks := make([]providers.ScorecardCheck, 0, len(payload.Checks))
	for _, check := range payload.Checks {
		checks = append(checks, providers.ScorecardCheck{Name: check.Name, Score: check.Score, Reason: check.Reason})
	}
	return &providers.ScorecardSnapshot{Score: payload.Score, Checks: checks}, nil
}

func ownerRepoFromURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSuffix(strings.TrimSpace(raw), ".git"))
	if err != nil {
		return "", err
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid repository url")
	}
	return parts[0] + "/" + parts[1], nil
}
