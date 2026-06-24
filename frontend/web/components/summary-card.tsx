import { cn } from "@/lib/utils";

type Tone = "danger" | "warning" | "success" | "neutral";

interface SummaryCardProps {
  label: string;
  value: string | number;
  caption: string;
  tone?: Tone;
}

const toneAccent: Record<Tone, string> = {
  danger:  "bg-[hsl(var(--danger))]",
  warning: "bg-[hsl(var(--warning))]",
  success: "bg-[hsl(var(--success))]",
  neutral: "bg-[hsl(var(--border))]",
};

const toneValue: Record<Tone, string> = {
  danger:  "text-[hsl(var(--danger))]",
  warning: "text-[hsl(var(--warning))]",
  success: "text-[hsl(var(--success))]",
  neutral: "text-[hsl(var(--foreground))]",
};

export function SummaryCard({ label, value, caption, tone = "neutral" }: SummaryCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
      <div className={cn("absolute inset-y-0 left-0 w-[3px] rounded-l-xl", toneAccent[tone])} />
      <div className="flex flex-col gap-2.5 pl-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
          {label}
        </p>
        <p className={cn("text-4xl font-extrabold leading-none tracking-tight", toneValue[tone])}>
          {value}
        </p>
        <p className="text-xs leading-5 text-[hsl(var(--muted))]">{caption}</p>
      </div>
    </div>
  );
}
