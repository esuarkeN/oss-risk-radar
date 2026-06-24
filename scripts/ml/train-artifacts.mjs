import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const localNotebookPath = path.join(repoRoot, "notebooks", "oss-maintenance-training.ipynb");
const localExecutedNotebookPath = path.join(repoRoot, "tmp", "notebooks", "oss-maintenance-training.artifacts.executed.ipynb");
const containerNotebookPath = "/workspace/notebooks/oss-maintenance-training.ipynb";
const containerExecutedNotebookPath = "/workspace/tmp/notebooks/oss-maintenance-training.artifacts.executed.ipynb";
const DEFAULT_MODEL_NAMES = [
  "logistic-regression-full-history",
  "xgboost-full-history",
  "logistic-regression-cold-start",
  "xgboost-cold-start",
];

function localPythonCommand() {
  const configured = process.env.PYTHON?.trim();
  if (configured) return configured;
  const virtualEnvironmentPython = path.join(
    repoRoot,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  if (existsSync(virtualEnvironmentPython)) return virtualEnvironmentPython;
  return process.platform === "win32" ? "python" : "python3";
}

function parseArgs(argv) {
  const args = {
    datasetMode: "processed",
    datasetPath: path.join("tmp", "training", "snapshots.json"),
    featureCachePath: path.join("tmp", "training", "repository-feature-cache.json"),
    intermediateDir: path.join("tmp", "training", "oss-maintenance"),
    seedFile: "",
    gharchiveSources: [],
    runsDir: path.join("tmp", "training", "runs"),
    latestRunPath: path.join("tmp", "training", "latest-run.json"),
    modelNames: [],
    observationStart: "2023-01-01",
    observationEnd: "2024-01-01",
    observationIntervalMonths: "3",
    labelHorizonMonths: "12",
    sampleLimitPerEcosystem: "5000",
    sampleSeed: "42",
    minimumRepositories: "0",
    minimumSnapshots: "3",
    requireCompleteCoverage: true,
    replaceTrainingOutput: true,
    force: false,
    trainRatio: "0.75",
    validationRatio: "0.15",
    calibrationBins: "10",
    executionTimeout: "900",
    runner: "docker",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    const setValue = (property, flag) => {
      if (!next) throw new Error(`${flag} requires a value`);
      args[property] = next;
      index += 1;
    };
    switch (current) {
      case "--":
        break;
      case "--dataset-mode":
        setValue("datasetMode", current);
        break;
      case "--dataset-path":
      case "--training-output-path":
        setValue("datasetPath", current);
        break;
      case "--feature-cache-path":
      case "--feature-cache-output-path":
        setValue("featureCachePath", current);
        break;
      case "--intermediate-dir":
      case "--output-dir":
        setValue("intermediateDir", current);
        break;
      case "--seed-file":
        setValue("seedFile", current);
        break;
      case "--gharchive-source":
        if (!next) throw new Error("--gharchive-source requires a value");
        args.gharchiveSources.push(next);
        index += 1;
        break;
      case "--runs-dir":
        setValue("runsDir", current);
        break;
      case "--latest-run-path":
        setValue("latestRunPath", current);
        break;
      case "--model-name":
        if (!next) throw new Error("--model-name requires a value");
        args.modelNames.push(next);
        index += 1;
        break;
      case "--observation-start":
        setValue("observationStart", current);
        break;
      case "--observation-end":
        setValue("observationEnd", current);
        break;
      case "--observation-interval-months":
        setValue("observationIntervalMonths", current);
        break;
      case "--label-horizon-months":
        setValue("labelHorizonMonths", current);
        break;
      case "--sample-limit-per-ecosystem":
        setValue("sampleLimitPerEcosystem", current);
        break;
      case "--sample-seed":
        setValue("sampleSeed", current);
        break;
      case "--minimum-repositories":
        setValue("minimumRepositories", current);
        break;
      case "--minimum-snapshots":
        setValue("minimumSnapshots", current);
        break;
      case "--allow-incomplete-coverage":
        args.requireCompleteCoverage = false;
        break;
      case "--merge-training-output":
        args.replaceTrainingOutput = false;
        break;
      case "--replace-training-output":
        args.replaceTrainingOutput = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--train-ratio":
        setValue("trainRatio", current);
        break;
      case "--validation-ratio":
        setValue("validationRatio", current);
        break;
      case "--calibration-bins":
        setValue("calibrationBins", current);
        break;
      case "--execution-timeout":
        setValue("executionTimeout", current);
        break;
      case "--runner":
        setValue("runner", current);
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
  }

  if (!["processed", "rebuild", "smoke"].includes(args.datasetMode)) {
    throw new Error("--dataset-mode must be processed, rebuild, or smoke");
  }
  if (!["docker", "local"].includes(args.runner)) {
    throw new Error("--runner must be either docker or local");
  }
  if (args.datasetMode === "rebuild" && (!args.seedFile || args.gharchiveSources.length === 0)) {
    throw new Error("rebuild mode requires --seed-file and at least one --gharchive-source");
  }
  return args;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function toContainerPath(value) {
  const resolved = resolveRepoPath(value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..")) {
    throw new Error(`path must stay inside the repository when using Docker: ${value}`);
  }
  return `/workspace/${relative.split(path.sep).join("/")}`;
}

function toNotebookPath(value, runner) {
  if (!value) return "";
  return runner === "docker" ? toContainerPath(value) : resolveRepoPath(value);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function numericParameter(value, flagName) {
  const parsed = Number.parseFloat(`${value ?? ""}`.trim());
  if (!Number.isFinite(parsed)) throw new Error(`${flagName} must be a number`);
  return parsed;
}

function integerParameter(value, flagName, minimum = 0) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${flagName} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function verifyArtifacts(args) {
  const runsDir = resolveRepoPath(args.runsDir);
  const latestRunPath = resolveRepoPath(args.latestRunPath);
  if (!existsSync(latestRunPath)) throw new Error(`expected latest run artifact at ${latestRunPath}`);
  const latest = readJson(latestRunPath);
  if (latest.status !== "completed" || !latest.modelArtifact || !latest.datasetHash) {
    throw new Error("latest run artifact is not a completed model artifact");
  }

  const requestedModels = args.modelNames.length && !args.modelNames.includes("all") ? args.modelNames : DEFAULT_MODEL_NAMES;
  const required = new Set(requestedModels);
  for (const item of readdirSync(runsDir, { withFileTypes: true })) {
    if (item.isDirectory() || path.extname(item.name) !== ".json") continue;
    const run = readJson(path.join(runsDir, item.name));
    if (run.status === "completed" && run.modelArtifact && run.datasetHash === latest.datasetHash) {
      required.delete(run.modelName);
    }
  }
  if (required.size > 0) throw new Error(`missing completed model artifacts: ${[...required].join(", ")}`);
  return latest;
}

export async function trainArtifacts(rawArgs) {
  const args = parseArgs(rawArgs);
  mkdirSync(path.join(repoRoot, "tmp", "notebooks"), { recursive: true });
  const notebookParameters = {
    dataset_mode: args.datasetMode,
    dataset_path: toNotebookPath(args.datasetPath, args.runner),
    feature_cache_path: toNotebookPath(args.featureCachePath, args.runner),
    intermediate_dir: toNotebookPath(args.intermediateDir, args.runner),
    seed_file: toNotebookPath(args.seedFile, args.runner),
    gharchive_sources: args.gharchiveSources.map((source) => toNotebookPath(source, args.runner)),
    runs_dir: toNotebookPath(args.runsDir, args.runner),
    latest_run_path: toNotebookPath(args.latestRunPath, args.runner),
    model_names: args.modelNames,
    observation_start: args.observationStart,
    observation_end: args.observationEnd,
    observation_interval_months: integerParameter(args.observationIntervalMonths, "--observation-interval-months", 1),
    label_horizon_months: integerParameter(args.labelHorizonMonths, "--label-horizon-months", 1),
    sample_limit_per_ecosystem: integerParameter(args.sampleLimitPerEcosystem, "--sample-limit-per-ecosystem", 1),
    sample_seed: integerParameter(args.sampleSeed, "--sample-seed"),
    minimum_repositories: integerParameter(args.minimumRepositories, "--minimum-repositories"),
    minimum_snapshots: integerParameter(args.minimumSnapshots, "--minimum-snapshots", 3),
    require_complete_coverage: args.requireCompleteCoverage,
    replace_training_output: args.replaceTrainingOutput,
    train_ratio: numericParameter(args.trainRatio, "--train-ratio"),
    validation_ratio: numericParameter(args.validationRatio, "--validation-ratio"),
    calibration_bins: integerParameter(args.calibrationBins, "--calibration-bins", 1),
    execution_timeout_seconds: integerParameter(args.executionTimeout, "--execution-timeout", 1),
    force: args.force,
    export_artifacts: true,
  };

  const papermillArgs = [
    "-m", "papermill", "--cwd", args.runner === "docker" ? "/workspace" : repoRoot,
    "--execution-timeout", args.executionTimeout, "--log-output",
    args.runner === "docker" ? containerNotebookPath : localNotebookPath,
    args.runner === "docker" ? containerExecutedNotebookPath : localExecutedNotebookPath,
    "-y", JSON.stringify(notebookParameters),
  ];
  if (args.runner === "docker") {
    await runCommand("docker", [
      "compose", "run", "--rm", "--no-deps", "--volume", `${repoRoot}:/workspace`,
      "--workdir", "/workspace", "scoring", "python", ...papermillArgs,
    ]);
  } else {
    await runCommand(localPythonCommand(), papermillArgs);
  }

  const latest = verifyArtifacts(args);
  console.log(`offline artifact status: ${latest.status}`);
  console.log(`latest model: ${latest.modelName} ${latest.modelVersion}`);
  console.log(`latest artifact: ${path.relative(repoRoot, resolveRepoPath(args.latestRunPath))}`);
  console.log(`dataset hash: ${latest.datasetHash}`);
  if (latest.metrics) {
    console.log(`quality: ${latest.metrics.qualityScore}`);
    console.log(`auroc: ${latest.metrics.rocAuc}`);
    console.log(`brier: ${latest.metrics.brierScore}`);
  }
}

if (path.resolve(process.argv[1] ?? "") === __filename) {
  try {
    await trainArtifacts(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
