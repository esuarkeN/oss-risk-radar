package github

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"oss-risk-radar/backend/api/internal/providers"
)

type Client struct {
	token      string
	httpClient *http.Client
	baseURL    string
}

func New(token string) *Client {
	return &Client{token: token, httpClient: &http.Client{Timeout: 10 * time.Second}, baseURL: "https://api.github.com"}
}

func (c *Client) GetRepository(ctx context.Context, repositoryURL string) (*providers.RepositorySnapshot, error) {
	owner, repo, err := ownerRepoFromURL(repositoryURL)
	if err != nil {
		return nil, err
	}

	var payload struct {
		FullName      string    `json:"full_name"`
		HTMLURL       string    `json:"html_url"`
		DefaultBranch string    `json:"default_branch"`
		Archived      bool      `json:"archived"`
		Stars         int       `json:"stargazers_count"`
		Forks         int       `json:"forks_count"`
		OpenIssues    int       `json:"open_issues_count"`
		PushedAt      time.Time `json:"pushed_at"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("/repos/%s/%s", owner, repo), &payload); err != nil {
		return nil, err
	}

	releaseTimes, _ := c.getReleaseTimes(ctx, owner, repo)
	recentContributors, concentration, _ := c.getRecentContributorStats(ctx, owner, repo)
	prMedian, _ := c.getPRMedian(ctx, owner, repo)
	openIssueGrowth, _ := c.getOpenIssueGrowth(ctx, owner, repo, payload.OpenIssues)

	snapshot := &providers.RepositorySnapshot{
		FullName:                      payload.FullName,
		URL:                           payload.HTMLURL,
		DefaultBranch:                 payload.DefaultBranch,
		Archived:                      payload.Archived,
		Stars:                         payload.Stars,
		Forks:                         payload.Forks,
		OpenIssues:                    payload.OpenIssues,
		LastPushAt:                    payload.PushedAt,
		RecentContributors90d:         recentContributors,
		ContributorConcentration:      concentration,
		PullRequestMedianResponseDays: prMedian,
		LastPushAgeDays:               ageDays(payload.PushedAt),
		OpenIssueGrowth90d:            openIssueGrowth,
	}

	if len(releaseTimes) > 0 {
		lastReleaseAt := releaseTimes[0]
		snapshot.LastReleaseAt = &lastReleaseAt
		age := ageDays(lastReleaseAt)
		snapshot.LastReleaseAgeDays = &age
		if cadence := averageReleaseCadenceDays(releaseTimes); cadence != nil {
			snapshot.ReleaseCadenceDays = cadence
		}
	}

	return snapshot, nil
}

func (c *Client) FetchManifest(ctx context.Context, repositoryURL string, path string) ([]byte, error) {
	owner, repo, err := ownerRepoFromURL(repositoryURL)
	if err != nil {
		return nil, err
	}

	repoSnapshot, err := c.GetRepository(ctx, repositoryURL)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", owner, repo, url.PathEscape(path), url.QueryEscape(repoSnapshot.DefaultBranch))
	var payload struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := c.getJSON(ctx, endpoint, &payload); err != nil {
		return nil, err
	}
	if payload.Encoding != "base64" {
		return nil, fmt.Errorf("unsupported github content encoding: %s", payload.Encoding)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(payload.Content, "\n", ""))
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

func (c *Client) getReleaseTimes(ctx context.Context, owner string, repo string) ([]time.Time, error) {
	var payload []struct {
		PublishedAt *time.Time `json:"published_at"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("/repos/%s/%s/releases?per_page=5", owner, repo), &payload); err != nil {
		return nil, err
	}

	releases := make([]time.Time, 0, len(payload))
	for _, item := range payload {
		if item.PublishedAt != nil && !item.PublishedAt.IsZero() {
			releases = append(releases, item.PublishedAt.UTC())
		}
	}
	sort.Slice(releases, func(i, j int) bool { return releases[i].After(releases[j]) })
	return releases, nil
}

func (c *Client) getRecentContributorStats(ctx context.Context, owner string, repo string) (*int, *float64, error) {
	since := time.Now().UTC().AddDate(0, 0, -90).Format(time.RFC3339)
	var payload []struct {
		Author *struct {
			Login string `json:"login"`
		} `json:"author"`
		Commit struct {
			Author struct {
				Name  string `json:"name"`
				Email string `json:"email"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("/repos/%s/%s/commits?since=%s&per_page=100", owner, repo, url.QueryEscape(since)), &payload); err != nil {
		return nil, nil, err
	}
	if len(payload) == 0 {
		zero := 0
		concentration := 0.0
		return &zero, &concentration, nil
	}

	contributions := map[string]int{}
	for _, item := range payload {
		identity := ""
		if item.Author != nil && item.Author.Login != "" {
			identity = item.Author.Login
		} else if item.Commit.Author.Email != "" {
			identity = item.Commit.Author.Email
		} else {
			identity = item.Commit.Author.Name
		}
		if identity == "" {
			continue
		}
		contributions[identity]++
	}

	count := len(contributions)
	if count == 0 {
		zero := 0
		concentration := 0.0
		return &zero, &concentration, nil
	}

	top := 0
	total := 0
	for _, commitCount := range contributions {
		total += commitCount
		if commitCount > top {
			top = commitCount
		}
	}
	concentration := float64(top) / float64(total)
	return &count, &concentration, nil
}

func (c *Client) getPRMedian(ctx context.Context, owner string, repo string) (*float64, error) {
	var payload []struct {
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("/repos/%s/%s/pulls?state=closed&sort=updated&direction=desc&per_page=20", owner, repo), &payload); err != nil {
		return nil, err
	}
	if len(payload) == 0 {
		return nil, fmt.Errorf("no pull requests found")
	}

	samples := make([]float64, 0, len(payload))
	for _, item := range payload {
		samples = append(samples, item.UpdatedAt.Sub(item.CreatedAt).Hours()/24)
	}
	sort.Float64s(samples)
	median := samples[len(samples)/2]
	return &median, nil
}

func (c *Client) getOpenIssueGrowth(ctx context.Context, owner string, repo string, openIssues int) (*float64, error) {
	if openIssues == 0 {
		zero := 0.0
		return &zero, nil
	}
	date := time.Now().UTC().AddDate(0, 0, -90).Format("2006-01-02")
	query := url.QueryEscape(fmt.Sprintf("repo:%s/%s type:issue state:open created:>=%s", owner, repo, date))
	var payload struct {
		TotalCount int `json:"total_count"`
	}
	if err := c.getJSON(ctx, "/search/issues?q="+query, &payload); err != nil {
		return nil, err
	}
	growth := float64(payload.TotalCount) / float64(openIssues)
	return &growth, nil
}

func (c *Client) getJSON(ctx context.Context, path string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.token != "" {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("github returned %d for %s", response.StatusCode, path)
	}
	return json.NewDecoder(response.Body).Decode(target)
}

func ownerRepoFromURL(raw string) (string, string, error) {
	parsed, err := url.Parse(strings.TrimSuffix(strings.TrimSpace(raw), ".git"))
	if err != nil {
		return "", "", err
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid repository url")
	}
	return parts[0], parts[1], nil
}

func ageDays(value time.Time) int {
	if value.IsZero() {
		return 0
	}
	return int(time.Since(value.UTC()).Hours() / 24)
}

func averageReleaseCadenceDays(releases []time.Time) *int {
	if len(releases) < 2 {
		return nil
	}
	total := 0.0
	intervals := 0
	for index := 0; index < len(releases)-1; index++ {
		delta := releases[index].Sub(releases[index+1]).Hours() / 24
		if delta <= 0 {
			continue
		}
		total += delta
		intervals++
	}
	if intervals == 0 {
		return nil
	}
	cadence := int(total / float64(intervals))
	return &cadence
}
