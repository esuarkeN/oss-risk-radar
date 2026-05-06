import { Card } from "@/components/ui/card";

interface SummaryCardProps {
  label: string;
  value: string | number;
  caption: string;
}

export function SummaryCard({ label, value, caption }: SummaryCardProps) {
  return (
    <Card className="space-y-2 border-line/80 bg-[linear-gradient(180deg,hsl(var(--panel))_0%,hsl(var(--panel-alt))_100%)]">
      <p className="text-xs uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm text-muted">{caption}</p>
    </Card>
  );
}
