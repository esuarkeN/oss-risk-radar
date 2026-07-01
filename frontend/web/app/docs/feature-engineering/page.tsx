import { Card } from "@/components/ui/card";

const engineeringPrinciples = [
  {
    title: "Trailing time windows",
    body: "A numeric suffix is a window ending at the observation time t: _30d, _90d and _365d count events in the last 30, 90 and 365 days, while _at_obs is a state measured exactly at t.",
  },
  {
    title: "Only the past is used",
    body: "Every value is computed from information available at or before t. Nothing after t enters a feature — that keeps the setup honest as an early-warning prediction rather than hindsight.",
  },
  {
    title: "Relative, not just absolute",
    body: "Where a raw count would not compare fairly across project sizes, the feature set adds a ratio, a share, or a year-over-year change — a large and a small project can be equally well or badly maintained at very different volumes.",
  },
  {
    title: "Steadiness over bursts",
    body: "Signals like active commit months and the activity drop capture whether work is sustained and whether it is decelerating, not only how much happened.",
  },
];

export default function FeatureEngineeringPage() {
  return (
    <Card className="animate-slide-up space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Data &amp; features</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          From raw activity to comparable signals
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
          The same rules explain the recurring suffixes in the feature names and keep signals comparable across very
          different projects.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {engineeringPrinciples.map((principle) => (
          <div key={principle.title} className="rounded-xl border border-line bg-panelAlt p-4">
            <p className="text-sm font-semibold text-foreground">{principle.title}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{principle.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
