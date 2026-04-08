import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { formatConfidence, formatRiskScore, formatScore } from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatConfidence, formatRiskScore, formatScore };

