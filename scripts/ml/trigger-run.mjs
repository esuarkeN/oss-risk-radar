const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const apiBaseUrl = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");

const response = await fetch(`${apiBaseUrl}/training/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ force })
});

if (!response.ok) {
  const body = await response.text();
  console.error(body || `Training trigger failed with status ${response.status}`);
  process.exit(1);
}

const payload = await response.json();
const run = payload.run;

console.log(`status: ${run.status}`);
console.log(`model: ${run.modelName} ${run.modelVersion}`);
console.log(`cached at: ${run.cachedAt}`);
console.log(`artifact: ${run.artifactPath}`);
console.log(`dataset hash: ${run.datasetHash}`);
if (payload.reusedCachedRun) {
  console.log("cache: reused latest cached run");
} else {
  console.log("cache: refreshed latest cached run");
}
if (run.metrics) {
  console.log(`auroc: ${run.metrics.rocAuc}`);
  console.log(`brier: ${run.metrics.brierScore}`);
  console.log(`inactive 12m rate: ${run.metrics.positiveRate}`);
  console.log(`f1: ${run.metrics.f1Score}`);
} else {
  console.log(`message: ${run.message}`);
}
