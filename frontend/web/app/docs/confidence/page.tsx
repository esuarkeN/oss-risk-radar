import { Card } from "@/components/ui/card";

const confidenceFactors = [
  {
    title: "Data coverage",
    body: "Share of expected maintenance signals actually observed; missing ones are filled with the training-cohort average and add no evidence.",
  },
  {
    title: "In-distribution fit",
    body: "Share of observed signals that sit within the normal range the model was trained on, rather than an extreme it never saw.",
  },
  {
    title: "Evidence support",
    body: "How many past examples backed the band this prediction falls in — more support means a steadier estimate.",
  },
];

export default function ConfidencePage() {
  return (
    <Card className="animate-slide-up space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Scoring</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          How much to trust an individual score
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
          Overall model performance is the same for every repository. To say how much to trust an <em>individual</em>{" "}
          score, each prediction also carries a confidence built from three repository-specific factors — one weak
          factor pulls the whole thing down.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {confidenceFactors.map((factor) => (
          <div key={factor.title} className="rounded-xl border border-line bg-panelAlt p-4">
            <p className="text-sm font-semibold text-foreground">{factor.title}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{factor.body}</p>
          </div>
        ))}
      </div>
      <p className="max-w-3xl text-sm leading-7 text-muted">
        A separate <span className="font-semibold text-foreground">margin</span> shows how decisive a call is — how far
        the score sits from the boundary between buckets — kept apart from confidence because a confident score can
        still land close to the line.
      </p>
    </Card>
  );
}
