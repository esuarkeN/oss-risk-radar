import { Card } from "@/components/ui/card";

interface SummaryCardProps {
  label: string;
  value: string | number;
  caption: string;
}

export function SummaryCard({ label, value, caption }: SummaryCardProps) {
  return (
    <Card className="space-y-3 bg-slate-950 text-white">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-sm text-slate-300">{caption}</p>
    </Card>
  );
}
