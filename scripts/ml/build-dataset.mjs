import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const scoringRoot = path.join(repoRoot, "mltraining", "scoring");
const scriptSeedPath = path.join(__dirname, "starter-seed-packages.csv");
const KNOWN_COMMANDS = new Set(["ingest", "build-snapshots", "build-labels", "build-all"]);

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

export function parseArgs(argv) {
  const args = {
    command: "build-all",
    gharchiveSources: [],
    observationStart: "2023-01-01",
    observationEnd: "2024-01-01",
    observationEndProvided: false,
    observationIntervalMonths: "3",
    labelHorizonMonths: "12",
    sampleLimitPerEcosystem: "24",
    sampleLimitPerEcosystemProvided: false,
    sampleSeed: "42",
    offlineRepositoryMetadata: false,
    includeForks: false,
    replaceTrainingOutput: false,
    featureCacheOutputPath: null,
    seedFileProvided: false,
    generateFoundationSeed: false,
    foundationTargetRepositories: "5000",
    foundationMinimumStars: "100",
    minimumRepositories: "0",
    minimumInactiveRepositories: "0",
    runner: "docker",
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
      case "--feature-cache-output-path":
        args.featureCacheOutputPath = next;
        index += 1;
        break;
      case "--observation-start":
        args.observationStart = next;
        index += 1;
        break;
      case "--observation-end":
        args.observationEnd = next;
        args.observationEndProvided = true;
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
      case "--offline-repository-metadata":
        args.offlineRepositoryMetadata = true;
        break;
      case "--replace-training-output":
        args.replaceTrainingOutput = true;
        break;
      case "--generate-foundation-seed":
        args.generateFoundationSeed = true;
        break;
      case "--foundation-target-repositories":
        args.foundationTargetRepositories = next;
        index += 1;
        break;
      case "--foundation-minimum-stars":
        args.foundationMinimumStars = next;
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

  if (positionals.length > 0 && KNOWN_COMMANDS.has(positionals[0])) {
    args.command = positionals[0];
  }

  applyNpmForwardedConfig(args, positionals);
  args.outputDir = args.outputDir ?? path.join("tmp", "training", "oss-maintenance");
  args.trainingOutputPath = args.trainingOutputPath ?? path.join("tmp", "training", "snapshots.json");
  args.featureCacheOutputPath = args.featureCacheOutputPath ?? path.join("tmp", "training", "repository-feature-cache.json");
  args.seedFile = args.seedFile ?? path.join("tmp", "training", "starter-seed-packages.csv");
  return args;
}

function npmConfig(name) {
  return process.env[`npm_config_${name.replaceAll("-", "_")}`];
}

function npmBooleanConfig(name) {
  const value = npmConfig(name);
  return value === "true" || value === "1" || value === "";
}

function leakedNpmValues(positionals) {
  return positionals.filter((value) => !KNOWN_COMMANDS.has(value));
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

function applyStringConfig(args, property, flagName, leakedValues) {
  const value = npmStringConfig(flagName, leakedValues);
  if (value !== undefined && value !== "") {
    args[property] = value;
  }
}

function applyNpmForwardedConfig(args, positionals) {
  const leakedValues = leakedNpmValues(positionals);
  const runner = npmStringConfig("runner", leakedValues);
  if (runner) {
    if (!["docker", "local"].includes(runner)) {
      throw new Error("--runner must be either docker or local");
    }
    args.runner = runner;
  }

  const gharchiveSource = npmStringConfig("gharchive-source", leakedValues);
  if (args.gharchiveSources.length === 0 && gharchiveSource) {
    args.gharchiveSources.push(gharchiveSource);
  }

  applyStringConfig(args, "seedFile", "seed-file", leakedValues);
  applyStringConfig(args, "outputDir", "output-dir", leakedValues);
  applyStringConfig(args, "trainingOutputPath", "training-output-path", leakedValues);
  applyStringConfig(args, "featureCacheOutputPath", "feature-cache-output-path", leakedValues);
  applyStringConfig(args, "observationStart", "observation-start", leakedValues);
  applyStringConfig(args, "observationEnd", "observation-end", leakedValues);
  applyStringConfig(args, "observationIntervalMonths", "observation-interval-months", leakedValues);
  applyStringConfig(args, "labelHorizonMonths", "label-horizon-months", leakedValues);
  applyStringConfig(args, "sampleLimitPerEcosystem", "sample-limit-per-ecosystem", leakedValues);
  applyStringConfig(args, "sampleSeed", "sample-seed", leakedValues);
  applyStringConfig(args, "githubToken", "github-token", leakedValues);
  applyStringConfig(args, "foundationTargetRepositories", "foundation-target-repositories", leakedValues);
  applyStringConfig(args, "foundationMinimumStars", "foundation-minimum-stars", leakedValues);
  applyStringConfig(args, "minimumRepositories", "minimum-repositories", leakedValues);
  applyStringConfig(args, "minimumInactiveRepositories", "minimum-inactive-repositories", leakedValues);
  if (npmConfig("observation-end") !== undefined) {
    args.observationEndProvided = true;
  }
  if (npmConfig("sample-limit-per-ecosystem") !== undefined) {
    args.sampleLimitPerEcosystemProvided = true;
  }
  if (npmConfig("seed-file") !== undefined) {
    args.seedFileProvided = true;
  }
  if (npmBooleanConfig("include-forks")) {
    args.includeForks = true;
  }
  if (npmBooleanConfig("offline-repository-metadata")) {
    args.offlineRepositoryMetadata = true;
  }
  if (npmBooleanConfig("replace-training-output")) {
    args.replaceTrainingOutput = true;
  }
  if (npmBooleanConfig("generate-foundation-seed")) {
    args.generateFoundationSeed = true;
  }
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

function toRunnerPath(value, runner) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return runner === "docker" ? toContainerPath(value) : resolveRepoPath(value);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
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

function parseDateOnly(value, flagName) {
  const match = `${value ?? ""}`.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`${flagName} must be a date in YYYY-MM-DD format`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function addMonths(value, months) {
  const monthIndex = value.getUTCMonth() + months;
  const year = value.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(value.getUTCDate(), 28);
  return new Date(Date.UTC(year, month, day));
}

function findLatestCompleteGharchiveDate(sources) {
  const hoursByDate = new Map();
  for (const source of sources) {
    if (/^https?:\/\//i.test(source)) {
      continue;
    }
    const resolved = resolveRepoPath(source);
    if (!existsSync(resolved)) {
      continue;
    }
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      const name = path.basename(resolved);
      const match = name.match(/^(\d{4}-\d{2}-\d{2})-(\d{1,2})\.json\.gz$/);
      if (match) {
        const hours = hoursByDate.get(match[1]) ?? new Set();
        hours.add(Number(match[2]));
        hoursByDate.set(match[1], hours);
      }
      continue;
    }
    for (const item of readdirSync(resolved, { withFileTypes: true })) {
      if (item.isDirectory()) {
        continue;
      }
      const match = item.name.match(/^(\d{4}-\d{2}-\d{2})-(\d{1,2})\.json\.gz$/);
      if (!match) {
        continue;
      }
      const hours = hoursByDate.get(match[1]) ?? new Set();
      hours.add(Number(match[2]));
      hoursByDate.set(match[1], hours);
    }
  }

  const completeDates = [...hoursByDate.entries()]
    .filter(([, hours]) => hours.size === 24)
    .map(([date]) => date)
    .sort();
  return completeDates.at(-1) ?? null;
}

function latestSafeObservationEnd(args, latestCompleteCoverageDate) {
  const observationStart = parseDateOnly(args.observationStart, "--observation-start");
  const intervalMonths = parsePositiveInteger(args.observationIntervalMonths, "--observation-interval-months");
  const labelHorizonMonths = parsePositiveInteger(args.labelHorizonMonths, "--label-horizon-months");
  const latestCoverage = parseDateOnly(latestCompleteCoverageDate, "latest GHArchive coverage date");

  let current = observationStart;
  let latestSafe = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const requiredCoverageEnd = addMonths(current, labelHorizonMonths);
    if (requiredCoverageEnd > latestCoverage) {
      break;
    }
    latestSafe = current;
    current = addMonths(current, intervalMonths);
  }
  return latestSafe ? formatDateOnly(latestSafe) : null;
}

function applyDynamicCoverageDefaults(args, commandNeedsHistory) {
  if (!commandNeedsHistory.has(args.command) || args.gharchiveSources.length === 0) {
    return;
  }
  const latestCompleteCoverageDate = findLatestCompleteGharchiveDate(args.gharchiveSources);
  if (!latestCompleteCoverageDate) {
    console.log("GHArchive coverage: no complete local daily coverage inferred; using supplied observation range");
    return;
  }

  const labelHorizonMonths = parsePositiveInteger(args.labelHorizonMonths, "--label-horizon-months");
  if (args.observationEndProvided) {
    const requestedEnd = parseDateOnly(args.observationEnd, "--observation-end");
    const requiredCoverageEnd = addMonths(requestedEnd, labelHorizonMonths);
    const latestCoverage = parseDateOnly(latestCompleteCoverageDate, "latest GHArchive coverage date");
    if (requiredCoverageEnd > latestCoverage) {
      throw new Error(
        `--observation-end ${args.observationEnd} needs GHArchive coverage through ${formatDateOnly(requiredCoverageEnd)} for a ${labelHorizonMonths}-month label horizon, but local complete coverage ends at ${latestCompleteCoverageDate}`
      );
    }
    console.log(`GHArchive coverage: latest complete local date ${latestCompleteCoverageDate}; explicit observation end ${args.observationEnd} is labelable`);
    return;
  }

  const inferredEnd = latestSafeObservationEnd(args, latestCompleteCoverageDate);
  if (!inferredEnd) {
    throw new Error(
      `local GHArchive coverage through ${latestCompleteCoverageDate} is not enough to label any observation from ${args.observationStart} with a ${labelHorizonMonths}-month horizon`
    );
  }
  args.observationEnd = inferredEnd;
  console.log(`GHArchive coverage: latest complete local date ${latestCompleteCoverageDate}; inferred observation end ${args.observationEnd}`);
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
  return Math.max(25, Math.floor(targetRepositories * 0.2));
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
  applyDynamicCoverageDefaults(args, commandNeedsHistory);
  if (args.generateFoundationSeed && !commandNeedsSeed.has(args.command)) {
    throw new Error("--generate-foundation-seed can only be used with ingest or build-all");
  }
  if (args.generateFoundationSeed) {
    const foundationTargetRepositories = parsePositiveInteger(
      args.foundationTargetRepositories,
      "--foundation-target-repositories"
    );
    const foundationMinimumStars = parsePositiveInteger(
      args.foundationMinimumStars,
      "--foundation-minimum-stars"
    );
    if (foundationMinimumStars < 1) {
      throw new Error("--foundation-minimum-stars must be an integer >= 1");
    }
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
      "--metadata-output",
      seedFile.replace(/\.csv$/i, ".metadata.json"),
      "--target-repositories",
      args.foundationTargetRepositories,
      "--minimum-stars",
      args.foundationMinimumStars,
      ...(args.githubToken ? ["--github-token", args.githubToken] : []),
    ]);
    seedFile = resolveRepoPath(seedFile);
  }
  const outputDir = resolveRepoPath(args.outputDir);
  const trainingOutputPath = resolveRepoPath(args.trainingOutputPath);
  const featureCacheOutputPath = resolveRepoPath(args.featureCacheOutputPath);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(path.dirname(trainingOutputPath), { recursive: true });
  mkdirSync(path.dirname(featureCacheOutputPath), { recursive: true });

  const cliArgs = [
    "-m",
    "app.training.maintenance_dataset.cli",
    args.command,
    "--output-dir",
    toRunnerPath(outputDir, args.runner),
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
    toRunnerPath(trainingOutputPath, args.runner),
    "--feature-cache-output-path",
    toRunnerPath(featureCacheOutputPath, args.runner),
  ];

  if (commandNeedsSeed.has(args.command)) {
    cliArgs.push("--seed-file", toRunnerPath(seedFile, args.runner));
  }
  if (args.githubToken ?? process.env.GITHUB_TOKEN) {
    cliArgs.push("--github-token", args.githubToken ?? process.env.GITHUB_TOKEN);
  }
  if (args.includeForks) {
    cliArgs.push("--include-forks");
  }
  if (args.offlineRepositoryMetadata) {
    cliArgs.push("--offline-repository-metadata");
  }
  if (args.replaceTrainingOutput) {
    cliArgs.push("--replace-training-output");
  }
  for (const source of args.gharchiveSources) {
    cliArgs.push("--gharchive-source", toRunnerPath(source, args.runner));
  }

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
    ...cliArgs,
  ];

  console.log(`seed file: ${path.relative(repoRoot, seedFile)}`);
  console.log(`dataset output dir: ${path.relative(repoRoot, outputDir)}`);
  console.log(`training snapshot export: ${path.relative(repoRoot, trainingOutputPath)}`);
  console.log(`repository feature cache: ${path.relative(repoRoot, featureCacheOutputPath)}`);
  console.log(`dataset runner: ${args.runner}`);
  if (args.runner === "docker") {
    await runCommand("docker", dockerArgs);
  } else {
    await runCommand(localPythonCommand(), cliArgs, { cwd: scoringRoot });
  }

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

  return { seedFile, outputDir, trainingOutputPath, featureCacheOutputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await buildDataset(args);
}

if (path.resolve(process.argv[1] ?? "") === __filename) {
  await main();
}
