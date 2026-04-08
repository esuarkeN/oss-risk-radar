package depsdev

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
	baseURL string
	http    *http.Client
}

func New(baseURL string) *Client {
	if baseURL == "" {
		baseURL = "https://api.deps.dev/v3"
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: 8 * time.Second}}
}

func (c *Client) ResolvePackage(ctx context.Context, ecosystem string, name string, version string) (providers.PackageMetadata, error) {
	metadata := providers.PackageMetadata{Ecosystem: ecosystem, Name: name, Version: version}
	if strings.TrimSpace(version) == "" || strings.EqualFold(version, "unknown") {
		return metadata, fmt.Errorf("version is required for deps.dev resolution")
	}
	endpoint := fmt.Sprintf("%s/systems/%s/packages/%s/versions/%s", c.baseURL, normalizeSystem(ecosystem), url.PathEscape(name), url.PathEscape(version))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return metadata, err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return metadata, err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		return metadata, fmt.Errorf("deps.dev returned %d", response.StatusCode)
	}

	var payload struct {
		Version struct {
			Links []struct {
				Label string `json:"label"`
				URL   string `json:"url"`
			} `json:"links"`
		} `json:"version"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return metadata, err
	}
	for _, link := range payload.Version.Links {
		if strings.EqualFold(link.Label, "SOURCE_REPO") || strings.Contains(strings.ToLower(link.URL), "github.com") {
			metadata.RepositoryURL = strings.TrimSuffix(link.URL, ".git")
			break
		}
	}
	if metadata.RepositoryURL == "" {
		return metadata, fmt.Errorf("no repository mapping found")
	}
	return metadata, nil
}

func normalizeSystem(ecosystem string) string {
	switch strings.ToLower(ecosystem) {
	case "python":
		return "pypi"
	default:
		return strings.ToLower(ecosystem)
	}
}
