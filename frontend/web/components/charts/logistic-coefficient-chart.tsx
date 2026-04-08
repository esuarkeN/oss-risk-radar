"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import type { LogisticCoefficient } from "@/lib/ml-evaluation";

interface LogisticCoefficientChartProps {
  data: LogisticCoefficient[];
}

export function LogisticCoefficientChart({ data }: LogisticCoefficientChartProps) {
  return (
    <Card className="h-[420px]">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Interpretability</p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Top logistic regression coefficients</h2>
        <p className="text-sm text-muted">Positive weights push a dependency toward higher fragility risk. Negative weights lower that risk estimate.</p>
      </div>
      <ResponsiveContainer width="100%" height="82%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
          <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border) / 0.6)" />
          <XAxis type="number" tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
          <YAxis dataKey="feature" type="category" width={150} tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
          <Tooltip
            formatter={(value: number) => value.toFixed(2)}
            contentStyle={{
              borderRadius: 18,
              borderColor: "hsl(var(--border))",
              backgroundColor: "hsl(var(--panel))",
              color: "hsl(var(--foreground))"
            }}
          />
          <Bar dataKey="weight" radius={[8, 8, 8, 8]}>
            {data.map((entry) => (
              <Cell key={entry.feature} fill={entry.weight >= 0 ? "hsl(var(--danger))" : "hsl(var(--success))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}