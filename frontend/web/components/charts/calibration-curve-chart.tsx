"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import type { CalibrationPoint } from "@/lib/ml-evaluation";

interface CalibrationCurveChartProps {
  data: CalibrationPoint[];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function CalibrationCurveChart({ data }: CalibrationCurveChartProps) {
  return (
    <Card className="h-[360px]">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Calibration</p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Logistic regression reliability curve</h2>
        <p className="text-sm text-muted">Observed outcomes stay close to predicted probabilities, which is why the Brier score is a key thesis metric.</p>
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
          <Legend />
          <Line type="monotone" dataKey="ideal" name="Ideal calibration" stroke="hsl(var(--muted))" strokeDasharray="6 4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="observed" name="Observed positive rate" stroke="hsl(var(--accent))" strokeWidth={3} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}