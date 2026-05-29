package analysis

import (
	"fmt"
	"sort"
)

const fallbackExpectedSignalCount = 10

func completeRiskProfiles(dependencies []DependencyRecord, scores map[string]RiskProfile, method string, model string) map[string]RiskProfile {
	if scores == nil {
		scores = map[string]RiskProfile{}
	}
	missingScores := fallbackRiskProfiles(dependencies, fmt.Errorf("%s scorer omitted this dependency", method))

	for _, dependency := range dependencies {
		profile, ok := scores[dependency.ID]
		if !ok {
			scores[dependency.ID] = missingScores[dependency.ID]
			continue
		}
		if profile.ScoringMethod == "" {
			profile.ScoringMethod = method
		}
		if profile.ScoringModel == "" {
			profile.ScoringModel = model
		}
		scores[dependency.ID] = profile
	}
	return scores
}

func fallbackRiskProfiles(dependencies []DependencyRecord, scoringErr error) map[string]RiskProfile {
	results := make(map[string]RiskProfile, len(dependencies))
	for _, dependency := range dependencies {
		results[dependency.ID] = fallbackRiskProfile(dependency, scoringErr)
	}
	return results
}

func fallbackRiskProfile(dependency DependencyRecord, scoringErr error) RiskProfile {
	risk := 10.0
	securityPosture := 40.0
	availableSignals := 0
	missingSignals := []string{}
	caveats := []string{"External scoring was unavailable, so this row uses an in-process failsafe score."}
	if scoringErr != nil {
		caveats = append(caveats, "Scoring error: "+scoringErr.Error())
	}
	factors := []ExplanationFactor{}

	repository := dependency.Repository
	if repository == nil {
		risk = 55
		missingSignals = []string{
			"repository_mapping",
			"archived",
			"last_push_age_days",
			"last_release_age_days",
			"release_cadence_days",
			"recent_contributors_90d",
			"contributor_concentration",
			"open_issue_growth_90d",
			"pr_response_median_days",
			"scorecard_score",
		}
		factors = append(factors, fallbackFactor("No repository mapping", "increase", 45, "No public source repository was available for this package."))
	} else {
		availableSignals += 2 // repository mapping and archived state
		if repository.Archived {
			risk += 35
			factors = append(factors, fallbackFactor("Archived repository", "increase", 35, "The mapped source repository is archived."))
		} else {
			risk -= 5
			factors = append(factors, fallbackFactor("Repository remains active", "decrease", 5, "The mapped source repository is not archived."))
		}

		if !repository.LastPushAt.IsZero() || repository.LastPushAgeDays > 0 {
			availableSignals++
			switch {
			case repository.LastPushAgeDays > 365:
				risk += 24
				factors = append(factors, fallbackFactor("Aging commits", "increase", 24, "No push activity was observed within the last year."))
			case repository.LastPushAgeDays > 180:
				risk += 14
				factors = append(factors, fallbackFactor("Slowing commit activity", "increase", 14, "Recent push activity is older than six months."))
			case repository.LastPushAgeDays <= 30:
				risk -= 8
				factors = append(factors, fallbackFactor("Recent push activity", "decrease", 8, "Recent push activity was observed within the last month."))
			}
		} else {
			missingSignals = append(missingSignals, "last_push_age_days")
		}

		if repository.LastReleaseAgeDays == nil {
			missingSignals = append(missingSignals, "last_release_age_days")
		} else {
			availableSignals++
			if *repository.LastReleaseAgeDays > 540 {
				risk += 18
				factors = append(factors, fallbackFactor("Stale release history", "increase", 18, "The latest tagged release is older than 18 months."))
			} else if *repository.LastReleaseAgeDays <= 120 {
				risk -= 6
				factors = append(factors, fallbackFactor("Recent releases", "decrease", 6, "A release was published within the last four months."))
			}
		}

		if repository.ReleaseCadenceDays == nil {
			missingSignals = append(missingSignals, "release_cadence_days")
		} else {
			availableSignals++
			if *repository.ReleaseCadenceDays > 240 {
				risk += 10
				factors = append(factors, fallbackFactor("Irregular releases", "increase", 10, "Observed release cadence is slower than eight months."))
			} else if *repository.ReleaseCadenceDays < 60 {
				risk -= 4
				factors = append(factors, fallbackFactor("Frequent releases", "decrease", 4, "Observed release cadence remains active."))
			}
		}

		if repository.RecentContributors90d == nil {
			missingSignals = append(missingSignals, "recent_contributors_90d")
		} else {
			availableSignals++
			if *repository.RecentContributors90d == 0 {
				risk += 16
				factors = append(factors, fallbackFactor("No recent contributors", "increase", 16, "No distinct contributors were observed in the last 90 days."))
			} else if *repository.RecentContributors90d == 1 {
				risk += 9
				factors = append(factors, fallbackFactor("Single recent maintainer", "increase", 9, "Only one recent contributor was observed."))
			} else if *repository.RecentContributors90d >= 4 {
				risk -= 6
				factors = append(factors, fallbackFactor("Contributor depth", "decrease", 6, "Multiple recent contributors reduce concentration risk."))
			}
		}

		if repository.ContributorConcentration == nil {
			missingSignals = append(missingSignals, "contributor_concentration")
		} else {
			availableSignals++
			if *repository.ContributorConcentration > 0.8 {
				risk += 10
				factors = append(factors, fallbackFactor("Contributor concentration", "increase", 10, "A single maintainer appears to dominate recent activity."))
			} else if *repository.ContributorConcentration < 0.45 {
				risk -= 4
				factors = append(factors, fallbackFactor("Distributed contribution", "decrease", 4, "Recent activity is spread across multiple contributors."))
			}
		}

		if repository.OpenIssueGrowth90d == nil {
			missingSignals = append(missingSignals, "open_issue_growth_90d")
		} else {
			availableSignals++
			if *repository.OpenIssueGrowth90d > 0.35 {
				risk += 8
				factors = append(factors, fallbackFactor("Issue backlog growth", "increase", 8, "Open issues are growing faster than they are being resolved."))
			} else if *repository.OpenIssueGrowth90d < 0 {
				risk -= 2
				factors = append(factors, fallbackFactor("Issue backlog improving", "decrease", 2, "Open issue volume is trending down."))
			}
		}

		if repository.PullRequestMedianResponseDays == nil {
			missingSignals = append(missingSignals, "pr_response_median_days")
		} else {
			availableSignals++
			if *repository.PullRequestMedianResponseDays > 30 {
				risk += 7
				factors = append(factors, fallbackFactor("Slow PR responsiveness", "increase", 7, "Median pull request response time is longer than 30 days."))
			} else if *repository.PullRequestMedianResponseDays <= 7 {
				risk -= 3
				factors = append(factors, fallbackFactor("Responsive reviews", "decrease", 3, "Median pull request response time is within one week."))
			}
		}
	}

	if dependency.Scorecard == nil {
		missingSignals = append(missingSignals, "scorecard_score")
		factors = append(factors, fallbackFactor("Security data incomplete", "neutral", 0, "OpenSSF Scorecard data was unavailable."))
	} else {
		availableSignals++
		securityPosture = fallbackClamp(dependency.Scorecard.Score * 10)
		if dependency.Scorecard.Score < 5 {
			risk += 4
			factors = append(factors, fallbackFactor("Weak security practice indicators", "increase", 4, "Scorecard results suggest weaker supply-chain hygiene."))
		} else if dependency.Scorecard.Score >= 8 {
			risk -= 2
			factors = append(factors, fallbackFactor("Positive security practice indicators", "decrease", 2, "Scorecard results suggest stronger public security practices."))
		}
		for _, check := range dependency.Scorecard.Checks {
			if check.Score >= 8 {
				securityPosture += 2
			} else if check.Score <= 4 {
				securityPosture -= 3
			}
		}
		securityPosture = fallbackClamp(securityPosture)
	}

	if len(missingSignals) > 3 {
		caveats = append(caveats, "Several expected public signals were missing, which lowers confidence in the profile.")
	}

	risk = fallbackClamp(risk)
	sort.Slice(factors, func(i, j int) bool {
		return factors[i].Weight > factors[j].Weight
	})
	if len(factors) > 6 {
		factors = factors[:6]
	}

	confidenceScore := float64(availableSignals) / fallbackExpectedSignalCount
	if repository == nil && confidenceScore < 0.15 {
		confidenceScore = 0.15
	}

	return RiskProfile{
		InactivityRiskScore:        risk,
		MaintenanceOutlook12MScore: fallbackClamp(100 - risk),
		SecurityPostureScore:       securityPosture,
		ConfidenceScore:            confidenceScore,
		RiskBucket:                 fallbackBucket(risk),
		ActionLevel:                fallbackActionLevel(risk),
		ScoringMethod:              "failsafe",
		Caveats:                    caveats,
		MissingSignals:             uniqueStrings(missingSignals),
		ExplanationFactors:         factors,
		Evidence:                   []EvidenceItem{},
	}
}

func fallbackFactor(label string, direction string, weight float64, detail string) ExplanationFactor {
	return ExplanationFactor{Label: label, Direction: direction, Weight: weight, Detail: detail}
}

func fallbackClamp(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func fallbackBucket(score float64) RiskBucket {
	if score >= 80 {
		return RiskBucket("critical")
	}
	if score >= 60 {
		return RiskBucket("high")
	}
	if score >= 35 {
		return RiskBucket("medium")
	}
	return RiskBucket("low")
}

func fallbackActionLevel(score float64) ActionLevel {
	if score >= 80 {
		return ActionLevel("replace_candidate")
	}
	if score >= 50 {
		return ActionLevel("review")
	}
	return ActionLevel("monitor")
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
