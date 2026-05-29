import { Card } from "@/components/ui/card";

interface SummaryCardProps {
  label: string;
  value: string | number;
  caption: string;
}

export function SummaryCard({ label, value, caption }: SummaryCardProps) {
  return (
    <Card className="min-h-40 border-line bg-panel p-5">
      <div className="flex h-full flex-col justify-between gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        <div>
          <p className="text-5xl font-semibold leading-none tracking-tight text-foreground">{value}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{caption}</p>
        </div>
      </div>
    </Card>
  );
}
