import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const localNotebookPath = path.join(repoRoot, "notebooks", "oss-maintenance-training.ipynb");
const localExecutedNotebookPath = path.join(repoRoot, "tmp", "notebooks", "oss-maintenance-training.executed.ipynb");
const containerNotebookPath = "/workspace/notebooks/oss-maintenance-training.ipynb";
const containerExecutedNotebookPath = "/workspace/tmp/notebooks/oss-maintenance-training.executed.ipynb";
const DEFAULT_MODEL_NAMES = [
  "logistic-regression-full-history",
  "xgboost-full-history",
  "logistic-regression-cold-start",
  "xgboost-cold-start",
];

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

function baseDockerArgs() {
  return [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${repoRoot}:/workspace`,
    "--workdir",
    "/workspace",
  ];
}

function parseArgs(argv) {
  const args = { command: "start", runner: "docker" };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("--")) {
    args.command = rest.shift();
  }
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    const next = rest[index + 1];
    switch (current) {
      case "--":
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

async function startNotebook(runner) {
  if (runner === "docker") {
    await runCommand("docker", [
      ...baseDockerArgs(),
      "--publish",
      `${process.env.JUPYTER_PORT ?? "8888"}:8888`,
      "scoring",
      "python",
      "-m",
      "jupyter",
      "lab",
      "--ip=0.0.0.0",
      "--port=8888",
      "--no-browser",
      "--allow-root",
    ]);
    return;
  }

  await runCommand("python", [
    "-m",
    "jupyter",
    "lab",
    "--notebook-dir",
    repoRoot,
    "--port",
    process.env.JUPYTER_PORT ?? "8888",
    "--no-browser",
  ]);
}

async function executeNotebook(runner) {
  mkdirSync(path.join(repoRoot, "tmp", "notebooks"), { recursive: true });
  const parameters = {
    dataset_path:
      runner === "docker"
        ? "/workspace/tmp/notebooks/oss-maintenance-training.smoke-snapshots.json"
        : path.join(repoRoot, "tmp", "notebooks", "oss-maintenance-training.smoke-snapshots.json"),
    runs_dir:
      runner === "docker"
        ? "/workspace/tmp/notebooks/training-runs"
        : path.join(repoRoot, "tmp", "notebooks", "training-runs"),
    latest_run_path:
      runner === "docker"
        ? "/workspace/tmp/notebooks/latest-run.json"
        : path.join(repoRoot, "tmp", "notebooks", "latest-run.json"),
    model_names: DEFAULT_MODEL_NAMES,
    train_ratio: 0.5,
    validation_ratio: 0.25,
    calibration_bins: 5,
    force: true,
    export_artifacts: true,
    use_smoke_dataset: true,
  };

  if (runner === "docker") {
    await runCommand("docker", [
      ...baseDockerArgs(),
      "scoring",
      "python",
      "-m",
      "papermill",
      "--cwd",
      "/workspace",
      "--execution-timeout",
      "600",
      "--log-output",
      containerNotebookPath,
      containerExecutedNotebookPath,
      "-y",
      JSON.stringify(parameters),
    ]);
    return;
  }

  await runCommand("python", [
    "-m",
    "papermill",
    "--cwd",
    repoRoot,
    "--execution-timeout",
    "600",
    "--log-output",
    localNotebookPath,
    localExecutedNotebookPath,
    "-y",
    JSON.stringify(parameters),
  ]);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "start") {
    await startNotebook(args.runner);
  } else if (args.command === "execute") {
    await executeNotebook(args.runner);
  } else {
    throw new Error(`unknown notebook command: ${args.command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
