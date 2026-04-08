import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const shouldBuild = !args.has("--no-build");
const shouldNoCacheBuild = args.has("--no-cache");
const shouldDetach = !args.has("--attach");
const shouldWait = !args.has("--no-wait");
const shouldCopyEnv = !args.has("--no-env-copy");
const shouldDownFirst = !args.has("--no-down");

if (shouldCopyEnv) {
  const envPath = resolve(rootDir, ".env");
  const envExamplePath = resolve(rootDir, ".env.example");
  if (!existsSync(envPath) && existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
    console.log("Created .env from .env.example");
  }
}

function verifyDockerIsAvailable() {
  const result = spawnSync("docker", ["version"], {
    cwd: rootDir,
    shell: false,
    encoding: "utf8"
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("Docker CLI was not found. Install Docker Desktop and make sure `docker` is on your PATH.");
      process.exit(1);
    }

    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status === 0) {
    return;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const normalized = output.toLowerCase();

  if (
    normalized.includes("dockerdesktoplinuxengine") ||
    normalized.includes("docker_engine") ||
    normalized.includes("pipe/docker") ||
    normalized.includes("error during connect")
  ) {
    console.error("Docker Desktop is not running, or its engine is not ready yet.");
    console.error("Start Docker Desktop, wait until it shows the engine is running, then rerun `npm run dev`.");
    if (normalized.includes("elevated privileges")) {
      console.error("If Docker Desktop is already open, reopen your terminal with the required permissions or verify your user can access Docker.");
    }
    process.exit(1);
  }

  console.error(output || "Docker is unavailable.");
  process.exit(result.status ?? 1);
}

function readEnvConfig() {
  const envPath = resolve(rootDir, ".env");
  if (!existsSync(envPath)) {
    return new Map();
  }

  const values = new Map();
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }
  return values;
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function runCompose(argsList, options = {}) {
  const result = spawnSync("docker", ["compose", "--profile", "apps", ...argsList], {
    cwd: rootDir,
    shell: false,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  return result;
}

async function canBindPort(port) {
  return await new Promise((resolvePort) => {
    const server = createServer();

    server.once("error", () => {
      resolvePort(false);
    });

    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

async function verifyPortsAreAvailable() {
  const env = readEnvConfig();
  const ports = [
    { envKey: "POSTGRES_PORT", service: "postgres", fallback: 5432 },
    { envKey: "API_PORT", service: "api", fallback: 8080 },
    { envKey: "SCORING_PORT", service: "scoring", fallback: 8090 },
    { envKey: "WEB_PORT", service: "web", fallback: 3000 }
  ];

  const conflicts = [];
  for (const item of ports) {
    const port = parsePort(env.get(item.envKey), item.fallback);
    const free = await canBindPort(port);
    if (!free) {
      conflicts.push({ ...item, port });
    }
  }

  if (conflicts.length === 0) {
    return;
  }

  console.error("One or more required host ports are already in use:");
  for (const conflict of conflicts) {
    console.error(`- ${conflict.service}: ${conflict.port} (configure ${conflict.envKey} in .env to change it)`);
  }
  console.error("If these ports belong to another OSS Risk Radar run, `npm run dev` already tried to stop that stack first.");
  console.error("If they belong to another app on your machine, stop that app or change the port values in .env and rerun `npm run dev`.");
  process.exit(1);
}

verifyDockerIsAvailable();

if (shouldDownFirst) {
  const down = runCompose(["down", "--remove-orphans"], { stdio: "inherit", encoding: "utf8" });
  if (down.status !== 0) {
    process.exit(down.status ?? 1);
  }
}

await verifyPortsAreAvailable();

if (shouldBuild && shouldNoCacheBuild) {
  const build = runCompose(["build", "--no-cache"], { stdio: "inherit", encoding: "utf8" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const composeArgs = ["up"];
if (shouldBuild && !shouldNoCacheBuild) composeArgs.push("--build");
if (shouldDetach) composeArgs.push("-d");

const compose = runCompose(composeArgs, { stdio: "inherit", encoding: "utf8" });

if (compose.status !== 0) process.exit(compose.status ?? 1);
if (!shouldWait) process.exit(0);

const env = readEnvConfig();
const apiPort = parsePort(env.get("API_PORT"), 8080);
const scoringPort = parsePort(env.get("SCORING_PORT"), 8090);
const webPort = parsePort(env.get("WEB_PORT"), 3000);

const services = [
  { name: "api", url: `http://localhost:${apiPort}/health` },
  { name: "scoring", url: `http://localhost:${scoringPort}/health` },
  { name: "web", url: `http://localhost:${webPort}` },
];

const timeoutMs = 120000;
const start = Date.now();

async function waitForService(service) {
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(service.url, { method: "GET" });
      if (response.ok) return;
    } catch {
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2500));
  }
  throw new Error(`Timed out waiting for ${service.name} at ${service.url}`);
}

try {
  for (const service of services) {
    await waitForService(service);
    console.log(`Ready: ${service.name} -> ${service.url}`);
  }
  console.log("Full stack is up.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
