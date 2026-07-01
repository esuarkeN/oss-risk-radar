"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { featureCatalogByGroup } from "@/lib/feature-catalog";

/**
 * Searchable, grouped reference for the 43 full-history features. Content comes from the shared
 * feature catalog (lib/feature-catalog.ts), the same source used by the analysis-panel tooltips and
 * mirrored from the thesis appendix.
 */
export function FeatureGlossary() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return featureCatalogByGroup()
      .map(({ group, features }) => ({
        group,
        features: needle
          ? features.filter((f) =>
              `${f.label} ${f.key} ${f.definition} ${f.rationale}`.toLowerCase().includes(needle),
            )
          : features,
      }))
      .filter((entry) => entry.features.length > 0);
  }, [query]);

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="Search features — name, meaning, or reason…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search features"
      />

      {groups.length === 0 ? (
        <p className="text-sm text-muted">No features match “{query}”.</p>
      ) : (
        groups.map(({ group, features }) => (
          <details key={group.group} open className="rounded-xl border border-line bg-panel p-5">
            <summary className="cursor-pointer list-none">
              <span className="text-base font-semibold text-foreground">{group.group}</span>
              <span className="ml-2 text-xs text-muted">{group.blurb}</span>
            </summary>
            <div className="mt-4 space-y-3">
              {features.map((f) => (
                <div key={f.key} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-foreground">{f.label}</span>
                    <code className="rounded bg-panelAlt px-1.5 py-0.5 font-mono text-[11px] text-muted">{f.key}</code>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-muted">{f.window}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{f.definition}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    <span className="font-semibold text-foreground">Why:</span> {f.rationale}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ))
      )}
    </div>
  );
}
