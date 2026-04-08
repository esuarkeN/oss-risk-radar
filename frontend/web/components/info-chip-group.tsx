import { InfoChip } from "@/components/info-chip";

export interface InfoChipItem {
  label: string;
  description: string;
}

export function InfoChipGroup({ items }: { items: InfoChipItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <InfoChip key={item.label} label={item.label} description={item.description} />
      ))}
    </div>
  );
}