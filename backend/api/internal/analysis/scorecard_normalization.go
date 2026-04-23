package analysis

func NormalizeScorecardSnapshot(snapshot *ScorecardSnapshot) *ScorecardSnapshot {
	if snapshot == nil {
		return nil
	}

	normalized := &ScorecardSnapshot{
		Score:  snapshot.Score,
		Checks: make([]ScorecardCheck, 0, len(snapshot.Checks)),
	}
	for _, check := range snapshot.Checks {
		if check.Score < 0 || check.Score > 10 {
			continue
		}
		normalized.Checks = append(normalized.Checks, check)
	}

	return normalized
}
