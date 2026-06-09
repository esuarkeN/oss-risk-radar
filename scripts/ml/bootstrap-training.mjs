import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildDataset, parseArgs as parseBuildDatasetArgs } from "./build-dataset.mjs";
import { trainArtifacts } from "./train-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseBootstrapArgs(argv) {
  const args = {
    force: false,
    modelName: null,
    datasetArgs: [],
    datasetPath: path.join("tmp", "training", "snapshots.json"),
    featureCacheOutputPath: path.join("tmp", "training", "repository-feature-cache.json"),
    runsDir: path.join("tmp", "training", "runs"),
    latestRunPath: path.join("tmp", "training", "latest-run.json"),
    minimumValidationRows: null,
    minimumTestRows: null,
    minimumInactiveRate: null,
    runner: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--force") {
      args.force = true;
      continue;
    }
    if (current === "--model-name") {
      if (!next) throw new Error("--model-name requires a value");
      args.modelName = next;
      index += 1;
      continue;
    }
    if (current === "--training-output-path") {
      if (!next) throw new Error("--training-output-path requires a value");
      args.datasetPath = next;
      args.datasetArgs.push(current, next);
      index += 1;
      continue;
    }
    if (current === "--feature-cache-output-path") {
      if (!next) throw new Error("--feature-cache-output-path requires a value");
      args.featureCacheOutputPath = next;
      args.datasetArgs.push(current, next);
      index += 1;
      continue;
    }
    if (current === "--runner") {
      if (!next) throw new Error("--runner requires a value");
      if (!["docker", "local"].includes(next)) {
        throw new Error("--runner must be either docker or local");
      }
      args.runner = next;
      args.datasetArgs.push(current, next);
      index += 1;
      continue;
    }
    if (current === "--minimum-validation-rows") {
      if (!next) throw new Error("--minimum-validation-rows requires a value");
      args.minimumValidationRows = parseIntegerFlag(next, "--minimum-validation-rows");
      index += 1;
      continue;
    }
    if (current === "--minimum-test-rows") {
      if (!next) throw new Error("--minimum-test-rows requires a value");
      args.minimumTestRows = parseIntegerFlag(next, "--minimum-test-rows");
      index += 1;
      continue;
    }
    if (current === "--minimum-inactive-rate") {
      if (!next) throw new Error("--minimum-inactive-rate requires a value");
      args.minimumInactiveRate = parseRateFlag(next, "--minimum-inactive-rate");
      index += 1;
      continue;
    }
    args.datasetArgs.push(current);
  }

  applyNpmForwardedConfig(args);
  const isFoundationBootstrap = args.datasetArgs.includes("--generate-foundation-seed") || npmBooleanConfig("generate-foundation-seed");
  args.minimumValidationRows ??= isFoundationBootstrap ? 25 : 1;
  args.minimumTestRows ??= isFoundationBootstrap ? 25 : 1;
  args.minimumInactiveRate ??= isFoundationBootstrap ? 0.01 : 0;
  return args;
}

function npmConfig(name) {
  return process.env[`npm_config_${name.replaceAll("-", "_")}`];
}

function npmBooleanConfig(name) {
  const value = npmConfig(name);
  return value === "true" || value === "1" || value === "";
}

function npmStringConfig(name, leakedValues) {
  const value = npmConfig(name);
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "true" || value === "1") {
    return leakedValues.shift();
  }
  return value;
}

function applyNpmForwardedConfig(args) {
  const leakedValues = args.datasetArgs.filter((value) => !value.startsWith("--"));
  const runner = npmStringConfig("runner", leakedValues);
  if (runner) {
    if (!["docker", "local"].includes(runner)) {
      throw new Error("--runner must be either docker or local");
    }
    args.runner = runner;
  }

  const modelName = npmStringConfig("model-name", leakedValues);
  if (modelName) {
    args.modelName = modelName;
  }
  const trainingOutputPath = npmStringConfig("training-output-path", leakedValues);
  if (trainingOutputPath) {
    args.datasetPath = trainingOutputPath;
  }
  const featureCacheOutputPath = npmStringConfig("feature-cache-output-path", leakedValues);
  if (featureCacheOutputPath) {
    args.featureCacheOutputPath = featureCacheOutputPath;
  }
  if (npmConfig("minimum-validation-rows") !== undefined) {
    args.minimumValidationRows = parseIntegerFlag(npmConfig("minimum-validation-rows"), "--minimum-validation-rows");
  }
  if (npmConfig("minimum-test-rows") !== undefined) {
    args.minimumTestRows = parseIntegerFlag(npmConfig("minimum-test-rows"), "--minimum-test-rows");
  }
  if (npmConfig("minimum-inactive-rate") !== undefined) {
    args.minimumInactiveRate = parseRateFlag(npmConfig("minimum-inactive-rate"), "--minimum-inactive-rate");
  }
  if (npmBooleanConfig("force")) {
    args.force = true;
  }
}

function parseIntegerFlag(value, flagName) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be an integer >= 0`);
  }
  return parsed;
}

function parseRateFlag(value, flagName) {
  const parsed = Number.parseFloat(`${value ?? ""}`.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flagName} must be a number between 0 and 1`);
  }
  return parsed;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function verifyHostArtifacts(args) {
  const latestRunPath = resolveRepoPath(args.latestRunPath);
  if (!existsSync(resolveRepoPath(args.datasetPath))) {
    throw new Error(`expected dataset file at ${resolveRepoPath(args.datasetPath)}`);
  }
  if (!existsSync(resolveRepoPath(args.featureCacheOutputPath))) {
    throw new Error(`expected repository feature cache at ${resolveRepoPath(args.featureCacheOutputPath)}`);
  }
  if (!existsSync(latestRunPath)) {
    throw new Error(`expected latest cached run pointer at ${latestRunPath}`);
  }

  const latestPayload = JSON.parse(readFileSync(latestRunPath, "utf-8"));
  if (!latestPayload.metrics || !latestPayload.splitSummary) {
    throw new Error("latest model artifact is missing metrics or split summary");
  }
  if (latestPayload.splitSummary.validationRows < args.minimumValidationRows) {
    throw new Error(
      `offline training produced only ${latestPayload.splitSummary.validationRows} validation rows, below the required ${args.minimumValidationRows}`
    );
  }
  if (latestPayload.splitSummary.testRows < args.minimumTestRows) {
    throw new Error(
      `offline training produced only ${latestPayload.splitSummary.testRows} test rows, below the required ${args.minimumTestRows}`
    );
  }
  if (latestPayload.metrics.positiveRate < args.minimumInactiveRate) {
    throw new Error(
      `offline training produced an inactive 12m rate of ${latestPayload.metrics.positiveRate}, below the required ${args.minimumInactiveRate}`
    );
  }
  return latestPayload;
}

async function bootstrap() {
  const args = parseBootstrapArgs(process.argv.slice(2));
  const datasetArgs = parseDatasetArgs(args.datasetArgs);
  if (!args.runner && datasetArgs.runner !== "docker") {
    args.runner = datasetArgs.runner;
  }
  args.datasetPath = datasetArgs.trainingOutputPath;
  args.featureCacheOutputPath = datasetArgs.featureCacheOutputPath;
  await buildDataset(datasetArgs);
  await trainArtifacts([
    "--dataset-path",
    args.datasetPath,
    "--runs-dir",
    args.runsDir,
    "--latest-run-path",
    args.latestRunPath,
    ...(args.runner ? ["--runner", args.runner] : []),
    ...(args.force ? ["--force"] : []),
    ...(args.modelName ? ["--model-name", args.modelName] : []),
  ]);
  const latest = verifyHostArtifacts(args);

  console.log(`offline training status: ${latest.status}`);
  console.log(`model: ${latest.modelName} ${latest.modelVersion}`);
  console.log(`splits: ${latest.splitSummary.trainRows}/${latest.splitSummary.validationRows}/${latest.splitSummary.testRows}`);
  console.log(`dataset path: ${path.relative(repoRoot, resolveRepoPath(args.datasetPath))}`);
  console.log(`repository feature cache: ${path.relative(repoRoot, resolveRepoPath(args.featureCacheOutputPath))}`);
  console.log(`latest run pointer: ${path.relative(repoRoot, resolveRepoPath(args.latestRunPath))}`);
}

function parseDatasetArgs(datasetArgs) {
  return parseBuildDatasetArgs(["build-all", ...datasetArgs]);
}

try {
  await bootstrap();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
