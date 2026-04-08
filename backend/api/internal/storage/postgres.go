package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"oss-risk-radar/backend/api/internal/analysis"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(databaseURL string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &PostgresStore{db: db}, nil
}

func (s *PostgresStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *PostgresStore) Ready(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *PostgresStore) SaveUpload(ctx context.Context, upload analysis.UploadArtifact) error {
	_, err := s.db.ExecContext(ctx, `
        INSERT INTO uploaded_artifacts (id, analysis_id, file_name, content_type, size_bytes, storage_hint, status, parse_error, uploaded_at)
        VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, NULLIF($8, ''), $9)
        ON CONFLICT (id) DO UPDATE SET
            analysis_id = EXCLUDED.analysis_id,
            file_name = EXCLUDED.file_name,
            content_type = EXCLUDED.content_type,
            size_bytes = EXCLUDED.size_bytes,
            storage_hint = EXCLUDED.storage_hint,
            status = EXCLUDED.status,
            parse_error = EXCLUDED.parse_error,
            uploaded_at = EXCLUDED.uploaded_at`,
		upload.ID, upload.AnalysisID, upload.FileName, upload.ContentType, upload.SizeBytes, upload.StorageHint, upload.Status, upload.ParseError, upload.UploadedAt,
	)
	return err
}

func (s *PostgresStore) UpdateUpload(ctx context.Context, upload analysis.UploadArtifact) error {
	result, err := s.db.ExecContext(ctx, `
        UPDATE uploaded_artifacts
        SET analysis_id = NULLIF($2, ''), file_name = $3, content_type = $4, size_bytes = $5, storage_hint = $6, status = $7, parse_error = NULLIF($8, ''), uploaded_at = $9
        WHERE id = $1`,
		upload.ID, upload.AnalysisID, upload.FileName, upload.ContentType, upload.SizeBytes, upload.StorageHint, upload.Status, upload.ParseError, upload.UploadedAt,
	)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return analysis.ErrNotFound
	}
	return nil
}

func (s *PostgresStore) GetUpload(ctx context.Context, id string) (analysis.UploadArtifact, error) {
	row := s.db.QueryRowContext(ctx, `
        SELECT id, COALESCE(analysis_id, ''), file_name, COALESCE(content_type, ''), COALESCE(size_bytes, 0), COALESCE(storage_hint, ''), status, COALESCE(parse_error, ''), uploaded_at
        FROM uploaded_artifacts
        WHERE id = $1`, id)

	var upload analysis.UploadArtifact
	if err := row.Scan(&upload.ID, &upload.AnalysisID, &upload.FileName, &upload.ContentType, &upload.SizeBytes, &upload.StorageHint, &upload.Status, &upload.ParseError, &upload.UploadedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return analysis.UploadArtifact{}, analysis.ErrNotFound
		}
		return analysis.UploadArtifact{}, err
	}
	return upload, nil
}

func (s *PostgresStore) CreateAnalysisJob(ctx context.Context, item analysis.AnalysisRecord, job analysis.JobRecord) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
        INSERT INTO analyses (
            id, source_kind, repository_url, artifact_name, upload_id, include_transitive_dependencies, demo_profile, status, methodology_version, latest_job_id, created_at, updated_at
        ) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6,NULLIF($7,''),$8,$9,$10,$11,$12)`,
		item.ID,
		item.Submission.Kind,
		item.Submission.RepositoryURL,
		item.Submission.ArtifactName,
		item.Submission.UploadID,
		item.Submission.IncludeTransitiveDependencies,
		item.Submission.DemoProfile,
		item.Status,
		item.MethodologyVersion,
		job.ID,
		item.CreatedAt,
		item.UpdatedAt,
	)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
        INSERT INTO jobs (id, analysis_id, job_type, status, attempts, max_attempts, last_error, next_run_at, message, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10,$11)`,
		job.ID, job.AnalysisID, job.Type, job.Status, job.Attempts, job.MaxAttempts, job.LastError, job.NextRunAt, job.Message, job.CreatedAt, job.UpdatedAt,
	)
	if err != nil {
		return err
	}

	if item.Submission.Kind == analysis.SubmissionUpload && item.Submission.UploadID != "" {
		if _, err := tx.ExecContext(ctx, `UPDATE uploaded_artifacts SET analysis_id = $2 WHERE id = $1`, item.Submission.UploadID, item.ID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *PostgresStore) LeaseNextJob(ctx context.Context, now time.Time) (analysis.JobRecord, analysis.AnalysisRecord, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, err
	}
	defer tx.Rollback()

	row := tx.QueryRowContext(ctx, `
        SELECT id, analysis_id, job_type, status, attempts, max_attempts, COALESCE(last_error, ''), next_run_at, created_at, updated_at, COALESCE(message, '')
        FROM jobs
        WHERE status IN ('pending', 'failed')
          AND attempts < max_attempts
          AND (next_run_at IS NULL OR next_run_at <= $1)
        ORDER BY COALESCE(next_run_at, created_at), created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED`, now)

	var job analysis.JobRecord
	if err := row.Scan(&job.ID, &job.AnalysisID, &job.Type, &job.Status, &job.Attempts, &job.MaxAttempts, &job.LastError, &job.NextRunAt, &job.CreatedAt, &job.UpdatedAt, &job.Message); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return analysis.JobRecord{}, analysis.AnalysisRecord{}, analysis.ErrNotFound
		}
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, err
	}

	job.Status = analysis.JobStatusRunning
	job.Attempts++
	job.UpdatedAt = now
	job.Message = "Analysis job is running."

	if _, err := tx.ExecContext(ctx, `
        UPDATE jobs SET status = $2, attempts = $3, updated_at = $4, message = $5 WHERE id = $1`,
		job.ID, job.Status, job.Attempts, job.UpdatedAt, job.Message,
	); err != nil {
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, err
	}
	if _, err := tx.ExecContext(ctx, `
        UPDATE analyses SET status = $2, latest_job_id = $3, updated_at = $4 WHERE id = $1`,
		job.AnalysisID, analysis.AnalysisStatusRunning, job.ID, now,
	); err != nil {
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, err
	}

	if err := tx.Commit(); err != nil {
		return analysis.JobRecord{}, analysis.AnalysisRecord{}, err
	}

	item, err := s.GetAnalysis(ctx, job.AnalysisID)
	return job, item, err
}

func (s *PostgresStore) SaveAnalysisResult(ctx context.Context, item analysis.AnalysisRecord, job analysis.JobRecord) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
        UPDATE analyses
        SET status = $2, repository_url = NULLIF($3,''), artifact_name = NULLIF($4,''), upload_id = NULLIF($5,''), include_transitive_dependencies = $6, demo_profile = NULLIF($7,''), methodology_version = $8, latest_job_id = $9, updated_at = $10
        WHERE id = $1`,
		item.ID, item.Status, item.Submission.RepositoryURL, item.Submission.ArtifactName, item.Submission.UploadID, item.Submission.IncludeTransitiveDependencies, item.Submission.DemoProfile, item.MethodologyVersion, job.ID, item.UpdatedAt,
	); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `
        UPDATE jobs
        SET status = $2, attempts = $3, max_attempts = $4, last_error = NULLIF($5,''), next_run_at = $6, message = $7, updated_at = $8
        WHERE id = $1`,
		job.ID, job.Status, job.Attempts, job.MaxAttempts, job.LastError, job.NextRunAt, job.Message, job.UpdatedAt,
	); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM dependency_edges WHERE analysis_id = $1`, item.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM dependencies WHERE analysis_id = $1`, item.ID); err != nil {
		return err
	}

	for _, dependency := range item.Dependencies {
		dependencyPath, err := json.Marshal(dependency.DependencyPath)
		if err != nil {
			return err
		}
		repositoryJSON, err := json.Marshal(dependency.Repository)
		if err != nil {
			return err
		}
		scorecardJSON, err := json.Marshal(dependency.Scorecard)
		if err != nil {
			return err
		}
		riskProfileJSON, err := json.Marshal(dependency.RiskProfile)
		if err != nil {
			return err
		}
		rawSignalsJSON, err := json.Marshal(dependency.RawSignals)
		if err != nil {
			return err
		}

		if _, err := tx.ExecContext(ctx, `
            INSERT INTO dependencies (
                id, analysis_id, ecosystem, package_name, package_version, direct, dependency_path, repository_snapshot, scorecard_snapshot, risk_profile, raw_signals, raw_signals_available, parsed_from_upload_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULLIF($13,''))`,
			dependency.ID,
			dependency.AnalysisID,
			dependency.Ecosystem,
			dependency.PackageName,
			dependency.PackageVersion,
			dependency.Direct,
			string(dependencyPath),
			nullIfJSON(repositoryJSON),
			nullIfJSON(scorecardJSON),
			nullIfJSON(riskProfileJSON),
			string(rawSignalsJSON),
			dependency.RawSignalsAvailable,
			dependency.ParsedFromUploadID,
		); err != nil {
			return err
		}
	}

	for _, edge := range item.DependencyEdges {
		if _, err := tx.ExecContext(ctx, `INSERT INTO dependency_edges (analysis_id, edge_from, edge_to, kind) VALUES ($1,$2,$3,$4)`, item.ID, edge.From, edge.To, edge.Kind); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *PostgresStore) ListAnalyses(ctx context.Context) ([]analysis.AnalysisRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM analyses ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]analysis.AnalysisRecord, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		item, err := s.GetAnalysis(ctx, id)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) GetAnalysis(ctx context.Context, id string) (analysis.AnalysisRecord, error) {
	row := s.db.QueryRowContext(ctx, `
        SELECT id, source_kind, COALESCE(repository_url, ''), COALESCE(artifact_name, ''), COALESCE(upload_id, ''), include_transitive_dependencies, COALESCE(demo_profile, ''), status, methodology_version, COALESCE(latest_job_id, ''), created_at, updated_at
        FROM analyses
        WHERE id = $1`, id)

	var item analysis.AnalysisRecord
	var submission analysis.AnalysisSubmission
	if err := row.Scan(&item.ID, &submission.Kind, &submission.RepositoryURL, &submission.ArtifactName, &submission.UploadID, &submission.IncludeTransitiveDependencies, &submission.DemoProfile, &item.Status, &item.MethodologyVersion, &item.LatestJobID, &item.CreatedAt, &item.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return analysis.AnalysisRecord{}, analysis.ErrNotFound
		}
		return analysis.AnalysisRecord{}, err
	}
	item.Submission = submission

	dependencies, err := s.ListDependenciesByAnalysis(ctx, id)
	if err != nil {
		return analysis.AnalysisRecord{}, err
	}
	uploads, err := s.listUploadsByAnalysis(ctx, id)
	if err != nil {
		return analysis.AnalysisRecord{}, err
	}
	edges, err := s.listDependencyEdges(ctx, id)
	if err != nil {
		return analysis.AnalysisRecord{}, err
	}

	item.Dependencies = dependencies
	item.Uploads = uploads
	item.DependencyEdges = edges
	item.Summary = summarize(dependencies)
	return item, nil
}

func (s *PostgresStore) ListDependenciesByAnalysis(ctx context.Context, analysisID string) ([]analysis.DependencyRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
        SELECT id, analysis_id, ecosystem, package_name, package_version, direct, dependency_path, repository_snapshot, scorecard_snapshot, risk_profile, raw_signals, raw_signals_available, COALESCE(parsed_from_upload_id, '')
        FROM dependencies
        WHERE analysis_id = $1
        ORDER BY direct DESC, package_name ASC`, analysisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dependencies := make([]analysis.DependencyRecord, 0)
	for rows.Next() {
		dependency, err := scanDependency(rows)
		if err != nil {
			return nil, err
		}
		dependencies = append(dependencies, dependency)
	}
	return dependencies, rows.Err()
}

func (s *PostgresStore) GetDependency(ctx context.Context, id string) (analysis.DependencyRecord, error) {
	row := s.db.QueryRowContext(ctx, `
        SELECT id, analysis_id, ecosystem, package_name, package_version, direct, dependency_path, repository_snapshot, scorecard_snapshot, risk_profile, raw_signals, raw_signals_available, COALESCE(parsed_from_upload_id, '')
        FROM dependencies
        WHERE id = $1`, id)
	dependency, err := scanDependency(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return analysis.DependencyRecord{}, analysis.ErrNotFound
		}
		return analysis.DependencyRecord{}, err
	}
	return dependency, nil
}

func (s *PostgresStore) GetJob(ctx context.Context, id string) (analysis.JobRecord, error) {
	row := s.db.QueryRowContext(ctx, `
        SELECT id, analysis_id, job_type, status, attempts, max_attempts, COALESCE(last_error, ''), next_run_at, created_at, updated_at, COALESCE(message, '')
        FROM jobs
        WHERE id = $1`, id)

	var job analysis.JobRecord
	if err := row.Scan(&job.ID, &job.AnalysisID, &job.Type, &job.Status, &job.Attempts, &job.MaxAttempts, &job.LastError, &job.NextRunAt, &job.CreatedAt, &job.UpdatedAt, &job.Message); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return analysis.JobRecord{}, analysis.ErrNotFound
		}
		return analysis.JobRecord{}, err
	}
	return job, nil
}

func (s *PostgresStore) listUploadsByAnalysis(ctx context.Context, analysisID string) ([]analysis.UploadArtifact, error) {
	rows, err := s.db.QueryContext(ctx, `
        SELECT id, COALESCE(analysis_id, ''), file_name, COALESCE(content_type, ''), COALESCE(size_bytes, 0), COALESCE(storage_hint, ''), status, COALESCE(parse_error, ''), uploaded_at
        FROM uploaded_artifacts
        WHERE analysis_id = $1
        ORDER BY uploaded_at ASC`, analysisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	uploads := make([]analysis.UploadArtifact, 0)
	for rows.Next() {
		var upload analysis.UploadArtifact
		if err := rows.Scan(&upload.ID, &upload.AnalysisID, &upload.FileName, &upload.ContentType, &upload.SizeBytes, &upload.StorageHint, &upload.Status, &upload.ParseError, &upload.UploadedAt); err != nil {
			return nil, err
		}
		uploads = append(uploads, upload)
	}
	return uploads, rows.Err()
}

func (s *PostgresStore) listDependencyEdges(ctx context.Context, analysisID string) ([]analysis.DependencyEdge, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT edge_from, edge_to, kind FROM dependency_edges WHERE analysis_id = $1 ORDER BY id ASC`, analysisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	edges := make([]analysis.DependencyEdge, 0)
	for rows.Next() {
		var edge analysis.DependencyEdge
		if err := rows.Scan(&edge.From, &edge.To, &edge.Kind); err != nil {
			return nil, err
		}
		edges = append(edges, edge)
	}
	return edges, rows.Err()
}

type scanner interface {
	Scan(dest ...any) error
}

func scanDependency(row scanner) (analysis.DependencyRecord, error) {
	var dependency analysis.DependencyRecord
	var dependencyPath []byte
	var repositoryJSON []byte
	var scorecardJSON []byte
	var riskProfileJSON []byte
	var rawSignalsJSON []byte

	if err := row.Scan(
		&dependency.ID,
		&dependency.AnalysisID,
		&dependency.Ecosystem,
		&dependency.PackageName,
		&dependency.PackageVersion,
		&dependency.Direct,
		&dependencyPath,
		&repositoryJSON,
		&scorecardJSON,
		&riskProfileJSON,
		&rawSignalsJSON,
		&dependency.RawSignalsAvailable,
		&dependency.ParsedFromUploadID,
	); err != nil {
		return analysis.DependencyRecord{}, err
	}

	if err := decodeJSON(dependencyPath, &dependency.DependencyPath); err != nil {
		return analysis.DependencyRecord{}, err
	}
	if err := decodeJSON(repositoryJSON, &dependency.Repository); err != nil {
		return analysis.DependencyRecord{}, err
	}
	if err := decodeJSON(scorecardJSON, &dependency.Scorecard); err != nil {
		return analysis.DependencyRecord{}, err
	}
	if err := decodeJSON(riskProfileJSON, &dependency.RiskProfile); err != nil {
		return analysis.DependencyRecord{}, err
	}
	if err := decodeJSON(rawSignalsJSON, &dependency.RawSignals); err != nil {
		return analysis.DependencyRecord{}, err
	}
	return dependency, nil
}

func decodeJSON(data []byte, target any) error {
	trimmed := string(data)
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	return json.Unmarshal(data, target)
}

func nullIfJSON(data []byte) any {
	trimmed := string(data)
	if trimmed == "null" || trimmed == "" {
		return nil
	}
	return string(data)
}

func (s *PostgresStore) String() string {
	return fmt.Sprintf("PostgresStore(%p)", s.db)
}
