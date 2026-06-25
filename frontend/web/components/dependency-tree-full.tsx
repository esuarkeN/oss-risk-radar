"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  Position,
  Handle,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Search, Filter } from "lucide-react";

import { buildDependencyTreeGraph, type DependencyTreeNodeKind } from "@/lib/dependency-graph";
import type { DependencyGraphResponse, DependencyRecord, RiskBucket } from "@/lib/types";
import { formatRiskScore } from "@/lib/format";

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
  analysisId: string;
  dimmed: boolean;
  kind: DependencyTreeNodeKind;
};

type RiskNode = Node<RiskNodeData, "riskNode">;

function RiskNodeComponent({ data, selected }: NodeProps<RiskNode>) {
  const c = BUCKET_COLORS[data.bucket] ?? BUCKET_COLORS.unscored;
  const isRoot = data.kind === "root";
  const isPath = data.kind === "path";
  const borderColor = selected ? "#38bdf8" : data.dimmed ? "#1e2535" : isRoot ? "#38bdf8" : isPath ? "#334155" : c.border;
  const background = data.dimmed ? "#0d1117" : isRoot ? "#071923" : isPath ? "#101722" : c.bg;
  const textColor = data.dimmed ? "#4a5568" : isRoot ? "#bae6fd" : isPath ? "#cbd5e1" : c.text;

  return (
    <div
      style={{
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: "6px 12px",
        minWidth: isRoot ? 210 : 170,
        opacity: data.dimmed ? 0.35 : 1,
        boxShadow: selected ? "0 0 0 2px rgba(56,189,248,0.35)" : isRoot ? "0 10px 30px rgba(14,165,233,0.08)" : undefined,
        cursor: data.depId ? "pointer" : "default",
        transition: "opacity 0.15s, box-shadow 0.15s",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: borderColor, width: 6, height: 6, border: "none", opacity: isRoot ? 0 : 1 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: data.dimmed ? "#2d3748" : isRoot ? "#38bdf8" : isPath ? "#64748b" : c.dot, flexShrink: 0 }} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: textColor,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isRoot ? 174 : 140,
        }}>
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
          <span style={{ marginLeft: 6, color: data.dimmed ? "#4a5568" : c.text, fontWeight: 600 }}>
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
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 100, marginx: 24, marginy: 24 });

  nodes.forEach((node) => g.setNode(node.id, { width: node.data.kind === "root" ? 226 : 186, height: 52 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      const width = node.data.kind === "root" ? 226 : 186;
      return { ...node, position: { x: pos.x - width / 2, y: pos.y - 26 } };
    }),
    edges,
  };
}

function buildFlowData(
  dependencies: DependencyRecord[],
  graph: DependencyGraphResponse | null,
  searchQuery: string,
  bucketFilter: RiskBucket | "all",
  analysisId: string,
  analysisTargetLabel?: string
): { nodes: RiskNode[]; edges: Edge[] } {
  const depMap = new Map(dependencies.map((d) => [d.id, d]));
  const tree = buildDependencyTreeGraph(dependencies, graph, { analysisId, rootLabel: analysisTargetLabel });

  const query = searchQuery.toLowerCase().trim();

  const nodes: RiskNode[] = tree.nodes.map((n) => {
    const dep = n.dependencyId ? depMap.get(n.dependencyId) : undefined;
    const bucket = dep?.riskProfile?.riskBucket ?? "unscored";
    const score = dep?.riskProfile?.inactivityRiskScore ?? null;
    const structuralNode = n.kind !== "dependency";
    const matchesSearch = structuralNode || !query || `${n.label} ${n.version} ${n.ecosystem}`.toLowerCase().includes(query);
    const matchesBucket = structuralNode || bucketFilter === "all" || bucket === bucketFilter;
    const dimmed = !matchesSearch || !matchesBucket;

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
        analysisId,
        dimmed,
        kind: n.kind,
      },
    };
  });

  const dimmedNodes = new Set(nodes.filter((node) => node.data.dimmed).map((node) => node.id));
  const edges: Edge[] = tree.edges
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      animated: e.kind === "direct",
      markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: e.kind === "direct" ? "#475569" : "#334155" },
      style: {
        stroke: e.kind === "direct" ? "#475569" : "#334155",
        strokeWidth: e.kind === "direct" ? 1.8 : 1.3,
        strokeDasharray: e.kind === "transitive" ? "4 4" : undefined,
        opacity: dimmedNodes.has(e.from) && dimmedNodes.has(e.to) ? 0.35 : 1,
      },
    }));

  return getLayoutedElements(nodes, edges);
}

function FitOnMount() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.1, duration: 500 }), 100);
  }, [fitView]);
  return null;
}

interface NodeDetailPanelProps {
  dependency: DependencyRecord | null;
  analysisId: string;
  onClose: () => void;
}

function NodeDetailPanel({ dependency, analysisId, onClose }: NodeDetailPanelProps) {
  if (!dependency) return null;
  const bucket = dependency.riskProfile?.riskBucket ?? "unscored";
  const c = BUCKET_COLORS[bucket];

  return (
    <div
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 280,
        background: "#161c27", borderLeft: "1px solid #2d3748",
        display: "flex", flexDirection: "column", zIndex: 10,
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {dependency.packageName}
          </div>
          <div style={{ fontSize: 11, color: "#4a5568", fontFamily: "monospace", marginTop: 2 }}>
            {dependency.packageVersion} · {dependency.ecosystem}
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 600, background: `${c.bg}`, color: c.text, border: `1px solid ${c.border}`, borderRadius: 4, padding: "1px 6px" }}>
              ● {bucket}
            </span>
            {dependency.direct && (
              <span style={{ fontSize: 9, fontWeight: 600, background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 4, padding: "1px 6px" }}>
                ◆ Direct
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {dependency.riskProfile && (
          <>
            <div>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: "#4a5568", marginBottom: 10 }}>Risk scores</div>
              {[
                { label: "12M Outlook", value: dependency.riskProfile.maintenanceOutlook12mScore, color: c.text },
                { label: "Sec. Posture", value: dependency.riskProfile.securityPostureScore, color: "#94a3b8" },
                { label: "Confidence", value: dependency.riskProfile.confidenceScore, color: "#6366f1" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "monospace" }}>
                      {value != null ? value.toFixed(2) : "—"}
                    </span>
                  </div>
                  <div style={{ height: 3, background: "#1e2535", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((value ?? 0) * 100).toFixed(0)}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>

            {dependency.riskProfile.actionLevel && (
              <div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: "#4a5568", marginBottom: 6 }}>Action level</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                  {dependency.riskProfile.actionLevel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </div>
              </div>
            )}
          </>
        )}

        {dependency.repository && (
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: "#4a5568", marginBottom: 8 }}>Repository</div>
            <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 5 }}>
              <div>{dependency.repository.fullName}</div>
              {dependency.repository.stars != null && (
                <div>★ {dependency.repository.stars.toLocaleString()} stars</div>
              )}
              {dependency.repository.recentContributors90d != null && (
                <div>{dependency.repository.recentContributors90d} contributors (90d)</div>
              )}
            </div>
          </div>
        )}

        <Link
          href={`/analyses/${analysisId}/dependencies/${dependency.id}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 14px",
            background: "rgba(99,102,241,0.1)", color: "#818cf8",
            border: "1px solid rgba(99,102,241,0.25)", borderRadius: 7,
            fontSize: 12, fontWeight: 600, textDecoration: "none",
            marginTop: "auto",
          }}
        >
          Full evidence view →
        </Link>
      </div>
    </div>
  );
}

interface DependencyTreeFullProps {
  dependencies: DependencyRecord[];
  graph: DependencyGraphResponse | null;
  analysisId: string;
  analysisTargetLabel?: string;
}

const BUCKET_OPTIONS: Array<{ value: RiskBucket | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "unscored" as RiskBucket, label: "Unscored" },
];

export function DependencyTreeFull({ dependencies, graph, analysisId, analysisTargetLabel }: DependencyTreeFullProps) {
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState<RiskBucket | "all">("all");
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);

  const depMap = useMemo(() => new Map(dependencies.map((d) => [d.id, d])), [dependencies]);
  const selectedDep = selectedDepId ? depMap.get(selectedDepId) ?? null : null;

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowData(dependencies, graph, search, bucketFilter, analysisId, analysisTargetLabel),
    [dependencies, graph, search, bucketFilter, analysisId, analysisTargetLabel]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialEdges, initialNodes, setEdges, setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const depId = (node as RiskNode).data.depId;
    setSelectedDepId((prev) => (depId && prev === depId ? null : depId ?? null));
  }, []);

  const totalNodes = initialNodes.length;

  return (
    <div style={{ position: "relative", height: "100%", background: "#0a0e15" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => setSelectedDepId(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.08}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ paddingRight: selectedDep ? 280 : 0 }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e2535" gap={22} size={1} />
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
          maskColor="rgba(10,14,21,0.7)"
        />

        {/* Top toolbar */}
        <Panel position="top-left">
          <div
            style={{
              display: "flex", alignItems: "center",
              background: "#161c27", border: "1px solid #2d3748",
              borderRadius: 9, padding: "6px 10px", gap: 8,
            }}
          >
            <Link
              href={`/analyses/${analysisId}`}
              style={{ display: "flex", alignItems: "center", gap: 4, color: "#64748b", fontSize: 12, textDecoration: "none" }}
            >
              <ArrowLeft size={13} /> Back
            </Link>
            <div style={{ width: 1, height: 18, background: "#2d3748" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b" }}>
              <Search size={12} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search packages…"
                style={{
                  background: "none", border: "none", outline: "none",
                  color: "#e2e8f0", fontSize: 12, width: 160,
                }}
              />
            </div>
            <div style={{ width: 1, height: 18, background: "#2d3748" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b" }}>
              <Filter size={12} />
              <select
                value={bucketFilter}
                onChange={(e) => setBucketFilter(e.target.value as RiskBucket | "all")}
                style={{ background: "none", border: "none", outline: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}
              >
                {BUCKET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: "#161c27" }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 1, height: 18, background: "#2d3748" }} />
            <span style={{ fontSize: 11, color: "#4a5568" }}>{totalNodes} nodes</span>
          </div>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left">
          <div
            style={{
              display: "flex", gap: 10, flexWrap: "wrap",
              background: "rgba(22,28,39,0.9)", border: "1px solid #2d3748",
              borderRadius: 8, padding: "8px 12px", backdropFilter: "blur(8px)",
            }}
          >
            {Object.entries(BUCKET_COLORS).map(([bucket, c]) => (
              <button
                key={bucket}
                onClick={() => setBucketFilter((prev) => prev === bucket ? "all" : bucket as RiskBucket)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: bucketFilter === bucket ? c.text : "#94a3b8",
                  opacity: bucketFilter !== "all" && bucketFilter !== bucket ? 0.4 : 1,
                  transition: "opacity 0.15s, color 0.15s",
                  padding: 0,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
                {bucket.charAt(0).toUpperCase() + bucket.slice(1)}
              </button>
            ))}
          </div>
        </Panel>

        <FitOnMount />
      </ReactFlow>

      {selectedDep && (
        <NodeDetailPanel
          dependency={selectedDep}
          analysisId={analysisId}
          onClose={() => setSelectedDepId(null)}
        />
      )}
    </div>
  );
}
