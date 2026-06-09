package scoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"oss-risk-radar/backend/api/internal/analysis"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	logger     *slog.Logger
}

func NewClient(baseURL string, logger *slog.Logger) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 60 * time.Second},
		logger:     logger,
	}
}

type scoreRequest struct {
	AnalysisID    string                  `json:"analysis_id"`
	Dependencies  []dependencySignalInput `json:"dependencies"`
	ModelArtifact *modelArtifactInput     `json:"model_artifact,omitempty"`
}

type dependencySignalInput struct {
	DependencyID       string                   `json:"dependency_id"`
	PackageName        string                   `json:"package_name"`
	PackageVersion     string                   `json:"package_version"`
	Ecosystem          string                   `json:"ecosystem"`
	Direct             bool                     `json:"direct"`
	Repository         *repositorySnapshotInput `json:"repository,omitempty"`
	Scorecard          *scorecardSnapshotInput  `json:"scorecard,omitempty"`
	HistoricalFeatures map[string]float64       `json:"historical_features,omitempty"`
}

type repositorySnapshotInput struct {
	FullName                 string   `json:"full_name"`
	URL                      string   `json:"url"`
	DefaultBranch            string   `json:"default_branch"`
	Archived                 bool     `json:"archived"`
	Stars                    int      `json:"stars"`
	Forks                    int      `json:"forks"`
	OpenIssues               int      `json:"open_issues"`
	LastPushAgeDays          *int     `json:"last_push_age_days,omitempty"`
	LastReleaseAgeDays       *int     `json:"last_release_age_days,omitempty"`
	ReleaseCadenceDays       *int     `json:"release_cadence_days,omitempty"`
	RecentContributors90d    *int     `json:"recent_contributors_90d,omitempty"`
	ContributorConcentration *float64 `json:"contributor_concentration,omitempty"`
	OpenIssueGrowth90d       *float64 `json:"open_issue_growth_90d,omitempty"`
	PRResponseMedianDays     *float64 `json:"pr_response_median_days,omitempty"`
}

type scorecardSnapshotInput struct {
	Score  float64               `json:"score"`
	Checks []scorecardCheckInput `json:"checks"`
}

type scorecardCheckInput struct {
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}

type scoreResponse struct {
	Results []scoreResult `json:"results"`
}

type standardizationInput struct {
	Means  []float64 `json:"means"`
	Scales []float64 `json:"scales"`
}

type modelArtifactInput struct {
	ModelName          string                    `json:"model_name"`
	ModelVersion       string                    `json:"model_version"`
	FeatureVersion     string                    `json:"feature_version"`
	TrainedAt          string                    `json:"trained_at"`
	Threshold          float64                   `json:"threshold"`
	Algorithm          string                    `json:"algorithm,omitempty"`
	FeatureNames       []string                  `json:"feature_names"`
	Coefficients       []float64                 `json:"coefficients,omitempty"`
	Intercept          float64                   `json:"intercept,omitempty"`
	Standardization    standardizationInput      `json:"standardization,omitempty"`
	BoosterJSON        string                    `json:"booster_json,omitempty"`
	TreeCount          int                       `json:"tree_count,omitempty"`
	MaxDepth           int                       `json:"max_depth,omitempty"`
	LearningRate       float64                   `json:"learning_rate,omitempty"`
	Objective          string                    `json:"objective,omitempty"`
	XGBoostVersion     string                    `json:"xgboost_version,omitempty"`
	FeatureImportances []featureImportanceOutput `json:"feature_importances,omitempty"`
	CalibrationBins    []calibrationBinOutput    `json:"calibration_bins"`
}

type featureImportanceOutput struct {
	Feature    string  `json:"feature"`
	Gain       float64 `json:"gain"`
	Importance float64 `json:"importance"`
}

type calibrationBinOutput struct {
	LowerBound        float64 `json:"lower_bound"`
	UpperBound        float64 `json:"upper_bound"`
	Count             int     `json:"count"`
	AveragePrediction float64 `json:"average_prediction"`
	EmpiricalRate     float64 `json:"empirical_rate"`
}

type scoreResult struct {
	DependencyID string `json:"dependency_id"`
	RiskProfile  struct {
		InactivityRiskScore        float64  `json:"inactivity_risk_score"`
		MaintenanceOutlook12MScore float64  `json:"maintenance_outlook_12m_score"`
		SecurityPostureScore       float64  `json:"security_posture_score"`
		ConfidenceScore            float64  `json:"confidence_score"`
		RiskBucket                 string   `json:"risk_bucket"`
		ActionLevel                string   `json:"action_level"`
		Caveats                    []string `json:"caveats"`
		MissingSignals             []string `json:"missing_signals"`
		ExplanationFactors         []struct {
			Label     string  `json:"label"`
			Direction string  `json:"direction"`
			Weight    float64 `json:"weight"`
			Detail    string  `json:"detail"`
		} `json:"explanation_factors"`
		Evidence []struct {
			Source        string `json:"source"`
			Signal        string `json:"signal"`
			Value         string `json:"value"`
			ObservedAt    string `json:"observed_at"`
			ProvenanceURL string `json:"provenance_url"`
		} `json:"evidence"`
	} `json:"risk_profile"`
}

func (c *Client) Ready(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/ready", nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		return fmt.Errorf("scoring readiness failed: %s", strings.TrimSpace(string(body)))
	}
	return nil
}

func (c *Client) ScoreModel(
	ctx context.Context,
	analysisID string,
	dependencies []analysis.DependencyRecord,
	artifact analysis.TrainingRunModelArtifact,
) (map[string]analysis.RiskProfile, error) {
	payload := scoreRequest{
		AnalysisID:   analysisID,
		Dependencies: make([]dependencySignalInput, 0, len(dependencies)),
		ModelArtifact: &modelArtifactInput{
			ModelName:      artifact.ModelName,
			ModelVersion:   artifact.ModelVersion,
			FeatureVersion: artifact.FeatureVersion,
			TrainedAt:      artifact.TrainedAt,
			Threshold:      artifact.Threshold,
			Algorithm:      artifact.Algorithm,
			FeatureNames:   append([]string(nil), artifact.FeatureNames...),
			Coefficients:   append([]float64(nil), artifact.Coefficients...),
			Intercept:      artifact.Intercept,
			Standardization: standardizationInput{
				Means:  append([]float64(nil), artifact.Standardization.Means...),
				Scales: append([]float64(nil), artifact.Standardization.Scales...),
			},
			BoosterJSON:        artifact.BoosterJSON,
			TreeCount:          artifact.TreeCount,
			MaxDepth:           artifact.MaxDepth,
			LearningRate:       artifact.LearningRate,
			Objective:          artifact.Objective,
			XGBoostVersion:     artifact.XGBoostVersion,
			FeatureImportances: toFeatureImportanceOutputs(artifact.FeatureImportances),
			CalibrationBins:    toCalibrationBinOutputs(artifact.CalibrationBins),
		},
	}
	for _, dependency := range dependencies {
		payload.Dependencies = append(payload.Dependencies, toDependencySignal(dependency))
	}
	return c.score(ctx, "/score/model", payload)
}

func (c *Client) score(ctx context.Context, path string, payload scoreRequest) (map[string]analysis.RiskProfile, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		return nil, fmt.Errorf("scoring request failed: %s", strings.TrimSpace(string(body)))
	}

	var decoded scoreResponse
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return nil, err
	}

	results := make(map[string]analysis.RiskProfile, len(decoded.Results))
	for _, result := range decoded.Results {
		evidence := make([]analysis.EvidenceItem, 0, len(result.RiskProfile.Evidence))
		for _, item := range result.RiskProfile.Evidence {
			observedAt, _ := time.Parse(time.RFC3339Nano, item.ObservedAt)
			evidence = append(evidence, analysis.EvidenceItem{
				Source:        item.Source,
				Signal:        item.Signal,
				Value:         item.Value,
				ObservedAt:    observedAt,
				ProvenanceURL: item.ProvenanceURL,
			})
		}

		factors := make([]analysis.ExplanationFactor, 0, len(result.RiskProfile.ExplanationFactors))
		for _, item := range result.RiskProfile.ExplanationFactors {
			factors = append(factors, analysis.ExplanationFactor{
				Label:     item.Label,
				Direction: item.Direction,
				Weight:    item.Weight,
				Detail:    item.Detail,
			})
		}

		results[result.DependencyID] = analysis.RiskProfile{
			InactivityRiskScore:        result.RiskProfile.InactivityRiskScore,
			MaintenanceOutlook12MScore: result.RiskProfile.MaintenanceOutlook12MScore,
			SecurityPostureScore:       result.RiskProfile.SecurityPostureScore,
			ConfidenceScore:            result.RiskProfile.ConfidenceScore,
			RiskBucket:                 analysis.RiskBucket(result.RiskProfile.RiskBucket),
			ActionLevel:                analysis.ActionLevel(result.RiskProfile.ActionLevel),
			Caveats:                    result.RiskProfile.Caveats,
			MissingSignals:             result.RiskProfile.MissingSignals,
			ExplanationFactors:         factors,
			Evidence:                   evidence,
		}
	}

	return results, nil
}

func toCalibrationBinOutputs(bins []analysis.TrainingCalibrationBin) []calibrationBinOutput {
	outputs := make([]calibrationBinOutput, 0, len(bins))
	for _, bin := range bins {
		outputs = append(outputs, calibrationBinOutput{
			LowerBound:        bin.LowerBound,
			UpperBound:        bin.UpperBound,
			Count:             bin.Count,
			AveragePrediction: bin.AveragePrediction,
			EmpiricalRate:     bin.EmpiricalRate,
		})
	}
	return outputs
}

func toFeatureImportanceOutputs(importances []analysis.TrainingRunFeatureImportance) []featureImportanceOutput {
	outputs := make([]featureImportanceOutput, 0, len(importances))
	for _, importance := range importances {
		outputs = append(outputs, featureImportanceOutput{
			Feature:    importance.Feature,
			Gain:       importance.Gain,
			Importance: importance.Importance,
		})
	}
	return outputs
}

func toDependencySignal(dependency analysis.DependencyRecord) dependencySignalInput {
	input := dependencySignalInput{
		DependencyID:   dependency.ID,
		PackageName:    dependency.PackageName,
		PackageVersion: dependency.PackageVersion,
		Ecosystem:      dependency.Ecosystem,
		Direct:         dependency.Direct,
	}

	if dependency.Repository != nil {
		var lastPushAgeDays *int
		if !dependency.Repository.LastPushAt.IsZero() || dependency.Repository.LastPushAgeDays > 0 {
			value := dependency.Repository.LastPushAgeDays
			lastPushAgeDays = &value
		}
		input.Repository = &repositorySnapshotInput{
			FullName:                 dependency.Repository.FullName,
			URL:                      dependency.Repository.URL,
			DefaultBranch:            dependency.Repository.DefaultBranch,
			Archived:                 dependency.Repository.Archived,
			Stars:                    dependency.Repository.Stars,
			Forks:                    dependency.Repository.Forks,
			OpenIssues:               dependency.Repository.OpenIssues,
			LastPushAgeDays:          lastPushAgeDays,
			LastReleaseAgeDays:       dependency.Repository.LastReleaseAgeDays,
			ReleaseCadenceDays:       dependency.Repository.ReleaseCadenceDays,
			RecentContributors90d:    dependency.Repository.RecentContributors90d,
			ContributorConcentration: dependency.Repository.ContributorConcentration,
			OpenIssueGrowth90d:       dependency.Repository.OpenIssueGrowth90d,
			PRResponseMedianDays:     dependency.Repository.PullRequestMedianResponseDays,
		}
	}

	if dependency.Scorecard != nil {
		normalizedScorecard := analysis.NormalizeScorecardSnapshot(dependency.Scorecard)
		checks := make([]scorecardCheckInput, 0, len(normalizedScorecard.Checks))
		for _, check := range normalizedScorecard.Checks {
			checks = append(checks, scorecardCheckInput{Name: check.Name, Score: check.Score, Reason: check.Reason})
		}
		input.Scorecard = &scorecardSnapshotInput{Score: normalizedScorecard.Score, Checks: checks}
	}
	if len(dependency.HistoricalFeatures) > 0 {
		input.HistoricalFeatures = make(map[string]float64, len(dependency.HistoricalFeatures))
		for key, value := range dependency.HistoricalFeatures {
			input.HistoricalFeatures[key] = value
		}
	}

	return input
}
