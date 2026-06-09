package storage

import (
	"strings"
	"testing"
)

func TestPostgresSchemaCompatibilitySQLAddsHistoricalFeaturesIdempotently(t *testing.T) {
	statement := strings.ToLower(postgresSchemaCompatibilitySQL)

	for _, fragment := range []string{
		"alter table dependencies",
		"add column if not exists historical_features",
		"jsonb",
		"default '{}'::jsonb",
	} {
		if !strings.Contains(statement, fragment) {
			t.Fatalf("expected schema compatibility SQL to contain %q, got %s", fragment, postgresSchemaCompatibilitySQL)
		}
	}
}
