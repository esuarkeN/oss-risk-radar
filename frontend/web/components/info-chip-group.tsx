/**
 * Shared shape for a labelled definition item. The popover-based InfoChip/InfoChipGroup were
 * removed in favour of flowing text (see components/docs/definition-list.tsx); this type is kept
 * because several glossaries and pages still describe their items with it.
 */
export interface InfoChipItem {
  label: string;
  description: string;
}
