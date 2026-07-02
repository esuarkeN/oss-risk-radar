import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { DefinitionList } from "@/components/docs/definition-list";
import type { InfoChipItem } from "@/components/info-chip-group";
import { Card } from "@/components/ui/card";

const services: InfoChipItem[] = [
  {
    label: "web — Next.js (:3000)",
    description:
      "The dashboard and these docs. It talks only to the API over /api/v1 and holds no model logic of its own; every number it shows comes from the API.",
  },
  {
    label: "api — Go (:8080)",
    description:
      "The orchestrator. It accepts submissions, runs enrichment (GitHub, OpenSSF Scorecard, deps.dev), builds the feature vector, calls the scoring service, persists results, and serves the training/evaluation data behind the docs.",
  },
  {
    label: "scoring — Python/FastAPI (:8090)",
    description:
      "Stateless model inference. It loads the exported artifacts once and exposes /features/extract and /score/model. It never trains and never reaches out to the network — same input always yields the same score.",
  },
  {
    label: "postgres (:5432)",
    description:
      "Durable storage for analyses, dependencies, and jobs. Optional in development — with no DATABASE_URL the API falls back to an in-memory store so you can run the stack without a database.",
  },
];

const boundary: InfoChipItem[] = [
  {
    label: "Offline — training",
    description:
      "Runs on a workstation or CI, never on a user request. Downloads GH Archive history, builds the leakage-controlled dataset, fits and calibrates the models, and exports artifacts. Slow, reproducible, and gated by promotion guardrails.",
  },
  {
    label: "Online — scoring",
    description:
      "Runs on every submission in seconds. Loads the promoted artifacts and applies them to whatever signals it can gather right now. It only ever reads a model; it never fits one.",
  },
];

export default function ArchitecturePage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">How it&apos;s set up</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">System architecture</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            OSS Risk Radar is four small services behind one API. The design choice that shapes everything else is a hard
            split between an <strong className="text-foreground">offline</strong> pipeline that builds and promotes a
            model, and an <strong className="text-foreground">online</strong> path that only ever loads that model to
            score a repository. Nothing is trained, and no history is downloaded, on a live request.
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">The services</h2>
        <DefinitionList items={services} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">The offline / online boundary</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Keeping training and scoring on opposite sides of a wall is what makes a live score fast, deterministic, and
          honest: the model a user hits was measured on held-out history, not fitted to their repository.
        </p>
        <DefinitionList items={boundary} />
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The two sides meet at a folder of artifacts. Training writes a bundle and promotion copies the accepted one
          into <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">deployment/training</code>; the API
          image bakes that folder in and re-seeds it on start, so shipping a new model means deploying a new image. See{" "}
          <Link href="/docs/training" className="font-medium text-accent">
            Train it yourself
          </Link>{" "}
          for the promotion guardrails.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">What happens on a request</h2>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>
            <span className="text-foreground">web → api:</span> a submission is <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">POST</code>ed to{" "}
            <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">/api/v1/analyses</code>, which returns an analysis and a background job immediately.
          </li>
          <li>
            <span className="text-foreground">api worker:</span> a poller picks up the job, enriches each repository from public sources, and resolves the feature vector.
          </li>
          <li>
            <span className="text-foreground">api → scoring:</span> features go to the scoring service, which returns a calibrated probability plus confidence and evidence.
          </li>
          <li>
            <span className="text-foreground">api → store:</span> results are persisted and the job flips to <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">completed</code>.
          </li>
          <li>
            <span className="text-foreground">web polls:</span> the dashboard reads the analysis until it is done, then renders the score, evidence, and caveats.
          </li>
        </ol>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The exact endpoints and payloads are in the{" "}
          <Link href="/docs/api" className="font-medium text-accent">
            API reference
          </Link>
          ; the modelling steps are in{" "}
          <Link href="/docs/scoring" className="font-medium text-accent">
            How scoring a repo works
          </Link>
          .
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Run the whole stack locally</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The stack is defined in <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">compose.yaml</code>. The app services live behind the{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">apps</code> profile so Postgres can also be brought up on its own for the offline
          tooling.
        </p>
        <CodeBlock caption="bring up web + api + scoring + postgres">docker compose --profile apps up --build</CodeBlock>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Then open <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">http://localhost:3000</code>. The API is reachable directly at{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">http://localhost:8080</code>; a GitHub token in{" "}
          <code className="rounded bg-panelAlt px-1 py-0.5 font-mono text-[12px]">GITHUB_TOKEN</code> raises enrichment rate limits but is not required to boot.
        </p>
      </Card>
    </>
  );
}
