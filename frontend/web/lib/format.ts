export function formatPercent(value: number, maximumFractionDigits = 0) {
  return `${value.toFixed(maximumFractionDigits)}%`;
}

export function formatScore(value: number) {
  return value.toFixed(0);
}

export function formatRiskScore(value: number) {
  return Math.round(value).toString();
}

export function formatOutlookScore(value: number) {
  return `${Math.round(value)}%`;
}

export function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatPath(path: string[]) {
  return path.join(" -> ");
}

