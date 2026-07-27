import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatEvidenceSupport, formatOutlookScore, formatRiskScore, formatScore } from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatEvidenceSupport, formatOutlookScore, formatRiskScore, formatScore };

