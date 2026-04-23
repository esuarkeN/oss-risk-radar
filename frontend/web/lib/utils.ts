import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatConfidence, formatOutlookScore, formatRiskScore, formatScore } from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatConfidence, formatOutlookScore, formatRiskScore, formatScore };

