"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import type { ModelMetric } from "@/lib/ml-evaluation";

interface ModelMetricComparisonChartProps {
  data: ModelMetric[];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ModelMetricComparisonChart({ data }: ModelMetricComparisonChartProps) {
  return (
    <Card className="h-[360px]">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Model comparison</p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Ranking and classification metrics</h2>
        <p className="text-sm text-muted">AUROC, F1, and precision compared across the baseline and ML candidates.</p>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={data} barGap={10}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.6)" />
          <XAxis dataKey="model" tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
          <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted))" domain={[0, 1]} tickFormatter={formatPercent} />
          <Tooltip
            formatter={(value: number) => value.toFixed(3)}
            contentStyle={{
              borderRadius: 18,
              borderColor: "hsl(var(--border))",
              backgroundColor: "hsl(var(--panel))",
              color: "hsl(var(--foreground))"
            }}
          />
          <Legend />
          <Bar dataKey="auroc" name="AUROC" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
          <Bar dataKey="f1" name="F1" fill="hsl(var(--warning))" radius={[8, 8, 0, 0]} />
          <Bar dataKey="precision" name="Precision" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}