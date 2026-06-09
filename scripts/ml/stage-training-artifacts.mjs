import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const REQUIRED_MODEL_NAMES = [
  "logistic-regression-full-history",
  "xgboost-full-history",
  "logistic-regression-cold-start",
  "xgboost-cold-start",
];
const REQUIRED_FEATURE_VERSIONS = new Set(["feature-set-v3-full-history", "feature-set-v3-cold-start"]);

function parseArgs(argv) {
  const args = {
    sourceDir: path.join("tmp", "training"),
    targetDir: path.join("deployment", "training"),
    minimumRepositories: 40,
    minimumInactiveRepositories: 8,
    runtimeDatasetPath: "/app/tmp/training/snapshots.json",
    runtimeRunsDir: "/app/tmp/training/runs",
    clean: true,
    requireBothModels: true,
    summaryOutput: null,
    requiredFeatureVersion: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--":
        break;
      case "--source-dir":
        if (!next) throw new Error("--source-dir requires a value");
        args.sourceDir = next;
        index += 1;
        break;
      case "--target-dir":
        if (!next) throw new Error("--target-dir requires a value");
        args.targetDir = next;
        index += 1;
        break;
      case "--minimum-repositories":
        if (!next) throw new Error("--minimum-repositories requires a value");
        args.minimumRepositories = parsePositiveInteger(next, "--minimum-repositories");
        index += 1;
        break;
      case "--minimum-inactive-repositories":
        if (!next) throw new Error("--minimum-inactive-repositories requires a value");
        args.minimumInactiveRepositories = parsePositiveInteger(next, "--minimum-inactive-repositories");
        index += 1;
        break;
      case "--runtime-dataset-path":
        if (!next) throw new Error("--runtime-dataset-path requires a value");
        args.runtimeDatasetPath = next;
        index += 1;
        break;
      case "--runtime-runs-dir":
        if (!next) throw new Error("--runtime-runs-dir requires a value");
        args.runtimeRunsDir = next;
        index += 1;
        break;
      case "--no-clean":
        args.clean = false;
        break;
      case "--allow-missing-models":
        args.requireBothModels = false;
        break;
      case "--summary-output":
        if (!next) throw new Error("--summary-output requires a value");
        args.summaryOutput = next;
        index += 1;
        break;
      case "--required-feature-version":
        if (!next) throw new Error("--required-feature-version requires a value");
        args.requiredFeatureVersion = next;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
  }

  return args;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be an integer >= 0`);
  }
  return parsed;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function loadSnapshots(snapshotPath) {
  const payload = readJson(snapshotPath);
  const snapshots = Array.isArray(payload) ? payload : payload.snapshots ?? [];
  if (!Array.isArray(snapshots)) {
    throw new Error(`${snapshotPath} does not contain a snapshots array`);
  }
  return snapshots;
}

function isRealRepositorySnapshot(snapshot) {
  const repository = snapshot?.dependency?.repository;
  const fullName = `${repository?.full_name ?? ""}`.trim();
  const url = `${repository?.url ?? ""}`.trim().toLowerCase();
  return fullName !== "" && (url.startsWith("https://github.com/") || url.startsWith("http://github.com/"));
}

function validateSnapshots(snapshotPath, args) {
  const snapshots = loadSnapshots(snapshotPath);
  if (snapshots.length === 0) {
    throw new Error("training snapshots are empty");
  }

  const labeled = snapshots.filter((snapshot) => snapshot.label_inactive_12m !== null && snapshot.label_inactive_12m !== undefined);
  const realRepositorySnapshots = snapshots.filter(isRealRepositorySnapshot);
  const labeledRealRepositorySnapshots = labeled.filter(isRealRepositorySnapshot);
  const inactiveRepositories = new Set(
    labeled
      .filter((snapshot) => snapshot.label_inactive_12m === true && isRealRepositorySnapshot(snapshot))
      .map((snapshot) => snapshot.dependency.repository.url || snapshot.dependency.repository.full_name)
  );

  if (labeled.length === 0) {
    throw new Error("training snapshots contain no labels; build the historical real-project dataset first");
  }
  if (realRepositorySnapshots.length === 0) {
    throw new Error("training snapshots contain no GitHub repository identities");
  }
  if (labeledRealRepositorySnapshots.length !== labeled.length) {
    throw new Error("all labeled training snapshots must come from real GitHub repositories");
  }

  const repositories = new Set(
    realRepositorySnapshots.map((snapshot) => snapshot.dependency.repository.url || snapshot.dependency.repository.full_name)
  );
  if (repositories.size < args.minimumRepositories) {
    throw new Error(
      `training snapshots contain only ${repositories.size} real repositories; expected at least ${args.minimumRepositories}`
    );
  }
  if (inactiveRepositories.size < args.minimumInactiveRepositories) {
    throw new Error(
      `training snapshots contain only ${inactiveRepositories.size} inactive repositories; expected at least ${args.minimumInactiveRepositories}`
    );
  }

  return {
    total: snapshots.length,
    labeled: labeled.length,
    repositories: repositories.size,
    inactiveRepositories: inactiveRepositories.size,
  };
}

function runSortKey(item) {
  return `${item.run.trainedAt ?? item.run.cachedAt ?? ""}|${path.basename(item.runPath)}`;
}

function validateRunArtifacts(sourceRunsDir, args, latestRun) {
  if (!existsSync(sourceRunsDir)) {
    throw new Error(`missing training run artifact directory: ${sourceRunsDir}`);
  }

  const latestDatasetHash = latestRun.datasetHash;
  if (!latestDatasetHash) {
    throw new Error("latest training artifact pointer does not contain a datasetHash");
  }

  const selectedByModel = new Map();
  for (const item of readdirSync(sourceRunsDir, { withFileTypes: true })) {
    if (item.isDirectory() || path.extname(item.name) !== ".json") {
      continue;
    }
    const runPath = path.join(sourceRunsDir, item.name);
    const run = readJson(runPath);
    if (run.status === "completed" && run.modelArtifact) {
      if (run.datasetHash !== latestDatasetHash) {
        continue;
      }
      const featureVersion = run.modelArtifact.featureVersion ?? run.modelArtifact.feature_version;
      if (args.requiredFeatureVersion && featureVersion !== args.requiredFeatureVersion) {
        throw new Error(
          `staged training bundle contains ${run.modelName} with feature version ${featureVersion ?? "unknown"}; expected ${args.requiredFeatureVersion}`
        );
      }
      if (!args.requiredFeatureVersion && !REQUIRED_FEATURE_VERSIONS.has(featureVersion)) {
        throw new Error(
          `staged training bundle contains ${run.modelName} with feature version ${featureVersion ?? "unknown"}; expected one of ${[...REQUIRED_FEATURE_VERSIONS].join(", ")}`
        );
      }
      const candidate = { runPath, run };
      const existing = selectedByModel.get(run.modelName);
      if (!existing || runSortKey(candidate) > runSortKey(existing)) {
        selectedByModel.set(run.modelName, candidate);
      }
    }
  }

  if (args.requireBothModels) {
    const missing = REQUIRED_MODEL_NAMES.filter((modelName) => !selectedByModel.has(modelName));
    if (missing.length > 0) {
      throw new Error(
        `staged training bundle for dataset ${latestDatasetHash} is missing completed model artifacts: ${missing.join(", ")}`
      );
    }
  }
  return [...selectedByModel.values()].sort((left, right) => `${left.run.modelName}`.localeCompare(`${right.run.modelName}`));
}

function modelFeatureNames(runArtifacts) {
  const names = new Set();
  for (const { run } of runArtifacts) {
    for (const feature of run.modelArtifact.featureNames ?? run.modelArtifact.feature_names ?? []) {
      names.add(feature);
    }
  }
  return names;
}

function normalizeRepositoryKey(repository = {}) {
  const fullName = `${repository.full_name ?? repository.fullName ?? ""}`.trim().toLowerCase();
  if (fullName) {
    return fullName.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  }
  return `${repository.url ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function repositoryFullName(repository = {}, key) {
  const fullName = `${repository.full_name ?? repository.fullName ?? ""}`.trim();
  return fullName || key;
}

function filteredHistoricalFeatures(features, allowedFeatureNames) {
  const output = {};
  for (const [key, value] of Object.entries(features ?? {})) {
    if (!allowedFeatureNames.has(key)) {
      continue;
    }
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      output[key] = numericValue;
    }
  }
  return output;
}

function normalizeSnapshotHistoricalFeatures(snapshot, allowedFeatureNames) {
  const dependency = snapshot?.dependency;
  if (!dependency?.historical_features) {
    return snapshot;
  }
  return {
    ...snapshot,
    dependency: {
      ...dependency,
      historical_features: filteredHistoricalFeatures(dependency.historical_features, allowedFeatureNames),
    },
  };
}

function normalizedSnapshotPayload(payload, runArtifacts) {
  const allowedFeatureNames = modelFeatureNames(runArtifacts);
  if (Array.isArray(payload)) {
    return payload.map((snapshot) => normalizeSnapshotHistoricalFeatures(snapshot, allowedFeatureNames));
  }
  if (Array.isArray(payload?.snapshots)) {
    return {
      ...payload,
      snapshots: payload.snapshots.map((snapshot) => normalizeSnapshotHistoricalFeatures(snapshot, allowedFeatureNames)),
    };
  }
  return payload;
}

function deriveFeatureCacheFromSnapshots(snapshotPath, runArtifacts) {
  const snapshots = loadSnapshots(snapshotPath);
  const allowedFeatureNames = modelFeatureNames(runArtifacts);
  const historicalFeatureNames = new Set();
  for (const snapshot of snapshots) {
    for (const feature of Object.keys(snapshot?.dependency?.historical_features ?? {})) {
      if (allowedFeatureNames.has(feature)) {
        historicalFeatureNames.add(feature);
      }
    }
  }
  const byRepository = new Map();

  for (const snapshot of snapshots) {
    const dependency = snapshot?.dependency ?? {};
    const repository = dependency.repository ?? {};
    const key = normalizeRepositoryKey(repository);
    if (!key) {
      continue;
    }
    const featureValues = filteredHistoricalFeatures(dependency.historical_features, historicalFeatureNames);
    if (Object.keys(featureValues).length === 0) {
      continue;
    }
    const observedAt = `${snapshot.observed_at ?? snapshot.observedAt ?? ""}`;
    const existing = byRepository.get(key);
    if (existing && `${existing.observedAt ?? ""}` >= observedAt) {
      continue;
    }
    byRepository.set(key, {
      repositoryFullName: repositoryFullName(repository, key),
      repositoryUrl: repository.url ?? `https://github.com/${key}`,
      observedAt,
      source: "snapshot-historical-features",
      featureValues,
      missingFeatures: [...historicalFeatureNames].filter((feature) => !(feature in featureValues)),
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    repositories: [...byRepository.values()].sort((left, right) =>
      `${left.repositoryFullName}`.localeCompare(`${right.repositoryFullName}`)
    ),
  };
}

function normalizedFeatureCachePayload(payload, runArtifacts) {
  const allowedFeatureNames = modelFeatureNames(runArtifacts);
  return {
    ...payload,
    repositories: (payload.repositories ?? []).map((repository) => ({
      ...repository,
      featureValues: filteredHistoricalFeatures(repository.featureValues, allowedFeatureNames),
      missingFeatures: (repository.missingFeatures ?? []).filter((feature) => allowedFeatureNames.has(feature)),
    })),
  };
}

function runtimeArtifactPath(runtimeRunsDir, artifactFileName) {
  return `${runtimeRunsDir.replace(/[\\/]+$/, "")}/${artifactFileName}`;
}

function basenameFromAnyPlatform(value) {
  const raw = `${value ?? ""}`.trim();
  if (raw === "") {
    return "";
  }
  const winName = path.win32.basename(raw);
  const posixName = path.posix.basename(raw);
  if (winName.endsWith(".json")) {
    return winName;
  }
  if (posixName.endsWith(".json")) {
    return posixName;
  }
  return path.basename(raw);
}

function normalizedRunArtifact(sourcePath, args) {
  const artifact = readJson(sourcePath);
  const artifactFileName = basenameFromAnyPlatform(artifact.artifactPath) || path.basename(sourcePath);
  return {
    ...artifact,
    datasetPath: args.runtimeDatasetPath,
    artifactPath: runtimeArtifactPath(args.runtimeRunsDir, artifactFileName),
  };
}

function copyRunArtifact(source, target, args) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeJson(target, normalizedRunArtifact(source, args));
}

function stageArtifacts(args) {
  const sourceDir = resolveRepoPath(args.sourceDir);
  const targetDir = resolveRepoPath(args.targetDir);
  const sourceSnapshotPath = path.join(sourceDir, "snapshots.json");
  const sourceLatestRunPath = path.join(sourceDir, "latest-run.json");
  const sourceRunsDir = path.join(sourceDir, "runs");
  const sourceFeatureCachePath = path.join(sourceDir, "repository-feature-cache.json");

  if (!existsSync(sourceSnapshotPath)) {
    throw new Error(`missing real training snapshot export: ${sourceSnapshotPath}`);
  }
  if (!existsSync(sourceLatestRunPath)) {
    throw new Error(`missing latest training artifact pointer: ${sourceLatestRunPath}`);
  }

  const summary = validateSnapshots(sourceSnapshotPath, args);
  const latestRun = readJson(sourceLatestRunPath);
  const runArtifactsToStage = validateRunArtifacts(sourceRunsDir, args, latestRun);
  const completedModelCount = new Set(runArtifactsToStage.map((item) => item.run.modelName)).size;
  if (args.clean && existsSync(targetDir)) {
    for (const item of readdirSync(targetDir, { withFileTypes: true })) {
      if (item.name === "README.md") continue;
      rmSync(path.join(targetDir, item.name), { recursive: true, force: true });
    }
  }

  mkdirSync(path.join(targetDir, "runs"), { recursive: true });
  const targetSnapshotPath = path.join(targetDir, "snapshots.json");
  const targetLatestRunPath = path.join(targetDir, "latest-run.json");
  const targetRunsDir = path.join(targetDir, "runs");
  const targetFeatureCachePath = path.join(targetDir, "repository-feature-cache.json");
  writeJson(targetSnapshotPath, normalizedSnapshotPayload(readJson(sourceSnapshotPath), runArtifactsToStage));

  copyRunArtifact(sourceLatestRunPath, targetLatestRunPath, args);

  let runCount = 0;
  const runArtifacts = [];
  for (const { runPath } of runArtifactsToStage) {
    const targetRunPath = path.join(targetRunsDir, path.basename(runPath));
    copyRunArtifact(runPath, targetRunPath, args);
    runArtifacts.push(targetRunPath);
    runCount += 1;
  }
  let featureCacheCopied = false;
  let featureCacheSource = "not found";
  if (existsSync(sourceFeatureCachePath)) {
    writeJson(targetFeatureCachePath, normalizedFeatureCachePayload(readJson(sourceFeatureCachePath), runArtifactsToStage));
    featureCacheCopied = true;
    featureCacheSource = "copied and normalized";
  } else {
    const derivedFeatureCache = deriveFeatureCacheFromSnapshots(sourceSnapshotPath, runArtifactsToStage);
    if (derivedFeatureCache.repositories.length > 0) {
      writeJson(targetFeatureCachePath, derivedFeatureCache);
      featureCacheCopied = true;
      featureCacheSource = "derived from snapshots";
    }
  }

  return {
    ...summary,
    latestCopied: true,
    runCount,
    completedModelCount,
    sourceDir,
    targetDir,
    sourceSnapshotPath,
    targetSnapshotPath,
    targetLatestRunPath,
    targetRunsDir,
    sourceFeatureCachePath,
    targetFeatureCachePath,
    featureCacheCopied,
    featureCacheSource,
    runArtifacts,
  };
}

function modelSummary(runArtifactPath) {
  const run = readJson(runArtifactPath);
  return {
    modelName: run.modelName,
    modelVersion: run.modelVersion,
    status: run.status,
    datasetHash: run.datasetHash,
    artifactPath: run.artifactPath,
    featureVersion: run.modelArtifact?.featureVersion ?? null,
    stagedPath: relativeRepoPath(runArtifactPath),
    metrics: run.metrics ?? null,
    trainedAt: run.trainedAt ?? null,
    cachedAt: run.cachedAt ?? null,
  };
}

function buildPipelineSummary(result) {
  const latest = readJson(result.targetLatestRunPath);
  const allRunArtifacts = result.runArtifacts
    .map(modelSummary)
    .filter((model) => model.status === "completed")
    .sort((left, right) => `${left.modelName}`.localeCompare(`${right.modelName}`));
  const latestDatasetHash = latest.datasetHash ?? allRunArtifacts.find((model) => model.datasetHash)?.datasetHash ?? null;
  const latestDatasetModels = latestDatasetHash
    ? allRunArtifacts.filter((model) => model.datasetHash === latestDatasetHash)
    : [];
  const models = latestDatasetModels.length > 0 ? latestDatasetModels : allRunArtifacts;

  return {
    generatedAt: new Date().toISOString(),
    dataset: {
      hash: latestDatasetHash,
      totalSnapshots: result.total,
      labeledSnapshots: result.labeled,
      repositories: result.repositories,
      inactiveRepositories: result.inactiveRepositories,
      sourcePath: relativeRepoPath(result.sourceSnapshotPath),
      stagedPath: relativeRepoPath(result.targetSnapshotPath),
    },
    latestRun: {
      modelName: latest.modelName,
      modelVersion: latest.modelVersion,
      status: latest.status,
      datasetHash: latest.datasetHash ?? null,
      metrics: latest.metrics ?? null,
      stagedPath: relativeRepoPath(result.targetLatestRunPath),
    },
    models,
    allRunArtifacts,
    staged: {
      sourceDir: relativeRepoPath(result.sourceDir),
      targetDir: relativeRepoPath(result.targetDir),
      latestRunPath: relativeRepoPath(result.targetLatestRunPath),
      runsDir: relativeRepoPath(result.targetRunsDir),
      featureCachePath: result.featureCacheCopied ? relativeRepoPath(result.targetFeatureCachePath) : null,
      featureCacheSource: result.featureCacheSource,
      runCount: result.runCount,
      completedModelCount: result.completedModelCount,
    },
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = stageArtifacts(args);
  const summary = buildPipelineSummary(result);
  if (args.summaryOutput) {
    writeJson(resolveRepoPath(args.summaryOutput), summary);
    console.log(`summary: ${path.relative(repoRoot, resolveRepoPath(args.summaryOutput))}`);
  }
  console.log(`staged ${result.total} snapshots (${result.labeled} labeled, ${result.repositories} repos, ${result.inactiveRepositories} inactive repos)`);
  console.log(`latest run: ${result.latestCopied ? "copied" : "not found"}`);
  console.log(`run artifacts: ${result.runCount} (${result.completedModelCount} completed models)`);
  console.log(`repository feature cache: ${result.featureCacheSource}`);
  console.log(`source: ${path.relative(repoRoot, result.sourceDir)}`);
  console.log(`target: ${path.relative(repoRoot, result.targetDir)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
