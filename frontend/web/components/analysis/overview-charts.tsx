"use client";

import type { AnalysisRecord } from "@oss-risk-radar/schemas";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";

const pieColors = ["#22c55e", "#38bdf8", "#f59e0b", "#ef4444"];

export function OverviewCharts({ analysis }: { analysis: AnalysisRecord }) {
  const riskData = Object.entries(analysis.summary.riskDistribution).map(([name, value]) => ({ name, value }));
  const ecosystemData = Object.entries(analysis.summary.ecosystemBreakdown).map(([name, value]) => ({ name, value }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Risk Distribution</p>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4}>
                {riskData.map((entry, index) => (
                  <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Ecosystem Coverage</p>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ecosystemData}>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
