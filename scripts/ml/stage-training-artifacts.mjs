import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    sourceDir: path.join("tmp", "training"),
    targetDir: path.join("deployment", "training"),
    minimumRepositories: 40,
    minimumInactiveRepositories: 8,
    clean: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
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
      case "--no-clean":
        args.clean = false;
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

function copyIfExists(source, target) {
  if (!existsSync(source)) {
    return false;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  return true;
}

function stageArtifacts(args) {
  const sourceDir = resolveRepoPath(args.sourceDir);
  const targetDir = resolveRepoPath(args.targetDir);
  const sourceSnapshotPath = path.join(sourceDir, "snapshots.json");
  const sourceLatestRunPath = path.join(sourceDir, "latest-run.json");
  const sourceRunsDir = path.join(sourceDir, "runs");

  if (!existsSync(sourceSnapshotPath)) {
    throw new Error(`missing real training snapshot export: ${sourceSnapshotPath}`);
  }

  const summary = validateSnapshots(sourceSnapshotPath, args);
  if (args.clean && existsSync(targetDir)) {
    for (const item of readdirSync(targetDir, { withFileTypes: true })) {
      if (item.name === "README.md") continue;
      rmSync(path.join(targetDir, item.name), { recursive: true, force: true });
    }
  }

  mkdirSync(path.join(targetDir, "runs"), { recursive: true });
  copyFileSync(sourceSnapshotPath, path.join(targetDir, "snapshots.json"));

  const latestCopied = copyIfExists(sourceLatestRunPath, path.join(targetDir, "latest-run.json"));
  let runCount = 0;
  if (existsSync(sourceRunsDir)) {
    for (const item of readdirSync(sourceRunsDir, { withFileTypes: true })) {
      if (item.isDirectory() || path.extname(item.name) !== ".json") {
        continue;
      }
      copyFileSync(path.join(sourceRunsDir, item.name), path.join(targetDir, "runs", item.name));
      runCount += 1;
    }
  }

  return { ...summary, latestCopied, runCount, sourceDir, targetDir };
}

try {
  const result = stageArtifacts(parseArgs(process.argv.slice(2)));
  console.log(`staged ${result.total} snapshots (${result.labeled} labeled, ${result.repositories} repos, ${result.inactiveRepositories} inactive repos)`);
  console.log(`latest run: ${result.latestCopied ? "copied" : "not found"}`);
  console.log(`run artifacts: ${result.runCount}`);
  console.log(`source: ${path.relative(repoRoot, result.sourceDir)}`);
  console.log(`target: ${path.relative(repoRoot, result.targetDir)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
