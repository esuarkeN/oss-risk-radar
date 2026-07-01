import { InfoChipGroup, type InfoChipItem } from "@/components/info-chip-group";
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
    <Card className="animate-slide-up space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; features</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Where the data comes from</h1>
        <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
          Nothing is scraped from private sources. Historical activity is reconstructed so each signal reflects what was
          true at the moment being scored, then combined with stable metadata and package-registry facts.
        </p>
      </div>
      <InfoChipGroup items={dataSources} />
    </Card>
  );
}
