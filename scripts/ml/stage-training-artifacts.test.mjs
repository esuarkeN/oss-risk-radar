import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareModelMetrics, normalizedSnapshotPayload } from "./stage-training-artifacts.mjs";

const MODELS = [
  "logistic-regression-full-history",
  "xgboost-full-history",
  "logistic-regression-cold-start",
  "xgboost-cold-start",
];

function artifacts(rocAuc, brierScore) {
  return MODELS.map((modelName) => ({
    run: {
      modelName,
      datasetHash: "fixture",
      metrics: { rocAuc, brierScore },
    },
  }));
}

test("promotion gate accepts every model at the approved regression limits", () => {
  const comparison = compareModelMetrics(artifacts(0.78, 0.12), artifacts(0.80, 0.10));
  assert.equal(comparison.passed, true);
  assert.equal(comparison.models.length, 4);
  assert.ok(comparison.models.every((model) => model.passed));
});

test("promotion gate rejects a regression from any required model", () => {
  const candidate = artifacts(0.80, 0.10);
  candidate[2].run.metrics.rocAuc = 0.77;
  const comparison = compareModelMetrics(candidate, artifacts(0.80, 0.10));
  assert.equal(comparison.passed, false);
  assert.equal(comparison.models[2].passed, false);
});

test("parallel downloader uses independent non-nested seed coverage shard paths", () => {
  const source = readFileSync("scripts/download-gharchive-seed-filtered-parallel.ps1", "utf8");
  assert.match(source, /\$workerSeedCoveragePath = "\{0\}\.shard-\{1\}-of-\{2\}\.csv"/);
  assert.match(source, /\$seedCoverageShardPaths \+= \$workerSeedCoveragePath/);
  assert.doesNotMatch(source, /\$SeedCoveragePath = "\{0\}\.shard-\{1\}-of-\{2\}\.csv"/);
});

test("failed downloads cannot poison the preserved raw retry cache", () => {
  const source = readFileSync("scripts/download-gharchive-seed-filtered.ps1", "utf8");
  assert.match(source, /if \(Test-Path \$rawFile\) \{ Remove-Item \$rawFile -Force \}/);
  assert.doesNotMatch(source, /Test-Path \$rawFile\) -and -not \$KeepRaw\) \{ Remove-Item \$rawFile -Force \}[\s\S]*continue/);
  assert.match(source, /if \(\$count -eq 0\) \{[\s\S]*\$writer\.WriteLine\(\)/);
});


test("coverage merge keeps prior results when a resume shard only skips an existing hour", () => {
  const source = readFileSync("scripts/download-gharchive-seed-filtered-parallel.ps1", "utf8");
  assert.match(source, /\$key = "\$\(\$row\.file\)\|\$\(\$row\.date\)\|\$\(\$row\.hour\)"/);
  assert.match(source, /function Get-CoverageStatusPriority/);
  assert.match(source, /"download_failed" \{ return 0 \}/);
  assert.match(source, /"skipped_existing" \{ return 1 \}/);
  assert.match(source, /default \{ return 2 \}/);
  assert.match(source, /Get-CoverageStatusPriority \$row\.status\) -gt \(Get-CoverageStatusPriority \$existing\.status/);
  assert.match(source, /Export-Csv \$combinedCoveragePath -NoTypeInformation/);
});

test("staging preserves the observation-time archival field used by the dataset hash", () => {
  const payload = [{
    dependency: {
      historical_features: {
        commits_30d: 3,
        repo_archived_at_obs: 0,
        training_only_debug_value: 99,
      },
    },
  }];
  const runArtifacts = [{ run: { modelArtifact: { featureNames: ["commits_30d"] } } }];

  const normalized = normalizedSnapshotPayload(payload, runArtifacts);
  assert.deepEqual(normalized[0].dependency.historical_features, {
    commits_30d: 3,
    repo_archived_at_obs: 0,
  });
});
