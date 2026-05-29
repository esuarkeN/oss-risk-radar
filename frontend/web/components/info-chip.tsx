import { Info } from "lucide-react";

export function InfoChip({ label, description }: { label: string; description: string }) {
  return (
    <details className="group relative inline-block">
      <summary className="flex list-none cursor-pointer items-center gap-2 rounded-md border border-line bg-panelAlt px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent">
        {label}
        <Info className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute left-0 top-[calc(100%+0.65rem)] z-20 w-72 rounded-lg border border-line bg-panel p-4 text-sm leading-6 text-muted shadow-soft">
        {description}
      </div>
    </details>
  );
}
