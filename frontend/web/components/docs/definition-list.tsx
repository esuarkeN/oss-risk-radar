import type { InfoChipItem } from "@/components/info-chip-group";

/**
 * Flowing, well-formatted term/description list for documentation. Replaces the popover chips on
 * reading-oriented pages, where absolutely-positioned popups overlapped surrounding text.
 */
export function DefinitionList({ items }: { items: InfoChipItem[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[210px_1fr] sm:gap-5">
          <dt className="text-sm font-semibold text-foreground">{item.label}</dt>
          <dd className="text-sm leading-6 text-muted">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
