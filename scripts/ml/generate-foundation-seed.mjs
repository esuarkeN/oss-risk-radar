import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    outputFile: path.join("tmp", "training", "foundation-seed.csv"),
    targetRepositories: 2000,
    githubToken: process.env.GITHUB_TOKEN ?? "",
    pageSize: 100,
    includeArchived: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--output-file":
        if (!next) {
          throw new Error("--output-file requires a value");
        }
        args.outputFile = next;
        index += 1;
        break;
      case "--target-repositories":
        if (!next) {
          throw new Error("--target-repositories requires a value");
        }
        args.targetRepositories = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--github-token":
        if (!next) {
          throw new Error("--github-token requires a value");
        }
        args.githubToken = next;
        index += 1;
        break;
      case "--page-size":
        if (!next) {
          throw new Error("--page-size requires a value");
        }
        args.pageSize = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--exclude-archived":
        args.includeArchived = false;
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
  }

  if (!Number.isInteger(args.targetRepositories) || args.targetRepositories < 100) {
    throw new Error("--target-repositories must be an integer >= 100");
  }
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 100) {
    throw new Error("--page-size must be an integer between 1 and 100");
  }

  return args;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value, days) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function derivePopularityTier(stars, forks) {
  if (stars >= 500 || forks >= 100) {
    return "high";
  }
  if (stars >= 50 || forks >= 20) {
    return "medium";
  }
  return "low";
}

function csvEscape(value) {
  const text = `${value ?? ""}`;
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

async function requestGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if ((response.status === 403 || response.status === 429) && remaining === "0") {
      throw new Error(
        `GitHub API rate limit exceeded for ${url}. Reset at epoch ${reset ?? "unknown"}. Response: ${body}`
      );
    }
    throw new Error(`GitHub API request failed for ${url}: ${response.status} ${body}`);
  }

  return response.json();
}

function buildBuckets(targetRepositories, includeArchived) {
  const now = new Date();
  const activeSince = formatDate(shiftDays(now, -365));
  const dormantBefore = formatDate(shiftDays(now, -730));
  const buckets = [
    {
      label: "active-high",
      target: Math.round(targetRepositories * 0.3),
      query: `is:public fork:false archived:false stars:>=500 pushed:>=${activeSince}`
    },
    {
      label: "active-medium",
      target: Math.round(targetRepositories * 0.2),
      query: `is:public fork:false archived:false stars:50..499 pushed:>=${activeSince}`
    },
    {
      label: "active-low",
      target: Math.round(targetRepositories * 0.15),
      query: `is:public fork:false archived:false stars:10..49 pushed:>=${activeSince}`
    },
    {
      label: "dormant-high",
      target: Math.round(targetRepositories * 0.15),
      query: `is:public fork:false archived:false stars:100..99999 pushed:<=${dormantBefore}`
    },
    {
      label: "dormant-low",
      target: Math.round(targetRepositories * 0.1),
      query: `is:public fork:false archived:false stars:10..99 pushed:<=${dormantBefore}`
    }
  ];

  if (includeArchived) {
    buckets.push({
      label: "archived",
      target: Math.round(targetRepositories * 0.1),
      query: "is:public fork:false archived:true stars:>=10"
    });
  }

  return buckets;
}

function buildFallbackBuckets(includeArchived) {
  const now = new Date();
  const recentSince = formatDate(shiftDays(now, -540));
  const dormantBefore = formatDate(shiftDays(now, -1095));
  const fallbacks = [
    {
      label: "fallback-active",
      query: `is:public fork:false archived:false stars:>=10 pushed:>=${recentSince}`
    },
    {
      label: "fallback-dormant",
      query: `is:public fork:false archived:false stars:>=5 pushed:<=${dormantBefore}`
    }
  ];

  if (includeArchived) {
    fallbacks.push({
      label: "fallback-archived",
      query: "is:public fork:false archived:true stars:>=5"
    });
  }

  return fallbacks;
}

function toSeedRow(item, sourceLabel) {
  return {
    ecosystem: "github",
    package_name: item.full_name,
    package_version: "repository-snapshot",
    popularity_tier: derivePopularityTier(item.stargazers_count ?? 0, item.forks_count ?? 0),
    source: `github-search:${sourceLabel}`,
    repository_url: item.html_url,
    repository_full_name: item.full_name,
  };
}

async function collectRepositories(args) {
  const repositories = new Map();
  const bucketSummaries = [];
  const searchEndpoint = "https://api.github.com/search/repositories";
  const perPage = args.pageSize;
  const buckets = buildBuckets(args.targetRepositories, args.includeArchived);

  for (const bucket of buckets) {
    let added = 0;
    let page = 1;
    while (added < bucket.target && page <= 10 && repositories.size < args.targetRepositories) {
      const params = new URLSearchParams({
        q: bucket.query,
        sort: "stars",
        order: "desc",
        per_page: `${perPage}`,
        page: `${page}`
      });
      const payload = await requestGitHubJson(`${searchEndpoint}?${params.toString()}`, args.githubToken);
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) {
        break;
      }

      for (const item of items) {
        if (!item?.full_name || !item?.html_url) {
          continue;
        }
        if (repositories.has(item.full_name.toLowerCase())) {
          continue;
        }
        repositories.set(item.full_name.toLowerCase(), toSeedRow(item, bucket.label));
        added += 1;
        if (added >= bucket.target || repositories.size >= args.targetRepositories) {
          break;
        }
      }

      page += 1;
      await sleep(750);
    }

    bucketSummaries.push({ label: bucket.label, added });
    if (repositories.size >= args.targetRepositories) {
      break;
    }
  }

  if (repositories.size < args.targetRepositories) {
    for (const bucket of buildFallbackBuckets(args.includeArchived)) {
      let page = 1;
      let added = 0;
      while (page <= 10 && repositories.size < args.targetRepositories) {
        const params = new URLSearchParams({
          q: bucket.query,
          sort: "stars",
          order: "desc",
          per_page: `${perPage}`,
          page: `${page}`
        });
        const payload = await requestGitHubJson(`${searchEndpoint}?${params.toString()}`, args.githubToken);
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) {
          break;
        }

        for (const item of items) {
          if (!item?.full_name || !item?.html_url) {
            continue;
          }
          if (repositories.has(item.full_name.toLowerCase())) {
            continue;
          }
          repositories.set(item.full_name.toLowerCase(), toSeedRow(item, bucket.label));
          added += 1;
          if (repositories.size >= args.targetRepositories) {
            break;
          }
        }

        page += 1;
        await sleep(750);
      }

      bucketSummaries.push({ label: bucket.label, added });
      if (repositories.size >= args.targetRepositories) {
        break;
      }
    }
  }

  return {
    rows: Array.from(repositories.values()).slice(0, args.targetRepositories),
    bucketSummaries,
  };
}

function writeSeedFile(outputFile, rows) {
  mkdirSync(path.dirname(outputFile), { recursive: true });
  const header = [
    "ecosystem",
    "package_name",
    "package_version",
    "popularity_tier",
    "source",
    "repository_url",
    "repository_full_name"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((column) => csvEscape(row[column])).join(","));
  }
  writeFileSync(outputFile, `${lines.join("\n")}\n`, "utf-8");
}

export async function generateFoundationSeed(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const outputFile = resolveRepoPath(args.outputFile);
  const { rows, bucketSummaries } = await collectRepositories(args);
  if (rows.length < args.targetRepositories) {
    throw new Error(
      `GitHub search produced only ${rows.length} unique repositories, below the required ${args.targetRepositories}. ` +
      "Use a GitHub token and/or broaden the query buckets."
    );
  }

  writeSeedFile(outputFile, rows);

  const inactiveCandidates = rows.filter((row) => row.source.includes("dormant") || row.source.includes("archived")).length;
  console.log(`foundation seed: ${path.relative(repoRoot, outputFile)}`);
  console.log(`repositories written: ${rows.length}`);
  console.log(`inactive-biased candidates: ${inactiveCandidates}`);
  for (const bucket of bucketSummaries) {
    console.log(`bucket ${bucket.label}: ${bucket.added}`);
  }

  return { outputFile, rowsWritten: rows.length, inactiveCandidates };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await generateFoundationSeed();
}
