"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";

interface TrainingMetricHistoryPoint {
  label: string;
  auroc: number;
  brier: number;
}

interface TrainingMetricHistoryChartProps {
  data: TrainingMetricHistoryPoint[];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function TrainingMetricHistoryChart({ data }: TrainingMetricHistoryChartProps) {
  return (
    <Card className="h-[360px]">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Metric history</p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">AUROC and Brier across cached training runs</h2>
        <p className="text-sm text-muted">This makes model progress visible over time from the cached run artifacts, which is useful for thesis reporting and regressions.</p>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.6)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
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
          <Line type="monotone" dataKey="auroc" name="AUROC" stroke="hsl(var(--accent))" strokeWidth={3} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="brier" name="Brier" stroke="hsl(var(--warning))" strokeWidth={3} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
