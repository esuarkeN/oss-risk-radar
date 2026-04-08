import type { DependencyEdge, DependencyRecord } from "@/lib/types";

export interface PathGraphNode {
  id: string;
  label: string;
  depth: number;
  relatedDependencyId?: string;
}

export function deriveDependencyEdges(dependencies: DependencyRecord[], providedEdges?: DependencyEdge[]) {
  if (providedEdges?.length) {
    return providedEdges;
  }

  const edgeMap = new Map<string, DependencyEdge>();
  for (const dependency of dependencies) {
    for (let index = 0; index < dependency.dependencyPath.length - 1; index += 1) {
      const from = dependency.dependencyPath[index];
      const to = dependency.dependencyPath[index + 1];
      edgeMap.set(`${from}->${to}`, { from, to, kind: index === 0 ? "direct" : "transitive" });
    }
  }

  return Array.from(edgeMap.values());
}

export function derivePathNodes(path: string[], selectedDependencyId?: string): PathGraphNode[] {
  return path.map((label, index) => ({
    id: `${path.slice(0, index + 1).join(">")}`,
    label,
    depth: index,
    relatedDependencyId: index === path.length - 1 ? selectedDependencyId : undefined
  }));
}

export function deriveSiblingDependencies(dependencies: DependencyRecord[], selected: DependencyRecord) {
  const sharedPrefix = selected.dependencyPath.slice(0, -1).join(">>");
  return dependencies.filter((dependency) => {
    if (dependency.id === selected.id) {
      return false;
    }
    return dependency.dependencyPath.slice(0, -1).join(">>") === sharedPrefix;
  });
}

