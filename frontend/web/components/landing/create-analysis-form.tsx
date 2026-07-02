"use client";

import { ArrowRight, FlaskConical, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useState } from "react";

import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAnalysis } from "@/lib/api";
import type { AnalysisSubmission, SubmissionKind } from "@/lib/types";

const submissionModes: Array<{
  kind: SubmissionKind;
  label: string;
  description: string;
  icon: typeof GitBranch;
}> = [
  {
    kind: "repository_url",
    label: "Repository URL",
    description: "Score a GitHub repository directly.",
    icon: GitBranch
  },
  {
    kind: "demo",
    label: "Demo Profile",
    description: "Open a seeded walkthrough.",
    icon: FlaskConical
  }
];

function analysisHref(analysisId: string, cached: boolean) {
  const normalizedId = analysisId.trim();
  if (!normalizedId) {
    throw new Error("The API created an analysis without returning an analysis id.");
  }
  return cached ? `/analyses/${encodeURIComponent(normalizedId)}?cached=1` : `/analyses/${encodeURIComponent(normalizedId)}`;
}

export function CreateAnalysisForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<SubmissionKind>("repository_url");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [demoProfile, setDemoProfile] = useState("thesis-demo");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      let submission: AnalysisSubmission;

      if (mode === "repository_url") {
        submission = {
          kind: "repository_url",
          repositoryUrl
        };
      } else {
        submission = {
          kind: "demo",
          demoProfile
        };
      }

      const response = await createAnalysis({ submission });
      toast({
        tone: "success",
        title: response.reusedExistingAnalysis ? "Opening cached analysis" : "Analysis created",
        description: response.reusedExistingAnalysis
          ? "A matching result already existed, so the saved analysis is opening immediately."
          : "The analysis job started and the detail page is opening now.",
      });
      const targetHref = analysisHref(response.analysis.id, response.reusedExistingAnalysis);
      startTransition(() => {
        router.push(targetHref);
      });
    } catch (caught) {
      toast({
        tone: "error",
        title: "Analysis creation failed",
        description: caught instanceof Error ? caught.message : "Failed to create analysis.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">Intake mode</p>
          <h2 className="mt-2 text-lg font-bold leading-tight tracking-tight text-[hsl(var(--foreground))]">
            Run an OSS risk read.
          </h2>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {submissionModes.map((option) => {
          const selected = option.kind === mode;
          const Icon = option.icon;
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() => setMode(option.kind)}
              className={`rounded-[9px] border px-4 py-3.5 text-left transition ${
                selected
                  ? "border-[hsl(var(--accent)/0.5)] bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--accent)/0.3)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <p className="mt-2.5 text-sm font-semibold tracking-tight">{option.label}</p>
              <p className={`mt-1 text-xs leading-5 ${selected ? "text-[hsl(var(--accent)/0.75)]" : "text-[hsl(var(--muted))]"}`}>{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-[9px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
        {mode === "repository_url" ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="repositoryUrl" className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                GitHub repository URL
              </label>
              <Input
                id="repositoryUrl"
                required
                type="url"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://github.com/org/repository"
                className="mt-2"
              />
            </div>
            <p className="text-sm text-[hsl(var(--muted))]">
              Each repository is scored on its own. A project&apos;s dependency inventory is expected to come from an
              external software-composition-analysis tool (for example the OSS Review Toolkit).
            </p>
          </div>
        ) : null}

        {mode === "demo" ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="demoProfile" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Demo profile
              </label>
              <select
                id="demoProfile"
                value={demoProfile}
                onChange={(event) => setDemoProfile(event.target.value)}
                className="mt-2 h-12 w-full rounded-md border border-line bg-panel px-4 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              >
                <option value="thesis-demo">Thesis demo</option>
                <option value="portfolio-demo">Portfolio demo</option>
                <option value="maintainer-fragility-demo">Maintainer fragility demo</option>
              </select>
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-100">
              Representative evidence and explanation factors only.
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[hsl(var(--muted))]">
          Triage signal only. Evidence stays reviewable.
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating analysis..." : mode === "demo" ? "Run demo analysis" : "Score and rank repository"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
