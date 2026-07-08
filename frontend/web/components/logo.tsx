import type { SVGProps } from "react";

/**
 * OSS Risk Radar brand mark — a lighthouse beacon.
 * The beam sweeps a risk blip (amber) out of the dark; the tower reads as a
 * fixed point of warning. Standalone mark, drawn in the product accent teal.
 */
export function Logo({
  className = "h-7 w-7",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="OSS Risk Radar"
      {...props}
    >
      {/* beams */}
      <path d="M60 42 L18 30 L20 52 Z" fill="#2FE6C8" fillOpacity={0.26} />
      <path d="M60 42 L102 30 L100 52 Z" fill="#2FE6C8" fillOpacity={0.26} />
      {/* roof */}
      <path d="M52 34 L60 24 L68 34 Z" fill="#2FE6C8" />
      {/* lamp */}
      <rect x="53" y="34" width="14" height="12" rx="2" fill="#E9F2F0" />
      {/* tower */}
      <path d="M50 92 L54 46 L66 46 L70 92 Z" fill="#2FE6C8" />
      {/* tower stripe */}
      <path
        d="M52.6 69 L67.4 69 L68.2 80 L51.8 80 Z"
        fill="#E9F2F0"
        fillOpacity={0.9}
      />
      {/* base */}
      <rect x="44" y="92" width="32" height="6" rx="2" fill="#2FE6C8" />
      {/* risk blip in beam */}
      <circle cx="30" cy="38" r="2.6" fill="#F6A21E" />
    </svg>
  );
}
