/**
 * Remembers the most recently opened analysis so the user can resume it from the landing page
 * and the sidebar. Stored in localStorage (same pattern as the theme toggle); safe to call on the
 * server (returns null / no-ops) since it guards on `window`.
 */

const STORAGE_KEY = "oss-risk-radar-last-analysis";

export interface LastAnalysis {
  id: string;
  label: string;
  savedAt: string;
}

export function setLastAnalysis(id: string, label: string): void {
  if (typeof window === "undefined" || !id) {
    return;
  }
  try {
    const payload: LastAnalysis = { id, label, savedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota) — resume is a convenience, not critical state.
  }
}

export function getLastAnalysis(): LastAnalysis | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LastAnalysis>;
    if (parsed && typeof parsed.id === "string" && parsed.id) {
      return { id: parsed.id, label: typeof parsed.label === "string" ? parsed.label : parsed.id, savedAt: parsed.savedAt ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}
