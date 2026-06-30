import Link from "next/link";

import { InfoChipGroup } from "@/components/info-chip-group";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Card } from "@/components/ui/card";
import { modelFeatureGlossary } from "@/lib/metric-glossary";

const rules = [
  "Archived repos push risk up sharply.",
  "Older pushes and releases increase fragility.",
  "Thin maintainer depth increases concentration risk.",
  "Scorecard is context, not proof of trust.",
  "Missing signals lower confidence instead of being hidden.",
];

export default function MethodologyPage() {
  return (
    <WorkspaceLayout>
      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Methodology</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">The model feature layer in short form.</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Runtime scoring uses staged model artifacts built from public activity, release, contributor, backlog, and
          historical maintenance signals; Scorecard remains a separate security posture input.
        </p>
        <InfoChipGroup items={modelFeatureGlossary} />
      </Card>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {rules.map((rule) => (
          <Card key={rule} className="space-y-2">
            <p className="text-sm font-semibold leading-6 text-foreground">{rule}</p>
          </Card>
        ))}
      </section>
      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Artifact path</p>
        <p className="text-sm text-muted">
          The runtime scorer uses exported Logistic Regression and XGBoost artifacts evaluated with calibration-first
          metrics like Brier score. See{" "}
          <Link href="/ml-evaluation" className="font-medium text-accent">
            ML Results
          </Link>
          .
        </p>
      </Card>
      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Per-prediction confidence</p>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          AUROC, Brier, and ECE describe the model overall and are identical for every repository. To express how much to
          trust an <em>individual</em> repository&apos;s score, each prediction also carries a confidence built from three
          repository-specific factors, combined as their geometric mean (so one weak factor pulls the result down):
        </p>
        <ul className="max-w-3xl space-y-2 text-sm leading-7 text-muted">
          <li>
            <span className="font-semibold text-foreground">Data coverage</span> — share of expected maintenance signals
            actually observed; missing ones are imputed to the training-cohort average and add no evidence.
          </li>
          <li>
            <span className="font-semibold text-foreground">In-distribution fit</span> — share of observed features lying
            within 2 standard deviations of the training mean, i.e. not an extrapolation the model never saw.
          </li>
          <li>
            <span className="font-semibold text-foreground">Calibration support</span> — how many evaluation samples
            backed the calibration band the prediction falls in, mapped through count / (count + 30).
          </li>
        </ul>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          A separate <span className="font-semibold text-foreground">margin to threshold</span> reports how decisive the
          call is (distance of the calibrated probability from the decision threshold), kept distinct from confidence
          because a confident score can still sit close to the boundary.
        </p>
      </Card>
    </WorkspaceLayout>
  );
}
