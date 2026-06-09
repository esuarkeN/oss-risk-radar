package analysis

import (
	"fmt"
	"sort"
	"strings"
)

type modelScoreSet struct {
	run    TrainingRunArtifact
	scores map[string]RiskProfile
}

func modelArtifactFeatureRegime(run TrainingRunArtifact) string {
	if run.ModelArtifact == nil {
		return featureRegimeFullHistory
	}
	switch run.ModelArtifact.FeatureVersion {
	case "feature-set-v3-cold-start":
		return featureRegimeColdStart
	case "feature-set-v3-full-history":
		return featureRegimeFullHistory
	}
	if strings.Contains(run.ModelName, "cold-start") {
		return featureRegimeColdStart
	}
	return featureRegimeFullHistory
}

func filterModelArtifactsByFeatureRegime(runs []TrainingRunArtifact, featureRegime string) []TrainingRunArtifact {
	filtered := make([]TrainingRunArtifact, 0, len(runs))
	for _, run := range runs {
		if modelArtifactFeatureRegime(run) == featureRegime {
			filtered = append(filtered, run)
		}
	}
	return filtered
}

func latestModelArtifactsForScoring(runs []TrainingRunArtifact, requestedModelName string) []TrainingRunArtifact {
	requestedModels := requestedTrainingModelNames(requestedModelName, "all")
	requested := map[string]bool{}
	for _, modelName := range requestedModels {
		requested[modelName] = true
	}

	latestDatasetHash := ""
	for index := len(runs) - 1; index >= 0; index-- {
		run := runs[index]
		if run.Status == "completed" && run.ModelArtifact != nil && run.DatasetHash != "" {
			latestDatasetHash = run.DatasetHash
			break
		}
	}

	byModel := map[string]TrainingRunArtifact{}
	for index := len(runs) - 1; index >= 0; index-- {
		run := runs[index]
		if run.Status != "completed" || run.ModelArtifact == nil {
			continue
		}
		if latestDatasetHash != "" && run.DatasetHash != latestDatasetHash {
			continue
		}
		if !requested[run.ModelName] {
			continue
		}
		if _, exists := byModel[run.ModelName]; !exists {
			byModel[run.ModelName] = run
		}
	}

	selected := make([]TrainingRunArtifact, 0, len(byModel))
	for _, modelName := range requestedModels {
		if run, ok := byModel[modelName]; ok {
			selected = append(selected, run)
		}
	}
	return selected
}

func combineModelScoreSets(dependencies []DependencyRecord, scoreSets []modelScoreSet, failedModels []string) (map[string]RiskProfile, error) {
	if len(scoreSets) == 0 {
		return nil, fmt.Errorf("no model score sets were available")
	}
	if len(scoreSets) == 1 {
		run := scoreSets[0].run
		scores := scoreSets[0].scores
		for dependencyID, profile := range scores {
			profile.ModelResults = []ModelRiskProfile{modelRiskProfileFrom(run, profile)}
			if len(failedModels) > 0 {
				profile.Caveats = uniqueStrings(append(profile.Caveats, "Some model scorers failed: "+strings.Join(failedModels, ", ")))
			}
			scores[dependencyID] = profile
		}
		return scores, nil
	}

	results := make(map[string]RiskProfile, len(dependencies))
	modelNames := make([]string, 0, len(scoreSets))
	for _, scoreSet := range scoreSets {
		modelNames = append(modelNames, scoreSet.run.ModelName)
	}

	for _, dependency := range dependencies {
		modelProfiles := make([]RiskProfile, 0, len(scoreSets))
		modelResults := make([]ModelRiskProfile, 0, len(scoreSets))
		for _, scoreSet := range scoreSets {
			profile, ok := scoreSet.scores[dependency.ID]
			if !ok {
				continue
			}
			modelProfiles = append(modelProfiles, profile)
			modelResults = append(modelResults, modelRiskProfileFrom(scoreSet.run, profile))
		}
		if len(modelProfiles) == 0 {
			return nil, fmt.Errorf("all model scorers omitted dependency %s", dependency.ID)
		}

		results[dependency.ID] = ensembleRiskProfile(modelProfiles, modelResults, modelNames, failedModels)
	}
	return results, nil
}

func ensembleRiskProfile(
	modelProfiles []RiskProfile,
	modelResults []ModelRiskProfile,
	modelNames []string,
	failedModels []string,
) RiskProfile {
	inactivityRiskScore := averageRiskValue(modelProfiles, func(profile RiskProfile) float64 { return profile.InactivityRiskScore })
	maintenanceOutlookScore := averageRiskValue(modelProfiles, func(profile RiskProfile) float64 { return profile.MaintenanceOutlook12MScore })
	securityPostureScore := averageRiskValue(modelProfiles, func(profile RiskProfile) float64 { return profile.SecurityPostureScore })
	confidenceScore := averageRiskValue(modelProfiles, func(profile RiskProfile) float64 { return profile.ConfidenceScore })

	caveats := []string{fmt.Sprintf("Multi-model score averages %s.", strings.Join(modelNames, ", "))}
	for _, profile := range modelProfiles {
		caveats = append(caveats, profile.Caveats...)
	}
	if len(failedModels) > 0 {
		caveats = append(caveats, "Some model scorers failed: "+strings.Join(failedModels, ", "))
	}

	missingSignals := []string{}
	evidence := []EvidenceItem{}
	explanationFactors := []ExplanationFactor{
		modelAgreementFactor(modelResults),
	}
	for _, profile := range modelProfiles {
		missingSignals = append(missingSignals, profile.MissingSignals...)
		if len(evidence) == 0 && len(profile.Evidence) > 0 {
			evidence = profile.Evidence
		}
		explanationFactors = append(explanationFactors, profile.ExplanationFactors...)
	}

	sort.SliceStable(explanationFactors, func(i, j int) bool {
		return explanationFactors[i].Weight > explanationFactors[j].Weight
	})
	explanationFactors = uniqueExplanationFactors(explanationFactors)
	if len(explanationFactors) > 6 {
		explanationFactors = explanationFactors[:6]
	}

	return RiskProfile{
		InactivityRiskScore:        roundRiskValue(inactivityRiskScore),
		MaintenanceOutlook12MScore: roundRiskValue(maintenanceOutlookScore),
		SecurityPostureScore:       roundRiskValue(securityPostureScore),
		ConfidenceScore:            roundRiskValue(confidenceScore),
		RiskBucket:                 riskBucketForScore(inactivityRiskScore),
		ActionLevel:                actionLevelForScore(inactivityRiskScore),
		ScoringMethod:              "model_ensemble",
		ScoringModel:               strings.Join(modelNames, "+"),
		ModelResults:               modelResults,
		Caveats:                    uniqueStrings(caveats),
		MissingSignals:             uniqueStrings(missingSignals),
		ExplanationFactors:         explanationFactors,
		Evidence:                   evidence,
	}
}

func modelRiskProfileFrom(run TrainingRunArtifact, profile RiskProfile) ModelRiskProfile {
	algorithm := ""
	if run.ModelArtifact != nil {
		algorithm = run.ModelArtifact.Algorithm
	}
	var (
		sampleCount              int
		rocAuc                   *float64
		brierScore               *float64
		expectedCalibrationError *float64
		qualityScore             *float64
	)
	if run.Metrics != nil {
		sampleCount = run.Metrics.SampleCount
		rocAuc = float64Ptr(run.Metrics.RocAuc)
		brierScore = float64Ptr(run.Metrics.BrierScore)
		expectedCalibrationError = cloneFloat64(run.Metrics.ExpectedCalibrationError)
		qualityScore = float64Ptr(run.Metrics.QualityScore)
	}
	return ModelRiskProfile{
		ModelName:                  run.ModelName,
		ModelVersion:               run.ModelVersion,
		Algorithm:                  algorithm,
		TrainedAt:                  run.TrainedAt,
		SampleCount:                sampleCount,
		RocAuc:                     rocAuc,
		BrierScore:                 brierScore,
		ExpectedCalibrationError:   expectedCalibrationError,
		QualityScore:               qualityScore,
		InactivityRiskScore:        profile.InactivityRiskScore,
		MaintenanceOutlook12MScore: profile.MaintenanceOutlook12MScore,
		SecurityPostureScore:       profile.SecurityPostureScore,
		ConfidenceScore:            profile.ConfidenceScore,
		RiskBucket:                 profile.RiskBucket,
		ActionLevel:                profile.ActionLevel,
	}
}

func modelAgreementFactor(modelResults []ModelRiskProfile) ExplanationFactor {
	if len(modelResults) == 0 {
		return explanationFactor("Model ensemble", "neutral", 0, "No model outputs were available for comparison.")
	}
	minimum := modelResults[0].InactivityRiskScore
	maximum := modelResults[0].InactivityRiskScore
	for _, result := range modelResults[1:] {
		if result.InactivityRiskScore < minimum {
			minimum = result.InactivityRiskScore
		}
		if result.InactivityRiskScore > maximum {
			maximum = result.InactivityRiskScore
		}
	}
	spread := maximum - minimum
	direction := "neutral"
	if spread >= 20 {
		direction = "increase"
	}
	return explanationFactor(
		"Model agreement",
		direction,
		roundRiskValue(18+spread/2),
		fmt.Sprintf("%d model outputs were compared; inactivity risk ranged from %.1f%% to %.1f%%.", len(modelResults), minimum, maximum),
	)
}

func averageRiskValue(profiles []RiskProfile, selector func(RiskProfile) float64) float64 {
	if len(profiles) == 0 {
		return 0
	}
	total := 0.0
	for _, profile := range profiles {
		total += selector(profile)
	}
	return total / float64(len(profiles))
}

func roundRiskValue(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}

func float64Ptr(value float64) *float64 {
	return &value
}

func cloneFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func uniqueExplanationFactors(values []ExplanationFactor) []ExplanationFactor {
	seen := map[string]bool{}
	result := make([]ExplanationFactor, 0, len(values))
	for _, value := range values {
		key := value.Label + "\x00" + value.Detail
		if key == "\x00" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, value)
	}
	return result
}
