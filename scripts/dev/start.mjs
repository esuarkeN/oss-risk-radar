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

function runCommand(command, argsList) {
  return spawnSync(command, argsList, {
    cwd: rootDir,
    shell: false,
    encoding: "utf8"
  });
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

async function inspectPort(port) {
  const owners = describePortOwners(port);
  if (owners.length > 0) {
    return { available: false, owners };
  }

  return { available: await canBindPort(port), owners: [] };
}

function findDockerOwners(port) {
  const result = runCommand("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"]);
  if (result.error || result.status !== 0) {
    return [];
  }

  const hostPortPattern = new RegExp(`:${port}(?:->|\\b)`);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [name, ports = ""] = line.split("\t");
      if (!name || !hostPortPattern.test(ports)) {
        return [];
      }
      return [`docker container ${name} (${ports})`];
    });
}

function findWindowsProcessOwners(port) {
  const result = runCommand("netstat", ["-ano", "-p", "tcp"]);
  if (result.error || result.status !== 0) {
    return [];
  }

  const pids = new Set();
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const columns = line.split(/\s+/);
    if (columns.length < 5 || columns[0].toUpperCase() !== "TCP") {
      continue;
    }

    const localAddress = columns[1];
    const state = columns[3].toUpperCase();
    const pid = columns[4];
    if (state === "LISTENING" && localAddress.endsWith(`:${port}`)) {
      pids.add(pid);
    }
  }

  const owners = [];
  for (const pid of pids) {
    const task = runCommand("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    const taskLine = task.stdout.trim().split(/\r?\n/)[0] ?? "";
    const match = taskLine.match(/^"([^"]+)"/);
    if (match) {
      owners.push(`process ${match[1]} (pid ${pid})`);
      continue;
    }
    owners.push(`pid ${pid}`);
  }
  return owners;
}

function findUnixProcessOwners(port) {
  const lsof = runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  if (!lsof.error && lsof.status === 0) {
    return lsof.stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((columns) => columns.length >= 2)
      .map((columns) => `process ${columns[0]} (pid ${columns[1]})`);
  }

  const ss = runCommand("ss", ["-ltnp"]);
  if (ss.error || ss.status !== 0) {
    return [];
  }

  const hostPortPattern = new RegExp(`:${port}\\b`);
  return ss.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("State") && hostPortPattern.test(line))
    .map((line) => `socket ${line}`);
}

function describePortOwners(port) {
  const owners = new Set(findDockerOwners(port));
  const processOwners = process.platform === "win32"
    ? findWindowsProcessOwners(port)
    : findUnixProcessOwners(port);

  for (const owner of processOwners) {
    owners.add(owner);
  }

  return [...owners];
}

async function findAvailablePort(port, searchWindow = 25) {
  for (let candidate = port + 1; candidate <= port + searchWindow; candidate += 1) {
    const inspection = await inspectPort(candidate);
    if (inspection.available) {
      return candidate;
    }
  }
  return null;
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
    const inspection = await inspectPort(port);
    if (!inspection.available) {
      conflicts.push({
        ...item,
        port,
        owners: inspection.owners,
        suggestedPort: await findAvailablePort(port)
      });
    }
  }

  if (conflicts.length === 0) {
    return;
  }

  console.error("One or more required host ports are already in use:");
  for (const conflict of conflicts) {
    console.error(`- ${conflict.service}: ${conflict.port} (configure ${conflict.envKey} in .env to change it)`);
    for (const owner of conflict.owners.slice(0, 4)) {
      console.error(`  occupied by ${owner}`);
    }
    if (conflict.suggestedPort !== null) {
      console.error(`  next free port: ${conflict.suggestedPort} (set ${conflict.envKey}=${conflict.suggestedPort})`);
    }
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
