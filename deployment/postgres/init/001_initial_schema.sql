CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    repository_url TEXT,
    artifact_name TEXT,
    upload_id TEXT,
    include_transitive_dependencies BOOLEAN NOT NULL DEFAULT TRUE,
    demo_profile TEXT,
    status TEXT NOT NULL,
    methodology_version TEXT NOT NULL,
    latest_job_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS uploaded_artifacts (
    id TEXT PRIMARY KEY,
    analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_hint TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    parse_error TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    ecosystem TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_version TEXT NOT NULL,
    direct BOOLEAN NOT NULL DEFAULT TRUE,
    dependency_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    repository_snapshot JSONB,
    scorecard_snapshot JSONB,
    risk_profile JSONB,
    raw_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_signals_available BOOLEAN NOT NULL DEFAULT FALSE,
    parsed_from_upload_id TEXT REFERENCES uploaded_artifacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dependency_edges (
    id BIGSERIAL PRIMARY KEY,
    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    edge_from TEXT NOT NULL,
    edge_to TEXT NOT NULL,
    kind TEXT NOT NULL
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
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_runnable ON jobs (status, next_run_at, created_at);
CREATE INDEX IF NOT EXISTS idx_dependencies_analysis ON dependencies (analysis_id, direct, package_name);
CREATE INDEX IF NOT EXISTS idx_uploads_analysis ON uploaded_artifacts (analysis_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_edges_analysis ON dependency_edges (analysis_id, id);
