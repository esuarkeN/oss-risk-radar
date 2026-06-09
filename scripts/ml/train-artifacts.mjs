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

function parseArgs(argv) {
  const args = {
    datasetPath: path.join("tmp", "training", "snapshots.json"),
    runsDir: path.join("tmp", "training", "runs"),
    latestRunPath: path.join("tmp", "training", "latest-run.json"),
    modelNames: [],
    force: false,
    trainRatio: "0.75",
    validationRatio: "0.15",
    calibrationBins: "10",
    runner: "docker",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--":
        break;
      case "--dataset-path":
        if (!next) throw new Error("--dataset-path requires a value");
        args.datasetPath = next;
        index += 1;
        break;
      case "--runs-dir":
        if (!next) throw new Error("--runs-dir requires a value");
        args.runsDir = next;
        index += 1;
        break;
      case "--latest-run-path":
        if (!next) throw new Error("--latest-run-path requires a value");
        args.latestRunPath = next;
        index += 1;
        break;
      case "--model-name":
        if (!next) throw new Error("--model-name requires a value");
        args.modelNames.push(next);
        index += 1;
        break;
      case "--force":
        args.force = true;
        break;
      case "--train-ratio":
        if (!next) throw new Error("--train-ratio requires a value");
        args.trainRatio = next;
        index += 1;
        break;
      case "--validation-ratio":
        if (!next) throw new Error("--validation-ratio requires a value");
        args.validationRatio = next;
        index += 1;
        break;
      case "--calibration-bins":
        if (!next) throw new Error("--calibration-bins requires a value");
        args.calibrationBins = next;
        index += 1;
        break;
      case "--runner":
        if (!next) throw new Error("--runner requires a value");
        if (!["docker", "local"].includes(next)) {
          throw new Error("--runner must be either docker or local");
        }
        args.runner = next;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
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
    throw new Error(`path must stay inside the repository when using the Docker artifact runner: ${value}`);
  }
  return `/workspace/${relative.split(path.sep).join("/")}`;
}

function toNotebookPath(value, runner) {
  return runner === "docker" ? toContainerPath(value) : resolveRepoPath(value);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function numericParameter(value, flagName) {
  const parsed = Number.parseFloat(`${value ?? ""}`.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flagName} must be a number`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function verifyArtifacts(args) {
  const runsDir = resolveRepoPath(args.runsDir);
  const latestRunPath = resolveRepoPath(args.latestRunPath);
  if (!existsSync(latestRunPath)) {
    throw new Error(`expected latest run artifact at ${latestRunPath}`);
  }
  const latest = readJson(latestRunPath);
  if (latest.status !== "completed" || !latest.modelArtifact) {
    throw new Error("latest run artifact is not a completed model artifact");
  }

  const requestedModels = args.modelNames.length && !args.modelNames.includes("all")
    ? args.modelNames
    : DEFAULT_MODEL_NAMES;
  const required = new Set(requestedModels);
  for (const item of readdirSync(runsDir, { withFileTypes: true })) {
    if (item.isDirectory() || path.extname(item.name) !== ".json") continue;
    const run = readJson(path.join(runsDir, item.name));
    if (run.status === "completed" && run.modelArtifact) {
      required.delete(run.modelName);
    }
  }
  if (required.size > 0) {
    throw new Error(`missing completed model artifacts: ${[...required].join(", ")}`);
  }
  return latest;
}

export async function trainArtifacts(rawArgs) {
  const args = parseArgs(rawArgs);
  mkdirSync(path.join(repoRoot, "tmp", "notebooks"), { recursive: true });
  const notebookParameters = {
    dataset_path: toNotebookPath(args.datasetPath, args.runner),
    runs_dir: toNotebookPath(args.runsDir, args.runner),
    latest_run_path: toNotebookPath(args.latestRunPath, args.runner),
    model_names: args.modelNames,
    train_ratio: numericParameter(args.trainRatio, "--train-ratio"),
    validation_ratio: numericParameter(args.validationRatio, "--validation-ratio"),
    calibration_bins: Number.parseInt(args.calibrationBins, 10),
    force: args.force,
    export_artifacts: true,
    use_smoke_dataset: false,
  };
  if (!Number.isInteger(notebookParameters.calibration_bins) || notebookParameters.calibration_bins <= 0) {
    throw new Error("--calibration-bins must be a positive integer");
  }

  if (args.runner === "docker") {
    await runCommand("docker", [
      "compose",
      "run",
      "--rm",
      "--no-deps",
      "--volume",
      `${repoRoot}:/workspace`,
      "--workdir",
      "/workspace",
      "scoring",
      "python",
      "-m",
      "papermill",
      "--cwd",
      "/workspace",
      "--execution-timeout",
      "900",
      "--log-output",
      containerNotebookPath,
      containerExecutedNotebookPath,
      "-y",
      JSON.stringify(notebookParameters),
    ]);
  } else {
    await runCommand("python", [
      "-m",
      "papermill",
      "--cwd",
      repoRoot,
      "--execution-timeout",
      "900",
      "--log-output",
      localNotebookPath,
      localExecutedNotebookPath,
      "-y",
      JSON.stringify(notebookParameters),
    ]);
  }

  const latest = await verifyArtifacts(args);
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
