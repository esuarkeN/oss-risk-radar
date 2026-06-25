"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { buildDependencyTreeGraph, type DependencyTreeNodeKind } from "@/lib/dependency-graph";
import { formatRiskScore } from "@/lib/format";
import type { DependencyGraphResponse, DependencyRecord } from "@/lib/types";

const BUCKET_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: "#1a0e0e", border: "#ef4444", text: "#f87171", dot: "#ef4444" },
  high:     { bg: "#1a110a", border: "#f97316", text: "#fb923c", dot: "#f97316" },
  medium:   { bg: "#181500", border: "#eab308", text: "#facc15", dot: "#eab308" },
  low:      { bg: "#0a1a0e", border: "#22c55e", text: "#4ade80", dot: "#22c55e" },
  unscored: { bg: "#131921", border: "#2d3748", text: "#94a3b8", dot: "#4a5568" },
};

type RiskNodeData = {
  label: string;
  version: string;
  caption: string;
  bucket: string;
  score: number | null;
  direct: boolean;
  depId?: string;
  kind: DependencyTreeNodeKind;
};

type RiskNode = Node<RiskNodeData, "riskNode">;

function RiskNodeComponent({ data, selected }: NodeProps<RiskNode>) {
  const c = BUCKET_COLORS[data.bucket] ?? BUCKET_COLORS.unscored;
  const isRoot = data.kind === "root";
  const isPath = data.kind === "path";
  const borderColor = selected ? "#38bdf8" : isRoot ? "#38bdf8" : isPath ? "#334155" : c.border;
  const background = isRoot ? "#071923" : isPath ? "#101722" : c.bg;
  const textColor = isRoot ? "#bae6fd" : isPath ? "#cbd5e1" : c.text;

  return (
    <div
      style={{
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: "6px 12px",
        minWidth: isRoot ? 204 : 160,
        boxShadow: selected ? "0 0 0 2px rgba(56,189,248,0.35)" : isRoot ? "0 10px 30px rgba(14,165,233,0.08)" : undefined,
        cursor: data.depId ? "pointer" : "default",
        transition: "box-shadow 0.15s",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: borderColor, width: 6, height: 6, border: "none", opacity: isRoot ? 0 : 1 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isRoot ? "#38bdf8" : isPath ? "#64748b" : c.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: textColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isRoot ? 168 : 130 }}>
          {data.label}
        </span>
        {isRoot ? (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#38bdf8",
            background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.25)",
            borderRadius: 3, padding: "0 4px", marginLeft: "auto", flexShrink: 0,
          }}>ROOT</span>
        ) : data.direct ? (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#818cf8",
            background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 3, padding: "0 4px", marginLeft: "auto", flexShrink: 0,
          }}>D</span>
        ) : null}
      </div>
      <div style={{ fontSize: 10, color: "#4a5568", fontFamily: "monospace", marginTop: 2, paddingLeft: 11 }}>
        {data.caption || data.version}
        {data.score != null && (
          <span style={{ marginLeft: 6, color: c.text, fontWeight: 600 }}>
            risk {formatRiskScore(data.score)}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: borderColor, width: 6, height: 6, border: "none" }}
      />
    </div>
  );
}

const nodeTypes = { riskNode: RiskNodeComponent };

function getLayoutedElements(nodes: RiskNode[], edges: Edge[]): { nodes: RiskNode[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 90, marginx: 20, marginy: 20 });

  nodes.forEach((node) => g.setNode(node.id, { width: node.data.kind === "root" ? 218 : 178, height: 48 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      const width = node.data.kind === "root" ? 218 : 178;
      return { ...node, position: { x: pos.x - width / 2, y: pos.y - 24 } };
    }),
    edges,
  };
}

function buildFlowData(
  dependencies: DependencyRecord[],
  graph: DependencyGraphResponse | null,
  maxNodes: number,
  analysisId: string,
  analysisTargetLabel?: string
): { nodes: RiskNode[]; edges: Edge[] } {
  const depMap = new Map(dependencies.map((d) => [d.id, d]));
  const tree = buildDependencyTreeGraph(dependencies, graph, { analysisId, rootLabel: analysisTargetLabel });
  const slicedNodes = tree.nodes.slice(0, maxNodes);
  const nodeIdSet = new Set(slicedNodes.map((n) => n.id));

  const nodes: RiskNode[] = slicedNodes.map((n) => {
    const dep = n.dependencyId ? depMap.get(n.dependencyId) : undefined;
    const bucket = dep?.riskProfile?.riskBucket ?? "unscored";
    const score = dep?.riskProfile?.inactivityRiskScore ?? null;
    return {
      id: n.id,
      type: "riskNode" as const,
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        version: n.version,
        caption: n.kind === "dependency" ? `${n.version} / ${n.ecosystem}` : n.version,
        bucket,
        score,
        direct: n.direct,
        depId: n.dependencyId,
        kind: n.kind,
      },
    };
  });

  const edges: Edge[] = tree.edges
    .filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
    .slice(0, maxNodes * 2)
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      animated: e.kind === "direct",
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: e.kind === "direct" ? "#475569" : "#334155" },
      style: {
        stroke: e.kind === "direct" ? "#475569" : "#334155",
        strokeWidth: e.kind === "direct" ? 1.8 : 1.3,
        strokeDasharray: e.kind === "transitive" ? "4 4" : undefined,
      },
    }));

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
  return { nodes: layoutedNodes, edges: layoutedEdges };
}

function FitOnMount() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100);
  }, [fitView]);
  return null;
}

interface DependencyTreeSnapshotProps {
  dependencies: DependencyRecord[];
  graph: DependencyGraphResponse | null;
  analysisId: string;
  analysisTargetLabel?: string;
  maxNodes?: number;
  onSelectDependency?: (id: string) => void;
}

export function DependencyTreeSnapshot({
  dependencies,
  graph,
  analysisId,
  analysisTargetLabel,
  maxNodes = 60,
  onSelectDependency,
}: DependencyTreeSnapshotProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowData(dependencies, graph, maxNodes, analysisId, analysisTargetLabel),
    [dependencies, graph, maxNodes, analysisId, analysisTargetLabel]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialEdges, initialNodes, setEdges, setNodes]);

  const totalNodes = buildDependencyTreeGraph(dependencies, graph, { analysisId, rootLabel: analysisTargetLabel }).nodes.length;
  const truncated = totalNodes > maxNodes;

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const depId = (node as RiskNode).data.depId;
      if (depId) {
        onSelectDependency?.(depId);
      }
    },
    [onSelectDependency]
  );

  if (dependencies.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-[hsl(var(--border))] text-sm text-[hsl(var(--muted))]">
        No dependency data available yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-lg border border-[hsl(var(--border))]"
        style={{ height: 420, background: "#0a0e15" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#1e2535" gap={20} size={1} />
          <Controls
            showInteractive={false}
            style={{ background: "#161c27", border: "1px solid #2d3748", borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={(node) => {
              const n = node as RiskNode;
              return BUCKET_COLORS[n.data?.bucket ?? "unscored"]?.dot ?? "#4a5568";
            }}
            style={{ background: "#161c27", border: "1px solid #2d3748", borderRadius: 8 }}
            maskColor="rgba(14,17,23,0.7)"
          />
          <FitOnMount />
        </ReactFlow>
      </div>

      {/* Legend + full tree link */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {Object.entries(BUCKET_COLORS).map(([bucket, c]) => (
            <span key={bucket} className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted))]">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
              {bucket.charAt(0).toUpperCase() + bucket.slice(1)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted))]">
          {truncated && (
            <span className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-2 py-0.5 text-[11px]">
              Showing {maxNodes} of {totalNodes} nodes
            </span>
          )}
          <Link
            href={`/analyses/${analysisId}/tree`}
            className="inline-flex items-center gap-1 font-medium text-[hsl(var(--accent))] transition hover:text-[hsl(var(--foreground))]"
          >
            {truncated ? "View full tree →" : "Open full tree →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
