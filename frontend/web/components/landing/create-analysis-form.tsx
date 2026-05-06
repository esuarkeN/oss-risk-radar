"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, startTransition, useState } from "react";

import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createAnalysis, createUpload } from "@/lib/api";
import type { AnalysisSubmission, CreateUploadResponse, SubmissionKind } from "@/lib/types";

const submissionModes: Array<{
  kind: SubmissionKind;
  label: string;
  description: string;
}> = [
  {
    kind: "repository_url",
    label: "Repository URL",
    description: "Score and rank a GitHub repository directly. If supported manifests are present, the analysis also adds dependency-level findings."
  },
  {
    kind: "upload",
    label: "Dependency File",
    description: "Register a manifest or lockfile such as package-lock.json, requirements.txt, poetry.lock, or go.mod."
  },
  {
    kind: "demo",
    label: "Demo Profile",
    description: "Open the seeded walkthrough with realistic mocked evidence, graph context, and explanation factors."
  }
];

const supportedArtifacts = ["package-lock.json", "requirements.txt", "poetry.lock", "go.mod"];

export function CreateAnalysisForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<SubmissionKind>("repository_url");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [includeTransitiveDependencies, setIncludeTransitiveDependencies] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedArtifact, setUploadedArtifact] = useState<CreateUploadResponse["upload"] | null>(null);
  const [demoProfile, setDemoProfile] = useState("thesis-demo");
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadedArtifact(null);
    if (file) {
      toast({
        tone: "info",
        title: "Artifact selected",
        description: `${file.name} is ready for upload-backed analysis.`,
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      let submission: AnalysisSubmission;

      if (mode === "repository_url") {
        submission = {
          kind: "repository_url",
          repositoryUrl,
          includeTransitiveDependencies
        };
      } else if (mode === "upload") {
        if (!selectedFile && !uploadedArtifact) {
          throw new Error("Choose a dependency artifact before creating an upload-based analysis.");
        }

        const shouldRegisterUpload = !uploadedArtifact;
        const upload = uploadedArtifact ?? (await createUpload(selectedFile as File)).upload;
        setUploadedArtifact(upload);
        if (shouldRegisterUpload) {
          toast({
            tone: "success",
            title: "Upload registered",
            description: `${upload.fileName} is now attached with provenance before the analysis starts.`,
          });
        }

        submission = {
          kind: "upload",
          uploadId: upload.id,
          artifactName: selectedFile?.name ?? upload.fileName,
          includeTransitiveDependencies
        };
      } else {
        submission = {
          kind: "demo",
          demoProfile,
          includeTransitiveDependencies: true
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
      startTransition(() => {
        router.push(response.reusedExistingAnalysis ? `/analyses/${response.analysis.id}?cached=1` : `/analyses/${response.analysis.id}`);
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
    <div className="grid gap-4">
      <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-panel/85 p-7 shadow-soft backdrop-blur">
        <p className="text-xs uppercase tracking-[0.28em] text-accent">Start Analysis</p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Clean intake, fast triage, no extra ceremony.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted md:text-base">
              Choose a repo URL, dependency artifact, or demo profile. New OSS repositories are scored with the same signals used for the training base.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-line bg-panelAlt/80 px-4 py-3 text-sm text-muted">
            Repository mode scores and ranks the repo directly.
            <br />
            Upload mode preserves artifact provenance before analysis starts.
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {submissionModes.map((option) => {
            const selected = option.kind === mode;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => setMode(option.kind)}
                className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                  selected
                    ? "border-accent/40 bg-accent/12 text-foreground"
                    : "border-line bg-panelAlt/70 text-foreground hover:border-accent/20 hover:bg-panelAlt"
                }`}
              >
                <p className="text-sm font-semibold tracking-tight">{option.label}</p>
                <p className="mt-2 text-xs leading-6 text-muted">{option.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-[1.6rem] border border-line bg-panelAlt/70 p-5">
          {mode === "repository_url" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="repositoryUrl" className="text-xs uppercase tracking-[0.2em] text-muted">
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
                <p className="mt-3 text-sm text-muted">
                  Paste a GitHub URL. The run always produces a repository profile that can be compared with the ranked OSS training base.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={includeTransitiveDependencies}
                  onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                  className="h-4 w-4 rounded border-line bg-transparent"
                />
                Include transitive dependencies when the backend can resolve them.
              </label>
            </div>
          ) : null}

          {mode === "upload" ? (
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-dashed border-line bg-panel/70 p-5">
                <label htmlFor="artifact" className="text-xs uppercase tracking-[0.2em] text-muted">
                  Dependency artifact
                </label>
                <Input
                  id="artifact"
                  type="file"
                  accept=".json,.txt,.lock,.mod"
                  onChange={handleFileChange}
                  className="mt-3 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-white dark:file:text-slate-950"
                />
                <p className="mt-3 text-sm text-muted">
                  Supported first-wave artifacts: {supportedArtifacts.join(", ")}. Upload registration happens first so provenance survives into the analysis.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={includeTransitiveDependencies}
                  onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                  className="h-4 w-4 rounded border-line bg-transparent"
                />
                Ask the backend to expand transitives when parsing supports it.
              </label>
              {selectedFile || uploadedArtifact ? (
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                  {selectedFile ? (
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-emerald-700 dark:text-emerald-200">
                      {selectedFile.name} selected
                    </span>
                  ) : null}
                  {uploadedArtifact ? (
                    <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sky-700 dark:text-sky-200">
                      Upload registered
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "demo" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="demoProfile" className="text-xs uppercase tracking-[0.2em] text-muted">
                  Demo profile
                </label>
                <select
                  id="demoProfile"
                  value={demoProfile}
                  onChange={(event) => setDemoProfile(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-line bg-panel px-4 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                >
                  <option value="thesis-demo">Thesis demo</option>
                  <option value="portfolio-demo">Portfolio demo</option>
                  <option value="maintainer-fragility-demo">Maintainer fragility demo</option>
                </select>
              </div>
              <div className="rounded-[1.25rem] border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-100">
                Demo mode remains conservative: it shows representative evidence and explanations, not a claim about a live package ecosystem.
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted">
            Analyses support triage and monitoring. They do not certify packages as safe or unsafe.
          </div>
          <Button type="submit" disabled={submitting} className="bg-accent/15 text-accent hover:bg-accent/25">
            {submitting ? "Creating analysis..." : mode === "upload" ? "Upload and analyze" : mode === "demo" ? "Run demo analysis" : "Score and rank repository"}
          </Button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Explainable evidence", "Each score keeps factors, missing signals, and provenance visible for analyst review."],
          ["Provider-aware intake", "Repository and upload modes align with deps.dev, GitHub, and Scorecard-backed enrichment paths."],
          ["Operational caution", "The dashboard frames outputs as risk profiles and action cues, not definitive trust verdicts."]
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

