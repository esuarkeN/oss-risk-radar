import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptSeedPath = path.join(__dirname, "starter-seed-packages.csv");

function parseArgs(argv) {
  const args = {
    command: "build-all",
    gharchiveSources: [],
    observationStart: "2023-01-01",
    observationEnd: "2024-01-01",
    observationIntervalMonths: "3",
    labelHorizonMonths: "12",
    sampleLimitPerEcosystem: "24",
    sampleLimitPerEcosystemProvided: false,
    sampleSeed: "42",
    includeForks: false,
    seedFileProvided: false,
    generateFoundationSeed: false,
    foundationTargetRepositories: "2000",
    minimumRepositories: "0",
    minimumInactiveRepositories: "0",
  };

  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }

    const next = argv[index + 1];
    switch (current) {
      case "--gharchive-source":
        if (!next) {
          throw new Error("--gharchive-source requires a value");
        }
        args.gharchiveSources.push(next);
        index += 1;
        break;
      case "--seed-file":
        args.seedFile = next;
        args.seedFileProvided = true;
        index += 1;
        break;
      case "--output-dir":
        args.outputDir = next;
        index += 1;
        break;
      case "--training-output-path":
        args.trainingOutputPath = next;
        index += 1;
        break;
      case "--observation-start":
        args.observationStart = next;
        index += 1;
        break;
      case "--observation-end":
        args.observationEnd = next;
        index += 1;
        break;
      case "--observation-interval-months":
        args.observationIntervalMonths = next;
        index += 1;
        break;
      case "--label-horizon-months":
        args.labelHorizonMonths = next;
        index += 1;
        break;
      case "--sample-limit-per-ecosystem":
        args.sampleLimitPerEcosystem = next;
        args.sampleLimitPerEcosystemProvided = true;
        index += 1;
        break;
      case "--sample-seed":
        args.sampleSeed = next;
        index += 1;
        break;
      case "--github-token":
        args.githubToken = next;
        index += 1;
        break;
      case "--include-forks":
        args.includeForks = true;
        break;
      case "--generate-foundation-seed":
        args.generateFoundationSeed = true;
        break;
      case "--foundation-target-repositories":
        args.foundationTargetRepositories = next;
        index += 1;
        break;
      case "--minimum-repositories":
        args.minimumRepositories = next;
        index += 1;
        break;
      case "--minimum-inactive-repositories":
        args.minimumInactiveRepositories = next;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
  }

  if (positionals.length > 0) {
    args.command = positionals[0];
  }

  args.outputDir = args.outputDir ?? path.join("tmp", "training", "oss-maintenance");
  args.trainingOutputPath = args.trainingOutputPath ?? path.join("tmp", "training", "snapshots.json");
  args.seedFile = args.seedFile ?? path.join("tmp", "training", "starter-seed-packages.csv");
  return args;
}

function ensureStarterSeedFile(seedFile) {
  const resolved = resolveRepoPath(seedFile);
  if (!existsSync(resolved)) {
    mkdirSync(path.dirname(resolved), { recursive: true });
    copyFileSync(scriptSeedPath, resolved);
  }
  return resolved;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function toContainerPath(value) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const resolved = resolveRepoPath(value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..")) {
    throw new Error(`path must stay inside the repository when using the Docker dataset runner: ${value}`);
  }
  return `/workspace/${relative.split(path.sep).join("/")}`;
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

function summarizeDataset(datasetPath) {
  const payload = JSON.parse(readFileSync(datasetPath, "utf-8"));
  const snapshots = Array.isArray(payload) ? payload : payload.snapshots ?? [];
  const labeledRows = snapshots.filter((item) => item.label_inactive_12m !== null && item.label_inactive_12m !== undefined).length;
  const repositories = new Set();
  const activeRepositories = new Set();
  const inactiveRepositories = new Set();
  for (const snapshot of snapshots) {
    const dependency = snapshot.dependency ?? {};
    const repository = dependency.repository ?? {};
    const repositoryKey = repository.url ?? repository.full_name ?? `${dependency.ecosystem ?? "unknown"}:${dependency.package_name ?? "unknown"}`;
    repositories.add(repositoryKey);
    if (snapshot.label_inactive_12m === true) {
      inactiveRepositories.add(repositoryKey);
    }
    if (snapshot.label_inactive_12m === false) {
      activeRepositories.add(repositoryKey);
    }
  }
  return {
    totalRows: snapshots.length,
    labeledRows,
    uniqueRepositories: repositories.size,
    activeRepositories: activeRepositories.size,
    inactiveRepositories: inactiveRepositories.size,
  };
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be an integer >= 0`);
  }
  return parsed;
}

function defaultMinimumInactiveRepositories(targetRepositories) {
  return Math.max(10, Math.floor(targetRepositories * 0.05));
}

function verifyDatasetSummary(args, summary) {
  const minimumRepositories = parsePositiveInteger(args.minimumRepositories, "--minimum-repositories");
  const minimumInactiveRepositories = parsePositiveInteger(
    args.minimumInactiveRepositories,
    "--minimum-inactive-repositories"
  );

  if (summary.uniqueRepositories < minimumRepositories) {
    throw new Error(
      `historical dataset exported only ${summary.uniqueRepositories} unique repositories, below the required ${minimumRepositories}`
    );
  }
  if (summary.inactiveRepositories < minimumInactiveRepositories) {
    throw new Error(
      `historical dataset exported only ${summary.inactiveRepositories} inactive repositories, below the required ${minimumInactiveRepositories}`
    );
  }
}

export async function buildDataset(args) {
  const commandNeedsSeed = new Set(["ingest", "build-all"]);
  const commandNeedsHistory = new Set(["build-snapshots", "build-labels", "build-all"]);
  if (args.generateFoundationSeed && !commandNeedsSeed.has(args.command)) {
    throw new Error("--generate-foundation-seed can only be used with ingest or build-all");
  }
  if (args.generateFoundationSeed) {
    const foundationTargetRepositories = parsePositiveInteger(
      args.foundationTargetRepositories,
      "--foundation-target-repositories"
    );
    if (!args.seedFileProvided) {
      args.seedFile = path.join("tmp", "training", "foundation-seed.csv");
    }
    if (!args.sampleLimitPerEcosystemProvided) {
      args.sampleLimitPerEcosystem = `${foundationTargetRepositories}`;
    }
    if (parsePositiveInteger(args.minimumRepositories, "--minimum-repositories") === 0) {
      args.minimumRepositories = `${foundationTargetRepositories}`;
    }
    if (parsePositiveInteger(args.minimumInactiveRepositories, "--minimum-inactive-repositories") === 0) {
      args.minimumInactiveRepositories = `${defaultMinimumInactiveRepositories(foundationTargetRepositories)}`;
    }
  }
  if (commandNeedsHistory.has(args.command) && args.gharchiveSources.length === 0) {
    throw new Error("at least one --gharchive-source is required for build-snapshots, build-labels, or build-all");
  }

  let seedFile = commandNeedsSeed.has(args.command)
    ? (args.generateFoundationSeed ? resolveRepoPath(args.seedFile) : ensureStarterSeedFile(args.seedFile))
    : resolveRepoPath(args.seedFile);
  if (args.generateFoundationSeed) {
    const { generateFoundationSeed } = await import("./generate-foundation-seed.mjs");
    await generateFoundationSeed([
      "--output-file",
      seedFile,
      "--target-repositories",
      args.foundationTargetRepositories,
      ...(args.githubToken ? ["--github-token", args.githubToken] : []),
    ]);
    seedFile = resolveRepoPath(seedFile);
  }
  const outputDir = resolveRepoPath(args.outputDir);
  const trainingOutputPath = resolveRepoPath(args.trainingOutputPath);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(path.dirname(trainingOutputPath), { recursive: true });

  const dockerArgs = [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${repoRoot}:/workspace`,
    "--workdir",
    "/workspace/mltraining/scoring",
    "scoring",
    "python",
    "-m",
    "app.training.maintenance_dataset.cli",
    args.command,
    "--output-dir",
    toContainerPath(outputDir),
    "--observation-start",
    args.observationStart,
    "--observation-end",
    args.observationEnd,
    "--observation-interval-months",
    args.observationIntervalMonths,
    "--label-horizon-months",
    args.labelHorizonMonths,
    "--sample-limit-per-ecosystem",
    args.sampleLimitPerEcosystem,
    "--sample-seed",
    args.sampleSeed,
    "--training-output-path",
    toContainerPath(trainingOutputPath),
  ];

  if (commandNeedsSeed.has(args.command)) {
    dockerArgs.push("--seed-file", toContainerPath(seedFile));
  }
  if (args.githubToken ?? process.env.GITHUB_TOKEN) {
    dockerArgs.push("--github-token", args.githubToken ?? process.env.GITHUB_TOKEN);
  }
  if (args.includeForks) {
    dockerArgs.push("--include-forks");
  }
  for (const source of args.gharchiveSources) {
    dockerArgs.push("--gharchive-source", toContainerPath(source));
  }

  console.log(`seed file: ${path.relative(repoRoot, seedFile)}`);
  console.log(`dataset output dir: ${path.relative(repoRoot, outputDir)}`);
  console.log(`training snapshot export: ${path.relative(repoRoot, trainingOutputPath)}`);
  await runCommand("docker", dockerArgs);

  if (args.command === "build-all" || args.command === "export") {
    if (!existsSync(trainingOutputPath)) {
      throw new Error(`dataset export was not created at ${trainingOutputPath}`);
    }
    const summary = summarizeDataset(trainingOutputPath);
    console.log(`dataset rows: ${summary.totalRows}`);
    console.log(`labeled rows: ${summary.labeledRows}`);
    console.log(`unique repositories: ${summary.uniqueRepositories}`);
    console.log(`active repositories: ${summary.activeRepositories}`);
    console.log(`inactive repositories: ${summary.inactiveRepositories}`);
    verifyDatasetSummary(args, summary);
  }

  return { seedFile, outputDir, trainingOutputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await buildDataset(args);
}

await main();
