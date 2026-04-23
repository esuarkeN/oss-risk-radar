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

type trainModelRequest struct {
	ModelName string                            `json:"model_name"`
	Snapshots []analysis.TrainingSnapshotRecord `json:"snapshots"`
}

type dependencySignalInput struct {
	DependencyID   string                   `json:"dependency_id"`
	PackageName    string                   `json:"package_name"`
	PackageVersion string                   `json:"package_version"`
	Ecosystem      string                   `json:"ecosystem"`
	Direct         bool                     `json:"direct"`
	Repository     *repositorySnapshotInput `json:"repository,omitempty"`
	Scorecard      *scorecardSnapshotInput  `json:"scorecard,omitempty"`
}

type repositorySnapshotInput struct {
	FullName                 string   `json:"full_name"`
	URL                      string   `json:"url"`
	DefaultBranch            string   `json:"default_branch"`
	Archived                 bool     `json:"archived"`
	Stars                    int      `json:"stars"`
	Forks                    int      `json:"forks"`
	OpenIssues               int      `json:"open_issues"`
	LastPushAgeDays          int      `json:"last_push_age_days"`
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
	ModelName       string                 `json:"model_name"`
	ModelVersion    string                 `json:"model_version"`
	FeatureVersion  string                 `json:"feature_version"`
	TrainedAt       string                 `json:"trained_at"`
	Threshold       float64                `json:"threshold"`
	FeatureNames    []string               `json:"feature_names"`
	Coefficients    []float64              `json:"coefficients"`
	Intercept       float64                `json:"intercept"`
	Standardization standardizationInput   `json:"standardization"`
	CalibrationBins []calibrationBinOutput `json:"calibration_bins"`
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

type trainModelResponse struct {
	Status         string `json:"status"`
	ModelName      string `json:"model_name"`
	ModelVersion   string `json:"model_version"`
	TrainedAt      string `json:"trained_at"`
	DatasetSummary *struct {
		TotalRows          int      `json:"total_rows"`
		LabeledRows        int      `json:"labeled_rows"`
		UnlabeledRows      int      `json:"unlabeled_rows"`
		EarliestObservedAt *string  `json:"earliest_observed_at"`
		LatestObservedAt   *string  `json:"latest_observed_at"`
		FeatureNames       []string `json:"feature_names"`
	} `json:"dataset_summary"`
	SplitSummary *struct {
		TrainRows      int `json:"train_rows"`
		ValidationRows int `json:"validation_rows"`
		TestRows       int `json:"test_rows"`
	} `json:"split_summary"`
	Metrics *struct {
		Threshold    float64 `json:"threshold"`
		SampleCount  int     `json:"sample_count"`
		PositiveRate float64 `json:"positive_rate"`
		Accuracy     float64 `json:"accuracy"`
		Precision    float64 `json:"precision"`
		Recall       float64 `json:"recall"`
		F1Score      float64 `json:"f1_score"`
		BrierScore   float64 `json:"brier_score"`
		LogLoss      float64 `json:"log_loss"`
		RocAuc       float64 `json:"roc_auc"`
	} `json:"metrics"`
	CalibrationBins []calibrationBinOutput `json:"calibration_bins"`
	Artifact        *struct {
		ModelName       string                 `json:"model_name"`
		ModelVersion    string                 `json:"model_version"`
		FeatureVersion  string                 `json:"feature_version"`
		TrainedAt       string                 `json:"trained_at"`
		Threshold       float64                `json:"threshold"`
		FeatureNames    []string               `json:"feature_names"`
		Coefficients    []float64              `json:"coefficients"`
		Intercept       float64                `json:"intercept"`
		Standardization standardizationInput   `json:"standardization"`
		CalibrationBins []calibrationBinOutput `json:"calibration_bins"`
	} `json:"artifact"`
	Message string `json:"message"`
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

func (c *Client) Score(ctx context.Context, analysisID string, dependencies []analysis.DependencyRecord) (map[string]analysis.RiskProfile, error) {
	payload := scoreRequest{AnalysisID: analysisID, Dependencies: make([]dependencySignalInput, 0, len(dependencies))}
	for _, dependency := range dependencies {
		payload.Dependencies = append(payload.Dependencies, toDependencySignal(dependency))
	}
	return c.score(ctx, "/score/heuristic", payload)
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
			FeatureNames:   append([]string(nil), artifact.FeatureNames...),
			Coefficients:   append([]float64(nil), artifact.Coefficients...),
			Intercept:      artifact.Intercept,
			Standardization: standardizationInput{
				Means:  append([]float64(nil), artifact.Standardization.Means...),
				Scales: append([]float64(nil), artifact.Standardization.Scales...),
			},
			CalibrationBins: toCalibrationBinOutputs(artifact.CalibrationBins),
		},
	}
	for _, dependency := range dependencies {
		payload.Dependencies = append(payload.Dependencies, toDependencySignal(dependency))
	}
	return c.score(ctx, "/score/model", payload)
}

func (c *Client) TrainModel(ctx context.Context, snapshots []analysis.TrainingSnapshotRecord) (analysis.TrainingRunArtifact, error) {
	payload := trainModelRequest{ModelName: "logistic-regression-baseline", Snapshots: snapshots}
	body, err := json.Marshal(payload)
	if err != nil {
		return analysis.TrainingRunArtifact{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/models/train", bytes.NewReader(body))
	if err != nil {
		return analysis.TrainingRunArtifact{}, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return analysis.TrainingRunArtifact{}, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		return analysis.TrainingRunArtifact{}, fmt.Errorf("training request failed: %s", strings.TrimSpace(string(body)))
	}

	var decoded trainModelResponse
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return analysis.TrainingRunArtifact{}, err
	}

	run := analysis.TrainingRunArtifact{
		Status:          decoded.Status,
		ModelName:       decoded.ModelName,
		ModelVersion:    decoded.ModelVersion,
		TrainedAt:       decoded.TrainedAt,
		CalibrationBins: toTrainingCalibrationBins(decoded.CalibrationBins),
		Message:         decoded.Message,
	}
	if decoded.DatasetSummary != nil {
		run.DatasetSummary = &analysis.TrainingRunDatasetSummary{
			TotalRows:          decoded.DatasetSummary.TotalRows,
			LabeledRows:        decoded.DatasetSummary.LabeledRows,
			UnlabeledRows:      decoded.DatasetSummary.UnlabeledRows,
			EarliestObservedAt: decoded.DatasetSummary.EarliestObservedAt,
			LatestObservedAt:   decoded.DatasetSummary.LatestObservedAt,
			FeatureNames:       decoded.DatasetSummary.FeatureNames,
		}
	}
	if decoded.SplitSummary != nil {
		run.SplitSummary = &analysis.TrainingRunSplitSummary{
			TrainRows:      decoded.SplitSummary.TrainRows,
			ValidationRows: decoded.SplitSummary.ValidationRows,
			TestRows:       decoded.SplitSummary.TestRows,
		}
	}
	if decoded.Metrics != nil {
		run.Metrics = &analysis.TrainingRunMetrics{
			Threshold:    decoded.Metrics.Threshold,
			SampleCount:  decoded.Metrics.SampleCount,
			PositiveRate: decoded.Metrics.PositiveRate,
			Accuracy:     decoded.Metrics.Accuracy,
			Precision:    decoded.Metrics.Precision,
			Recall:       decoded.Metrics.Recall,
			F1Score:      decoded.Metrics.F1Score,
			BrierScore:   decoded.Metrics.BrierScore,
			LogLoss:      decoded.Metrics.LogLoss,
			RocAuc:       decoded.Metrics.RocAuc,
		}
	}
	if decoded.Artifact != nil {
		run.ModelArtifact = &analysis.TrainingRunModelArtifact{
			ModelName:      decoded.Artifact.ModelName,
			ModelVersion:   decoded.Artifact.ModelVersion,
			FeatureVersion: decoded.Artifact.FeatureVersion,
			TrainedAt:      decoded.Artifact.TrainedAt,
			Threshold:      decoded.Artifact.Threshold,
			FeatureNames:   append([]string(nil), decoded.Artifact.FeatureNames...),
			Coefficients:   append([]float64(nil), decoded.Artifact.Coefficients...),
			Intercept:      decoded.Artifact.Intercept,
			Standardization: analysis.TrainingRunStandardizationProfile{
				Means:  append([]float64(nil), decoded.Artifact.Standardization.Means...),
				Scales: append([]float64(nil), decoded.Artifact.Standardization.Scales...),
			},
			CalibrationBins: toTrainingCalibrationBins(decoded.Artifact.CalibrationBins),
		}
	}

	return run, nil
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

func toTrainingCalibrationBins(bins []calibrationBinOutput) []analysis.TrainingCalibrationBin {
	outputs := make([]analysis.TrainingCalibrationBin, 0, len(bins))
	for _, bin := range bins {
		outputs = append(outputs, analysis.TrainingCalibrationBin{
			LowerBound:        bin.LowerBound,
			UpperBound:        bin.UpperBound,
			Count:             bin.Count,
			AveragePrediction: bin.AveragePrediction,
			EmpiricalRate:     bin.EmpiricalRate,
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
		input.Repository = &repositorySnapshotInput{
			FullName:                 dependency.Repository.FullName,
			URL:                      dependency.Repository.URL,
			DefaultBranch:            dependency.Repository.DefaultBranch,
			Archived:                 dependency.Repository.Archived,
			Stars:                    dependency.Repository.Stars,
			Forks:                    dependency.Repository.Forks,
			OpenIssues:               dependency.Repository.OpenIssues,
			LastPushAgeDays:          dependency.Repository.LastPushAgeDays,
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

	return input
}
