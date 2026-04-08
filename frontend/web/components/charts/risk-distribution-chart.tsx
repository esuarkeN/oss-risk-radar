"use client";

import { ResponsiveContainer, Tooltip, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";

interface RiskDistributionChartProps {
  distribution: Record<string, number>;
}

export function RiskDistributionChart({ distribution }: RiskDistributionChartProps) {
  const data = Object.entries(distribution).map(([bucket, count]) => ({ bucket, count }));

  return (
    <Card className="h-[320px]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Risk Distribution</h3>
        <p className="text-sm text-muted">Counts by current heuristic inactivity bucket.</p>
      </div>
      <ResponsiveContainer width="100%" height="82%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.65)" />
          <XAxis dataKey="bucket" stroke="hsl(var(--muted))" />
          <YAxis allowDecimals={false} stroke="hsl(var(--muted))" />
          <Tooltip
            contentStyle={{
              borderRadius: 18,
              borderColor: "hsl(var(--border))",
              backgroundColor: "hsl(var(--panel))",
              color: "hsl(var(--foreground))"
            }}
          />
          <Bar dataKey="count" fill="hsl(var(--accent))" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}