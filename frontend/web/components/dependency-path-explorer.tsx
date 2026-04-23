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
    <Card className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Path and Graph Context</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">How this package enters the analyzed project</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            The current MVP shows the observed dependency path plus any available graph edges. This is analysis context, not a proof of exploitability or trust.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p>
            <span className="font-semibold text-slate-950">{pathNodes.length}</span> nodes in selected path
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-950">{graphEdges.length}</span> edges available in analysis graph
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Observed path</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {pathNodes.map((node, index) => (
                <div key={node.id} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium",
                      index === pathNodes.length - 1
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-white text-slate-700"
                    )}
                  >
                    {node.label}
                  </div>
                  {index < pathNodes.length - 1 ? <span className="text-slate-400">-&gt;</span> : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">{formatPath(dependency.dependencyPath)}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Related edges</p>
            <div className="mt-3 space-y-3">
              {relatedEdges.length ? (
                relatedEdges.map((edge) => (
                  <div key={`${edge.from}-${edge.to}-${edge.kind}`} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">
                        {resolveNodeLabel(edge.from, dependencies, graph)}
                        <span className="mx-2 text-slate-400">-&gt;</span>
                        {resolveNodeLabel(edge.to, dependencies, graph)}
                      </div>
                      <Badge tone={edge.kind === "direct" ? "medium" : "neutral"}>{titleCase(edge.kind)}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  No graph edge payload was attached to this analysis yet. The path above is derived from the current dependency snapshot.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Nearby dependencies</p>
            <div className="mt-3 space-y-3">
              {relatedDependencies.length ? (
                relatedDependencies.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={`/analyses/${candidate.analysisId}/dependencies/${candidate.id}`}
                    className="block rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{candidate.packageName}</p>
                        <p className="mt-1 text-xs text-slate-500">{candidate.packageVersion} · {candidate.ecosystem}</p>
                      </div>
                      <Badge tone={candidate.direct ? "medium" : "neutral"}>{candidate.direct ? "Direct" : "Transitive"}</Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  No adjacent dependencies were derived from the current path snapshot.
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sibling packages in same chain</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {siblingDependencies.length ? (
                siblingDependencies.map((candidate) => (
                  <Link key={candidate.id} href={`/analyses/${candidate.analysisId}/dependencies/${candidate.id}`}>
                    <Badge className="hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800" tone="neutral">
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

