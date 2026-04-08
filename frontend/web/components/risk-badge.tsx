import type { RiskBucket } from "@oss-risk-radar/schemas";

import { Badge } from "@/components/ui/badge";

interface RiskBadgeProps {
  bucket?: RiskBucket | string;
}

const bucketToTone: Record<string, "low" | "medium" | "high" | "critical"> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical"
};

export function RiskBadge({ bucket }: RiskBadgeProps) {
  const resolvedBucket = bucketToTone[bucket ?? ""] ? (bucket as keyof typeof bucketToTone) : undefined;

  return <Badge tone={resolvedBucket ? bucketToTone[resolvedBucket] : "neutral"}>{bucket ?? "unscored"}</Badge>;
}

