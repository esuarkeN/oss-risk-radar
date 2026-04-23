import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    force: false,
    datasetArgs: [],
    minimumValidationRows: null,
    minimumTestRows: null,
    minimumInactiveRate: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--force") {
      args.force = true;
      continue;
    }
    if (current === "--minimum-validation-rows") {
      if (!next) {
        throw new Error("--minimum-validation-rows requires a value");
      }
      args.minimumValidationRows = parseIntegerFlag(next, "--minimum-validation-rows");
      index += 1;
      continue;
    }
    if (current === "--minimum-test-rows") {
      if (!next) {
        throw new Error("--minimum-test-rows requires a value");
      }
      args.minimumTestRows = parseIntegerFlag(next, "--minimum-test-rows");
      index += 1;
      continue;
    }
    if (current === "--minimum-inactive-rate") {
      if (!next) {
        throw new Error("--minimum-inactive-rate requires a value");
      }
      args.minimumInactiveRate = parseRateFlag(next, "--minimum-inactive-rate");
      index += 1;
      continue;
    }
    args.datasetArgs.push(current);
  }

  const isFoundationBootstrap = args.datasetArgs.includes("--generate-foundation-seed");
  if (args.minimumValidationRows === null) {
    args.minimumValidationRows = isFoundationBootstrap ? 25 : 1;
  }
  if (args.minimumTestRows === null) {
    args.minimumTestRows = isFoundationBootstrap ? 25 : 1;
  }
  if (args.minimumInactiveRate === null) {
    args.minimumInactiveRate = isFoundationBootstrap ? 0.01 : 0;
  }

  return args;
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

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function triggerTraining(force) {
  const apiBaseUrl = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");
  const response = await fetch(`${apiBaseUrl}/training/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `training trigger failed with status ${response.status}`);
  }

  const payload = await response.json();
  return {
    apiBaseUrl,
    run: payload.run,
    reusedCachedRun: Boolean(payload.reusedCachedRun),
  };
}

async function fetchLatestRun(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/training/runs/latest`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `latest training run lookup failed with status ${response.status}`);
  }
  const payload = await response.json();
  return payload.run ?? null;
}

function verifyHostArtifacts(run) {
  const datasetPath = run?.datasetPath ? path.resolve(repoRoot, run.datasetPath) : path.resolve(repoRoot, "tmp", "training", "snapshots.json");
  const artifactPath = run?.artifactPath ? path.resolve(repoRoot, run.artifactPath) : null;
  const latestRunPath = path.resolve(repoRoot, "tmp", "training", "latest-run.json");

  if (!existsSync(datasetPath)) {
    throw new Error(`expected dataset file at ${datasetPath}`);
  }
  if (!artifactPath || !existsSync(artifactPath)) {
    throw new Error(`expected cached training artifact at ${artifactPath ?? "<missing>"}`);
  }
  if (!existsSync(latestRunPath)) {
    throw new Error(`expected latest cached run pointer at ${latestRunPath}`);
  }

  const latestPayload = JSON.parse(readFileSync(latestRunPath, "utf-8"));
  return {
    datasetPath,
    artifactPath,
    latestRunPath,
    latestPayload,
  };
}

function verifyTrainingRun(run, args) {
  if (!run) {
    throw new Error("training API did not return a run artifact");
  }
  if (run.status !== "completed") {
    throw new Error(run.message || `training did not complete successfully: ${run.status}`);
  }
  if (!run.splitSummary) {
    throw new Error("training run did not include splitSummary");
  }
  if (!run.metrics) {
    throw new Error("training run did not include evaluation metrics");
  }
  if (run.splitSummary.validationRows < args.minimumValidationRows) {
    throw new Error(
      `training produced only ${run.splitSummary.validationRows} validation rows, below the required ${args.minimumValidationRows}`
    );
  }
  if (run.splitSummary.testRows < args.minimumTestRows) {
    throw new Error(
      `training produced only ${run.splitSummary.testRows} test rows, below the required ${args.minimumTestRows}`
    );
  }
  if (run.metrics.positiveRate < args.minimumInactiveRate) {
    throw new Error(
      `training produced an inactive 12m rate of ${run.metrics.positiveRate}, below the required ${args.minimumInactiveRate}`
    );
  }
  return run;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const buildScriptPath = path.join(__dirname, "build-dataset.mjs");
  await runNodeScript(buildScriptPath, ["build-all", ...args.datasetArgs]);

  const training = await triggerTraining(args.force);
  const latestRun = await fetchLatestRun(training.apiBaseUrl);
  const verifiedRun = verifyTrainingRun(latestRun ?? training.run, args);
  const verification = verifyHostArtifacts(verifiedRun);

  console.log(`training status: ${verifiedRun.status}`);
  console.log(`cache: ${training.reusedCachedRun ? "reused latest cached run" : "created or refreshed cached run"}`);
  console.log(
    `splits: ${verifiedRun.splitSummary.trainRows}/${verifiedRun.splitSummary.validationRows}/${verifiedRun.splitSummary.testRows}`
  );
  console.log(`dataset path: ${path.relative(repoRoot, verification.datasetPath)}`);
  console.log(`artifact path: ${path.relative(repoRoot, verification.artifactPath)}`);
  console.log(`latest run pointer: ${path.relative(repoRoot, verification.latestRunPath)}`);
  if (verifiedRun.metrics) {
    console.log(`auroc: ${verifiedRun.metrics.rocAuc}`);
    console.log(`brier: ${verifiedRun.metrics.brierScore}`);
    console.log(`inactive 12m rate: ${verifiedRun.metrics.positiveRate}`);
    console.log(`f1: ${verifiedRun.metrics.f1Score}`);
  } else {
    console.log(`message: ${verifiedRun.message}`);
  }
}

await main();
