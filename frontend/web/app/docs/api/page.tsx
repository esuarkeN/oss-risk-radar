import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { Card } from "@/components/ui/card";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  summary: string;
}

interface EndpointGroup {
  title: string;
  blurb: string;
  endpoints: Endpoint[];
}

const groups: EndpointGroup[] = [
  {
    title: "Analyses",
    blurb: "Create an analysis and read it back. Creation is asynchronous — you get a job to poll.",
    endpoints: [
      { method: "POST", path: "/api/v1/analyses", summary: "Submit a repository (or demo/upload) and start scoring. Returns the analysis + a job." },
      { method: "GET", path: "/api/v1/analyses", summary: "List previous analyses." },
      { method: "GET", path: "/api/v1/analyses/{analysisId}", summary: "Fetch one analysis with its summary, dependencies, and status." },
      { method: "GET", path: "/api/v1/analyses/{analysisId}/dependencies", summary: "List the scored repositories for an analysis." },
    ],
  },
  {
    title: "Dependencies & jobs",
    blurb: "Drill into a single scored repository, or poll the background job that produced it.",
    endpoints: [
      { method: "GET", path: "/api/v1/dependencies/{dependencyId}", summary: "One scored repository: risk profile, evidence, raw signals, features." },
      { method: "GET", path: "/api/v1/jobs/{jobId}", summary: "Poll a scoring job's status (pending / running / completed / failed)." },
    ],
  },
  {
    title: "Training & evaluation",
    blurb: "Read-only views of the promoted model and the dataset behind it — this is what the docs' evaluation pages render.",
    endpoints: [
      { method: "GET", path: "/api/v1/training/dataset", summary: "Summary of the labeled dataset (size, class balance, coverage)." },
      { method: "GET", path: "/api/v1/training/effects", summary: "Ablation / feature-effect results, e.g. the bot-filter comparison." },
      { method: "GET", path: "/api/v1/training/runs", summary: "List training runs with held-out metrics." },
      { method: "GET", path: "/api/v1/training/runs/latest", summary: "The currently deployed run and its metrics." },
    ],
  },
  {
    title: "Operational",
    blurb: "Liveness and readiness, unversioned. Ready reports whether the scoring service is reachable.",
    endpoints: [
      { method: "GET", path: "/health", summary: "Liveness — the process is up." },
      { method: "GET", path: "/ready", summary: "Readiness — downstream scoring is reachable, else degraded." },
    ],
  },
];

const methodClass: Record<Endpoint["method"], string> = {
  GET: "bg-accent/12 text-accent",
  POST: "bg-emerald-500/12 text-emerald-400",
};

const createRequest = `POST /api/v1/analyses
Content-Type: application/json

{
  "submission": {
    "kind": "repository_url",
    "repositoryUrl": "https://github.com/owner/repo"
  }
}`;

const createResponse = `HTTP/1.1 201 Created

{
  "analysis": { "id": "an_...", "status": "pending", ... },
  "job":      { "id": "job_...", "status": "pending", ... },
  "reusedExistingAnalysis": false
}`;

const pollExample = `# poll the analysis until status is "completed"
curl -s http://localhost:8080/api/v1/analyses/an_... | jq '.analysis.status'

# then read the scored repository
curl -s http://localhost:8080/api/v1/analyses/an_.../dependencies \\
  | jq '.dependencies[0].riskProfile'`;

export default function ApiReferencePage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">How it&apos;s set up</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">API reference</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            The Go API is the only public surface — the web app is just a client of it. Everything is JSON over{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">/api/v1</code> with no auth in the
            reference deployment; access is expected to be network-scoped. Scoring is asynchronous:{" "}
            <span className="text-foreground">create an analysis, then poll it</span>.
          </p>
        </div>
      </Card>

      {groups.map((group) => (
        <Card key={group.title} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{group.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{group.blurb}</p>
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {group.endpoints.map((endpoint) => (
              <div
                key={`${endpoint.method} ${endpoint.path}`}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${methodClass[endpoint.method]}`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="font-mono text-[12.5px] text-foreground">{endpoint.path}</code>
                </div>
                <p className="text-sm leading-6 text-muted">{endpoint.summary}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">The create → poll flow</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Creating an analysis kicks off a background job and returns straight away with{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">status: &quot;pending&quot;</code>. Poll
          the analysis (or the job) until it is <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">completed</code>, then read the
          dependencies for the risk profile. By default an identical recent submission is reused (HTTP{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">200</code> with{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">reusedExistingAnalysis: true</code>);
          send <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">&quot;force&quot;: true</code> to force a fresh run.
        </p>
        <CodeBlock caption="request">{createRequest}</CodeBlock>
        <CodeBlock caption="response">{createResponse}</CodeBlock>
        <CodeBlock caption="poll then read">{pollExample}</CodeBlock>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Conventions</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>
            <span className="text-foreground">Submission kinds:</span>{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">repository_url</code>,{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">demo</code>, and{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">upload</code> — each repository is
            scored on its own (see{" "}
            <Link href="/docs/scoring" className="font-medium text-accent">
              How scoring a repo works
            </Link>
            ).
          </li>
          <li>
            <span className="text-foreground">Errors</span> come back as{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">{`{ "error": "..." }`}</code> with a
            matching HTTP status (<code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">400</code> bad
            payload, <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">404</code> unknown id,{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">500</code> internal).
          </li>
          <li>
            <span className="text-foreground">Base URL</span> is configurable; it defaults to{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">http://localhost:8080</code> locally,
            and the web app proxies it at <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">/api/v1</code>.
          </li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          For how these pieces fit together, see the{" "}
          <Link href="/docs/architecture" className="font-medium text-accent">
            system architecture
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
