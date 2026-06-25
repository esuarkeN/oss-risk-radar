import { dependencyDisplayName, dependencyDisplayVersion, isRepositoryProfile } from "@/lib/repository-profile";
import type { DependencyEdge, DependencyGraphResponse, DependencyRecord } from "@/lib/types";

export interface PathGraphNode {
  id: string;
  label: string;
  depth: number;
  relatedDependencyId?: string;
}

export type DependencyTreeNodeKind = "root" | "dependency" | "path";

export interface DependencyTreeNode {
  id: string;
  label: string;
  version: string;
  ecosystem: string;
  direct: boolean;
  kind: DependencyTreeNodeKind;
  dependencyId?: string;
  depth: number;
}

export interface DependencyTreeEdge {
  from: string;
  to: string;
  kind: DependencyEdge["kind"];
}

interface DependencyTreeBuildOptions {
  analysisId: string;
  rootLabel?: string;
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

export function buildDependencyTreeGraph(
  dependencies: DependencyRecord[],
  graph: DependencyGraphResponse | null,
  options: DependencyTreeBuildOptions
) {
  const dependencyById = new Map(dependencies.map((dependency) => [dependency.id, dependency]));
  const dependencyByPath = new Map<string, DependencyRecord>();
  const firstDependencyByName = new Map<string, DependencyRecord>();

  for (const dependency of dependencies) {
    if (dependency.dependencyPath.length) {
      dependencyByPath.set(pathKey(dependency.dependencyPath), dependency);
    }
    if (!firstDependencyByName.has(dependency.packageName)) {
      firstDependencyByName.set(dependency.packageName, dependency);
    }
  }

  const rootDependency = dependencies.find((dependency) => isRepositoryProfile(dependency)) ?? null;
  const rootId = rootDependency?.id ?? syntheticRootId(options.analysisId);
  const rootLabel = rootDependency ? dependencyDisplayName(rootDependency) : resolveRootLabel(dependencies, options.rootLabel);
  const rootVersion = rootDependency ? "Repository target" : "Analysis target";

  const nodeById = new Map<string, DependencyTreeNode>();
  const orderById = new Map<string, number>();
  let order = 0;

  const addNode = (node: DependencyTreeNode) => {
    const existing = nodeById.get(node.id);
    if (existing) {
      existing.depth = Math.min(existing.depth, node.depth);
      if (existing.kind === "path" && node.kind !== "path") {
        nodeById.set(node.id, { ...node, depth: existing.depth });
      }
      return;
    }

    nodeById.set(node.id, node);
    orderById.set(node.id, order);
    order += 1;
  };

  addNode({
    id: rootId,
    label: rootLabel,
    version: rootVersion,
    ecosystem: rootDependency?.ecosystem ?? "unknown",
    direct: true,
    kind: "root",
    dependencyId: rootDependency?.id,
    depth: 0,
  });

  for (const dependency of dependencies) {
    if (dependency.id === rootDependency?.id) {
      continue;
    }
    addNode(dependencyToTreeNode(dependency, "dependency", Math.max(dependency.dependencyPath.length - 1, 1)));
  }

  for (const graphNode of graph?.nodes ?? []) {
    if (nodeById.has(graphNode.id) || graphNode.id === rootDependency?.id) {
      continue;
    }
    addNode({
      id: graphNode.id,
      label: graphNode.packageName,
      version: graphNode.packageVersion,
      ecosystem: graphNode.ecosystem,
      direct: graphNode.direct,
      kind: "dependency",
      dependencyId: dependencyById.has(graphNode.id) ? graphNode.id : undefined,
      depth: graphNode.direct ? 1 : 2,
    });
  }

  const edgeById = new Map<string, DependencyTreeEdge>();
  const addEdge = (from: string, to: string, kind: DependencyEdge["kind"]) => {
    if (from === to || !nodeById.has(from) || !nodeById.has(to)) {
      return;
    }

    const key = `${from}->${to}`;
    const existing = edgeById.get(key);
    if (existing?.kind === "direct") {
      return;
    }
    edgeById.set(key, { from, to, kind });
  };

  for (const dependency of dependencies) {
    if (dependency.id === rootDependency?.id) {
      continue;
    }

    if (dependency.dependencyPath.length <= 1) {
      addEdge(rootId, dependency.id, dependency.direct ? "direct" : "transitive");
      continue;
    }

    let parentId = rootId;
    for (let index = 1; index < dependency.dependencyPath.length; index += 1) {
      const pathPrefix = dependency.dependencyPath.slice(0, index + 1);
      const pathDependency = dependencyByPath.get(pathKey(pathPrefix));
      const isLeaf = index === dependency.dependencyPath.length - 1;
      const currentId = isLeaf ? dependency.id : pathDependency?.id ?? pathNodeId(pathPrefix);

      if (!nodeById.has(currentId)) {
        addNode({
          id: currentId,
          label: dependency.dependencyPath[index],
          version: pathDependency ? dependencyDisplayVersion(pathDependency) : "Parent package",
          ecosystem: pathDependency?.ecosystem ?? dependency.ecosystem,
          direct: pathDependency?.direct ?? index === 1,
          kind: pathDependency ? "dependency" : "path",
          dependencyId: pathDependency?.id,
          depth: index,
        });
      }

      const edgeKind = index === 1 && (pathDependency?.direct ?? true) ? "direct" : "transitive";
      addEdge(parentId, currentId, edgeKind);
      parentId = currentId;
    }
  }

  for (const edge of graph?.edges ?? []) {
    const from = edge.from === syntheticRootId(options.analysisId) ? rootId : edge.from;
    const to = edge.to === syntheticRootId(options.analysisId) ? rootId : edge.to;
    addEdge(from, to, edge.kind);
  }

  for (const graphNode of graph?.nodes ?? []) {
    if (graphNode.id === rootId || edgeTouchesNode(edgeById, graphNode.id)) {
      continue;
    }
    const dependency = dependencyById.get(graphNode.id) ?? firstDependencyByName.get(graphNode.packageName);
    if (dependency?.id && nodeById.has(dependency.id)) {
      addEdge(rootId, dependency.id, dependency.direct ? "direct" : "transitive");
      continue;
    }
    if (nodeById.has(graphNode.id)) {
      addEdge(rootId, graphNode.id, graphNode.direct ? "direct" : "transitive");
    }
  }

  const nodes = Array.from(nodeById.values()).sort((left, right) => {
    if (left.id === rootId) {
      return -1;
    }
    if (right.id === rootId) {
      return 1;
    }
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }
    return (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0);
  });

  return {
    rootId,
    nodes,
    edges: Array.from(edgeById.values()),
  };
}

function dependencyToTreeNode(
  dependency: DependencyRecord,
  kind: DependencyTreeNodeKind,
  depth: number
): DependencyTreeNode {
  return {
    id: dependency.id,
    label: dependencyDisplayName(dependency),
    version: dependencyDisplayVersion(dependency),
    ecosystem: dependency.ecosystem,
    direct: dependency.direct,
    kind,
    dependencyId: dependency.id,
    depth,
  };
}

function resolveRootLabel(dependencies: DependencyRecord[], preferredLabel?: string) {
  const pathRoot = dependencies
    .map((dependency) => dependency.dependencyPath[0])
    .find((value) => value && value.trim().length > 0);
  return cleanRootLabel(preferredLabel) || pathRoot || "Analysis target";
}

function cleanRootLabel(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/i, "");
}

function syntheticRootId(analysisId: string) {
  return `root:${analysisId}`;
}

function pathKey(path: string[]) {
  return path.join("\u0000");
}

function pathNodeId(path: string[]) {
  return `path:${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function edgeTouchesNode(edges: Map<string, DependencyTreeEdge>, nodeId: string) {
  for (const edge of edges.values()) {
    if (edge.from === nodeId || edge.to === nodeId) {
      return true;
    }
  }
  return false;
}
