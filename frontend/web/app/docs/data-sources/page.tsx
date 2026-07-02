import Link from "next/link";

import { DefinitionList } from "@/components/docs/definition-list";
import type { InfoChipItem } from "@/components/info-chip-group";
import { Card } from "@/components/ui/card";

const dataSources: InfoChipItem[] = [
  {
    label: "GH Archive history",
    description:
      "Public GitHub events (commits, issues, pull requests, releases, stars, forks) are reconstructed from the GH Archive so that every signal reflects activity as it was at the observation time.",
  },
  {
    label: "GitHub metadata",
    description:
      "Stable repository metadata such as creation time, default branch, fork state, and archive status is read from the GitHub API for enrichment.",
  },
  {
    label: "Package registries",
    description:
      "Package-level facts — published versions, dependency counts, and the package-to-repository link — come from registry data (via deps.dev).",
  },
  {
    label: "Human-only activity",
    description:
      "Commit and contributor counts exclude bot accounts, so automated activity does not inflate the maintenance evidence.",
  },
];

export default function DataSourcesPage() {
  return (
    <>
      <Card className="animate-slide-up space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; features</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Where the data comes from</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            Nothing is scraped from private sources. Historical activity is reconstructed so each signal reflects what was
            true at the moment being scored, then combined with stable metadata and package-registry facts.
          </p>
        </div>
        <DefinitionList items={dataSources} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Why reconstruct history instead of reading the GitHub API?
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          The GitHub API only shows a repository as it is <em>now</em>. To label whether a repo went inactive over a past
          12-month window, and to compute features as they stood <em>before</em> that window, you need activity as it was
          at a chosen date <em>t</em> — not today&apos;s snapshot.{" "}
          <span className="text-foreground">GH Archive</span> is a public, hour-by-hour record of GitHub&apos;s public
          event stream, so replaying it up to <em>t</em> gives an honest point-in-time view and keeps future information
          out of the features. The GitHub API is used only for facts that don&apos;t rewrite history — creation time,
          default branch, fork and archive state.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">The same sources, two moments</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>
            <span className="text-foreground">Offline (training):</span> full GH Archive history is downloaded and
            replayed to build a labeled dataset. This is where the point-in-time reconstruction happens at scale.
          </li>
          <li>
            <span className="text-foreground">Online (scoring):</span> a live submission is enriched from the GitHub API
            and OpenSSF Scorecard for current signals, and matched against the staged full-history feature cache when the
            repo is one the offline pipeline already reconstructed.
          </li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Package registry facts come from <span className="text-foreground">deps.dev</span>, which also provides the
          package-to-repository link so a dependency name can be resolved to the repository actually being maintained.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Provenance &amp; honesty about gaps</h2>
        <ul className="max-w-3xl space-y-2 text-sm leading-6 text-muted">
          <li>Every signal carries its source and observation time, so a score can be traced back to the evidence.</li>
          <li>
            A signal that can&apos;t be resolved is filled with the training-cohort average and flagged as missing — it
            adds no evidence and lowers confidence rather than silently guessing.
          </li>
          <li>Bot accounts are excluded from commit and contributor counts so automation doesn&apos;t look like maintenance.</li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Next, see how these sources are turned into a leakage-controlled, labeled training table in{" "}
          <Link href="/docs/dataset" className="font-medium text-accent">
            Building the dataset
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
