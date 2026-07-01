"use client";

import { useState, type ReactNode } from "react";

/**
 * Minimal hover/focus tooltip. There is no external popover primitive in the project, so this is a
 * lightweight, dependency-free implementation used to surface feature explanations inline.
 */
export function InfoTooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex cursor-help items-center border-b border-dotted border-[hsl(var(--muted)/0.6)] text-left"
        aria-expanded={open}
      >
        {children}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-1.5 w-64 rounded-lg border border-line bg-panel px-3 py-2 text-left text-xs font-normal leading-5 text-muted shadow-panel"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
