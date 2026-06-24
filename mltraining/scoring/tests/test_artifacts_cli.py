from __future__ import annotations

import json
import hashlib

from app.training.artifact_export import ArtifactExportConfig, compute_go_dataset_hash, train_artifacts


def test_artifact_export_computes_go_compatible_dataset_hash() -> None:
    snapshots = [
        {
            "analysis_id": "analysis_1",
            "observed_at": "2023-01-01T00:00:00Z",
            "label_inactive_12m": True,
            "dependency": {
                "dependency_id": "dep_1",
                "package_name": "requests",
                "package_version": "2.31.0",
                "ecosystem": "pypi",
                "direct": True,
                "historical_features": {"zeta": 2, "alpha": 1},
            },
        }
    ]
    expected_payload = (
        '[{"analysis_id":"analysis_1","observed_at":"2023-01-01T00:00:00Z",'
        '"dependency":{"dependency_id":"dep_1","package_name":"requests","package_version":"2.31.0",'
        '"ecosystem":"pypi","direct":true,"historical_features":{"alpha":1.0,"zeta":2.0}},'
        '"label_inactive_12m":true}]'
    )

    assert compute_go_dataset_hash(snapshots) == hashlib.sha256(expected_payload.encode("utf-8")).hexdigest()


def test_artifact_export_writes_both_model_artifacts(tmp_path, training_snapshots: list[dict[str, object]]) -> None:
    dataset_path = tmp_path / "snapshots.json"
    runs_dir = tmp_path / "runs"
    latest_path = tmp_path / "latest-run.json"
    dataset_path.write_text(json.dumps({"snapshots": training_snapshots}), encoding="utf-8")

    runs = train_artifacts(
        ArtifactExportConfig(
            dataset_path=str(dataset_path),
            runs_dir=str(runs_dir),
            latest_run_path=str(latest_path),
            model_names=[],
            train_ratio=0.5,
            validation_ratio=0.25,
            calibration_bins=5,
            force=True,
            verbose=False,
        )
    )

    model_names = {run["modelName"] for run in runs}
    assert model_names == {
        "logistic-regression-full-history",
        "xgboost-full-history",
        "logistic-regression-cold-start",
        "xgboost-cold-start",
    }
    assert latest_path.exists()
    assert len(list(runs_dir.glob("*.json"))) == 4

    latest = json.loads(latest_path.read_text(encoding="utf-8"))
    assert latest["status"] == "completed"
    assert latest["modelName"] in model_names
    assert latest["datasetHash"]
    assert latest["modelArtifact"]["featureVersion"] in {"feature-set-v3-full-history", "feature-set-v3-cold-start"}
