/** Monospaced command/code block for the documentation runbooks. */
export function CodeBlock({ children, caption }: { children: string; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-[hsl(var(--background))]">
      {caption ? (
        <figcaption className="border-b border-line bg-panelAlt px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">
          {caption}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3 text-[12.5px] leading-6 text-foreground">
        <code className="font-mono">{children}</code>
      </pre>
    </figure>
  );
}
