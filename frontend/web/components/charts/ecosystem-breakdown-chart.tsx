"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";

const COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--danger))"
];

interface EcosystemBreakdownChartProps {
  breakdown: Record<string, number>;
}

export function EcosystemBreakdownChart({ breakdown }: EcosystemBreakdownChartProps) {
  const data = Object.entries(breakdown).map(([name, value]) => ({ name, value }));

  return (
    <Card className="h-[320px]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Ecosystem Mix</h3>
        <p className="text-sm text-muted">Direct and transitive packages grouped by ecosystem.</p>
      </div>
      <ResponsiveContainer width="100%" height="82%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 18,
              borderColor: "hsl(var(--border))",
              backgroundColor: "hsl(var(--panel))",
              color: "hsl(var(--foreground))"
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}