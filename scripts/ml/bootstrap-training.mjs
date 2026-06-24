import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseArgs as parseBuildDatasetArgs } from "./build-dataset.mjs";
import { trainArtifacts } from "./train-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseIntegerFlag(value, flagName) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flagName} must be an integer >= 0`);
  return parsed;
}

function parseRateFlag(value, flagName) {
  const parsed = Number.parseFloat(`${value ?? ""}`.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flagName} must be a number between 0 and 1`);
  }
  return parsed;
}

function parseBootstrapArgs(argv) {
  const args = {
    datasetMode: "rebuild",
    force: false,
    modelName: null,
    runsDir: path.join("tmp", "training", "runs"),
    latestRunPath: path.join("tmp", "training", "latest-run.json"),
    minimumSnapshots: 3,
    minimumValidationRows: null,
    minimumTestRows: null,
    minimumInactiveRate: null,
    executionTimeout: "900",
    datasetArgs: [],
  };
  const valueFlags = new Map([
    ["--dataset-mode", "datasetMode"],
    ["--model-name", "modelName"],
    ["--runs-dir", "runsDir"],
    ["--latest-run-path", "latestRunPath"],
    ["--minimum-snapshots", "minimumSnapshots"],
    ["--minimum-validation-rows", "minimumValidationRows"],
    ["--minimum-test-rows", "minimumTestRows"],
    ["--minimum-inactive-rate", "minimumInactiveRate"],
    ["--execution-timeout", "executionTimeout"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--force") {
      args.force = true;
      continue;
    }
    if (valueFlags.has(current)) {
      const next = argv[index + 1];
      if (!next) throw new Error(`${current} requires a value`);
      const property = valueFlags.get(current);
      args[property] = next;
      index += 1;
      continue;
    }
    args.datasetArgs.push(current);
  }

  if (args.datasetArgs.includes("--generate-foundation-seed")) {
    throw new Error("foundation seed acquisition is explicit; run npm run ml:seed:foundation before bootstrap");
  }
  if (!["rebuild", "smoke"].includes(args.datasetMode)) {
    throw new Error("bootstrap dataset mode must be rebuild or smoke");
  }
  args.minimumSnapshots = parseIntegerFlag(args.minimumSnapshots, "--minimum-snapshots");
  if (args.minimumValidationRows !== null) {
    args.minimumValidationRows = parseIntegerFlag(args.minimumValidationRows, "--minimum-validation-rows");
  }
  if (args.minimumTestRows !== null) {
    args.minimumTestRows = parseIntegerFlag(args.minimumTestRows, "--minimum-test-rows");
  }
  if (args.minimumInactiveRate !== null) {
    args.minimumInactiveRate = parseRateFlag(args.minimumInactiveRate, "--minimum-inactive-rate");
  }
  parseIntegerFlag(args.executionTimeout, "--execution-timeout");
  return args;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function verifyHostArtifacts(args) {
  const datasetPath = resolveRepoPath(args.datasetPath);
  const featureCachePath = resolveRepoPath(args.featureCacheOutputPath);
  const latestRunPath = resolveRepoPath(args.latestRunPath);
  for (const requiredPath of [datasetPath, featureCachePath, latestRunPath]) {
    if (!existsSync(requiredPath)) throw new Error(`expected notebook output at ${requiredPath}`);
  }
  const latest = JSON.parse(readFileSync(latestRunPath, "utf-8"));
  if (!latest.metrics || !latest.splitSummary || !latest.datasetHash) {
    throw new Error("latest model artifact is missing metrics, split summary, or dataset hash");
  }
  if (latest.splitSummary.validationRows < args.minimumValidationRows) {
    throw new Error(`validation rows ${latest.splitSummary.validationRows} are below ${args.minimumValidationRows}`);
  }
  if (latest.splitSummary.testRows < args.minimumTestRows) {
    throw new Error(`test rows ${latest.splitSummary.testRows} are below ${args.minimumTestRows}`);
  }
  if (latest.metrics.positiveRate < args.minimumInactiveRate) {
    throw new Error(`inactive rate ${latest.metrics.positiveRate} is below ${args.minimumInactiveRate}`);
  }
  return latest;
}

async function bootstrap(rawArgs) {
  const args = parseBootstrapArgs(rawArgs);
  const dataset = parseBuildDatasetArgs(["build-all", ...args.datasetArgs]);
  const foundation = resolveRepoPath(dataset.seedFile).includes(path.join("tmp", "training-foundation"));
  args.minimumValidationRows ??= foundation ? 25 : 1;
  args.minimumTestRows ??= foundation ? 25 : 1;
  args.minimumInactiveRate ??= foundation ? 0.01 : 0;
  args.datasetPath = dataset.trainingOutputPath;
  args.featureCacheOutputPath = dataset.featureCacheOutputPath;

  const trainArgs = [
    "--dataset-mode", args.datasetMode,
    "--dataset-path", dataset.trainingOutputPath,
    "--feature-cache-path", dataset.featureCacheOutputPath,
    "--intermediate-dir", dataset.outputDir,
    "--seed-file", dataset.seedFile,
    "--runs-dir", args.runsDir,
    "--latest-run-path", args.latestRunPath,
    "--observation-start", dataset.observationStart,
    "--observation-end", dataset.observationEnd,
    "--observation-interval-months", dataset.observationIntervalMonths,
    "--label-horizon-months", dataset.labelHorizonMonths,
    "--sample-limit-per-ecosystem", dataset.sampleLimitPerEcosystem,
    "--sample-seed", dataset.sampleSeed,
    "--minimum-repositories", dataset.minimumRepositories,
    "--minimum-snapshots", `${args.minimumSnapshots}`,
    "--execution-timeout", args.executionTimeout,
    "--runner", dataset.runner,
    ...dataset.gharchiveSources.flatMap((source) => ["--gharchive-source", source]),
    ...(dataset.replaceTrainingOutput ? ["--replace-training-output"] : ["--merge-training-output"]),
    ...(args.force ? ["--force"] : []),
    ...(args.modelName ? ["--model-name", args.modelName] : []),
  ];
  await trainArtifacts(trainArgs);
  const latest = verifyHostArtifacts(args);
  console.log(`offline training status: ${latest.status}`);
  console.log(`model: ${latest.modelName} ${latest.modelVersion}`);
  console.log(`splits: ${latest.splitSummary.trainRows}/${latest.splitSummary.validationRows}/${latest.splitSummary.testRows}`);
  console.log(`dataset path: ${path.relative(repoRoot, resolveRepoPath(args.datasetPath))}`);
  console.log(`repository feature cache: ${path.relative(repoRoot, resolveRepoPath(args.featureCacheOutputPath))}`);
  console.log(`latest run pointer: ${path.relative(repoRoot, resolveRepoPath(args.latestRunPath))}`);
}

try {
  await bootstrap(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
