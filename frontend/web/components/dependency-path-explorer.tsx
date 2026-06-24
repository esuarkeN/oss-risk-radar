import Link from "next/link";

import type { DependencyGraphResponse, DependencyRecord } from "@/lib/types";
import { deriveDependencyEdges, derivePathNodes, deriveSiblingDependencies } from "@/lib/dependency-graph";
import { formatPath, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface DependencyPathExplorerProps {
  dependency: DependencyRecord;
  dependencies: DependencyRecord[];
  graph?: DependencyGraphResponse | null;
  className?: string;
}

function resolveNodeLabel(
  value: string,
  dependencies: DependencyRecord[],
  graph?: DependencyGraphResponse | null
) {
  const graphNode = graph?.nodes?.find((node) => node.id === value);
  if (graphNode) {
    return `${graphNode.packageName}@${graphNode.packageVersion}`;
  }

  const dependency = dependencies.find((candidate) => candidate.id === value);
  if (dependency) {
    return `${dependency.packageName}@${dependency.packageVersion}`;
  }

  return value;
}

function resolveNodeRiskBucket(
  label: string,
  dependencies: DependencyRecord[]
): string | undefined {
  const dep = dependencies.find(
    (d) => d.packageName === label || d.id === label
  );
  return dep?.riskProfile?.riskBucket;
}

const bucketNodeStyle: Record<string, string> = {
  critical: "border-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]",
  high: "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]",
  medium: "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.08)] text-[hsl(var(--accent))]",
  low: "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]",
};

export function DependencyPathExplorer({ dependency, dependencies, graph, className }: DependencyPathExplorerProps) {
  const pathNodes = derivePathNodes(dependency.dependencyPath, dependency.id);
  const graphEdges = deriveDependencyEdges(dependencies, graph?.edges);
  const siblingDependencies = deriveSiblingDependencies(dependencies, dependency).slice(0, 6);
  const selectedKeys = new Set([dependency.id, dependency.packageName, dependency.packageVersion, ...dependency.dependencyPath]);
  const relatedEdges = graphEdges.filter((edge) => selectedKeys.has(edge.from) || selectedKeys.has(edge.to)).slice(0, 8);
  const relatedDependencies = dependencies
    .filter((candidate) => candidate.id !== dependency.id)
    .filter((candidate) => {
      const pathPrefix = dependency.dependencyPath.slice(0, -1).join("/");
      const candidatePrefix = candidate.dependencyPath.slice(0, -1).join("/");
      return candidatePrefix === pathPrefix || candidate.dependencyPath.includes(dependency.packageName);
    })
    .slice(0, 6);

  return (
    <Card className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Dependency Path</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">How this package enters the project</h2>
        </div>
        <div className="rounded-xl border border-line bg-panelAlt px-4 py-2.5 text-sm text-muted">
          <span className="font-semibold text-foreground">{pathNodes.length}</span> nodes &middot;{" "}
          <span className="font-semibold text-foreground">{graphEdges.length}</span> graph edges
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          {/* Horizontal breadcrumb tree */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Observed path</p>
            <div className="mt-3 flex flex-wrap items-center gap-0">
              {pathNodes.map((node, index) => {
                const isLast = index === pathNodes.length - 1;
                const isFirst = index === 0;
                const bucket = resolveNodeRiskBucket(node.label, dependencies);
                const bucketStyle = bucket ? bucketNodeStyle[bucket] : undefined;

                return (
                  <div key={node.id} className="flex items-center">
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                        isLast
                          ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.3)]"
                          : isFirst
                          ? "border-line bg-panel text-muted"
                          : bucketStyle
                          ? bucketStyle
                          : "border-line bg-panelAlt text-foreground"
                      )}
                    >
                      {node.label}
                      {isLast && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">focused</span>
                      )}
                    </div>
                    {index < pathNodes.length - 1 && (
                      <svg
                        className="mx-1.5 h-3.5 w-3.5 shrink-0 text-muted"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-muted">{formatPath(dependency.dependencyPath)}</p>
          </div>

          {/* Related edges */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Related edges</p>
            <div className="mt-3 space-y-2">
              {relatedEdges.length ? (
                relatedEdges.map((edge) => (
                  <div
                    key={`${edge.from}-${edge.to}-${edge.kind}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panelAlt px-4 py-2.5 text-sm"
                  >
                    <div className="font-medium text-foreground">
                      <span className="text-muted">{resolveNodeLabel(edge.from, dependencies, graph)}</span>
                      <span className="mx-2 text-muted">&rarr;</span>
                      <span>{resolveNodeLabel(edge.to, dependencies, graph)}</span>
                    </div>
                    <Badge tone={edge.kind === "direct" ? "medium" : "neutral"}>{titleCase(edge.kind)}</Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                  No graph edge payload was attached to this analysis yet. The path above is derived from the current dependency snapshot.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Nearby dependencies */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Nearby dependencies</p>
            <div className="mt-3 space-y-2">
              {relatedDependencies.length ? (
                relatedDependencies.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={`/analyses/${candidate.analysisId}/dependencies/${candidate.id}`}
                    className="block rounded-xl border border-line bg-panelAlt px-4 py-2.5 transition hover:border-[hsl(var(--accent)/0.4)] hover:bg-[hsl(var(--accent)/0.05)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{candidate.packageName}</p>
                        <p className="mt-0.5 text-xs text-muted">{candidate.packageVersion} &middot; {candidate.ecosystem}</p>
                      </div>
                      <Badge tone={candidate.direct ? "medium" : "neutral"}>{candidate.direct ? "Direct" : "Transitive"}</Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                  No adjacent dependencies were derived from the current path snapshot.
                </div>
              )}
            </div>
          </div>

          {/* Sibling packages */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Sibling packages in same chain</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {siblingDependencies.length ? (
                siblingDependencies.map((candidate) => (
                  <Link key={candidate.id} href={`/analyses/${candidate.analysisId}/dependencies/${candidate.id}`}>
                    <Badge
                      tone="neutral"
                      className="cursor-pointer transition hover:border-[hsl(var(--accent)/0.4)] hover:text-[hsl(var(--accent))]"
                    >
                      {candidate.packageName}
                    </Badge>
                  </Link>
                ))
              ) : (
                <Badge tone="neutral">No sibling packages surfaced from the current snapshot</Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
