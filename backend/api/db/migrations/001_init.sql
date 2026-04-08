CREATE TABLE IF NOT EXISTS uploaded_artifacts (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    content BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    submission_kind TEXT NOT NULL,
    repository_url TEXT,
    artifact_name TEXT,
    upload_id TEXT REFERENCES uploaded_artifacts(id) ON DELETE SET NULL,
    methodology_version TEXT NOT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    next_run_at TIMESTAMPTZ,
    leased_until TIMESTAMPTZ,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_runnable_idx ON jobs (status, next_run_at, created_at);

CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    package_name TEXT NOT NULL,
    package_version TEXT NOT NULL,
    ecosystem TEXT NOT NULL,
    direct BOOLEAN NOT NULL DEFAULT FALSE,
    dependency_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    repository_json JSONB,
    scorecard_json JSONB,
    risk_profile_json JSONB,
    raw_signals_available BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dependencies_analysis_idx ON dependencies (analysis_id, package_name);

CREATE TABLE IF NOT EXISTS dependency_edges (
    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    PRIMARY KEY (analysis_id, from_node, to_node)
);

CREATE TABLE IF NOT EXISTS explanation_factors (
    id TEXT PRIMARY KEY,
    dependency_id TEXT NOT NULL REFERENCES dependencies(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    direction TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL,
    detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_items (
    id TEXT PRIMARY KEY,
    dependency_id TEXT NOT NULL REFERENCES dependencies(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    signal TEXT NOT NULL,
    value TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    provenance_url TEXT
);
