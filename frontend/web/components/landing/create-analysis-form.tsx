"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, startTransition, useState } from "react";

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
    description: "Rate a GitHub repository directly. If supported manifests are present, the analysis also adds dependency-level findings."
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
  const [mode, setMode] = useState<SubmissionKind>("repository_url");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [includeTransitiveDependencies, setIncludeTransitiveDependencies] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedArtifact, setUploadedArtifact] = useState<CreateUploadResponse["upload"] | null>(null);
  const [demoProfile, setDemoProfile] = useState("thesis-demo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadedArtifact(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

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

        const upload = uploadedArtifact ?? (await createUpload(selectedFile as File)).upload;
        setUploadedArtifact(upload);

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
      startTransition(() => {
        router.push(response.reusedExistingAnalysis ? `/analyses/${response.analysis.id}?cached=1` : `/analyses/${response.analysis.id}`);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create analysis.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-panel/85 p-7 shadow-soft backdrop-blur">
        <p className="text-sm uppercase tracking-[0.28em] text-accent">Decision Support for OSS Triage</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Run a repository rating or artifact-based analysis and review maintenance risk in a transparent workflow.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-muted md:text-lg">
          Repository URLs always create a scoreable repository profile. If the backend finds a supported manifest, it expands the same run with dependency-level evidence.
        </p>

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
                    ? "border-accent/50 bg-accent/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <p className="text-sm font-semibold tracking-tight">{option.label}</p>
                <p className="mt-2 text-xs leading-6 text-slate-300">{option.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-5">
          {mode === "repository_url" ? (
            <div className="space-y-4">
              <div>
              <label htmlFor="repositoryUrl" className="text-xs uppercase tracking-[0.2em] text-slate-300">
                  GitHub repository URL
                </label>
                <Input
                  id="repositoryUrl"
                  required
                  type="url"
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="https://github.com/org/repository"
                  className="mt-2 border-white/10 bg-white text-slate-950"
                />
                <p className="mt-3 text-sm text-slate-300">
                  Paste a GitHub URL and run the rating. The analysis will always score the repository itself, even when no supported lockfile is found.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={includeTransitiveDependencies}
                  onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                Include transitive dependencies when the backend can resolve them.
              </label>
            </div>
          ) : null}

          {mode === "upload" ? (
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-dashed border-white/20 bg-white/5 p-5">
                <label htmlFor="artifact" className="text-xs uppercase tracking-[0.2em] text-slate-300">
                  Dependency artifact
                </label>
                <Input
                  id="artifact"
                  type="file"
                  accept=".json,.txt,.lock,.mod"
                  onChange={handleFileChange}
                  className="mt-3 border-white/10 bg-white text-slate-950 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                <p className="mt-3 text-sm text-slate-300">
                  Supported first-wave artifacts: {supportedArtifacts.join(", ")}. Upload registration happens before the analysis job starts so the backend can preserve provenance.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={includeTransitiveDependencies}
                  onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                Ask the backend to expand transitives when parsing supports it.
              </label>
              {selectedFile ? (
                <div className="rounded-[1.25rem] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  Selected artifact: <span className="font-semibold">{selectedFile.name}</span> ({Math.round(selectedFile.size / 1024)} KB)
                </div>
              ) : null}
              {uploadedArtifact ? (
                <div className="rounded-[1.25rem] border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                  Registered upload <span className="font-semibold">{uploadedArtifact.fileName}</span> with status {uploadedArtifact.status}.
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "demo" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="demoProfile" className="text-xs uppercase tracking-[0.2em] text-slate-300">
                  Demo profile
                </label>
                <select
                  id="demoProfile"
                  value={demoProfile}
                  onChange={(event) => setDemoProfile(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm text-slate-950 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                >
                  <option value="thesis-demo">Thesis demo</option>
                  <option value="portfolio-demo">Portfolio demo</option>
                  <option value="maintainer-fragility-demo">Maintainer fragility demo</option>
                </select>
              </div>
              <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                Demo mode remains conservative: it shows representative evidence and explanations, not a claim about a live package ecosystem.
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submitting} className="bg-accent/20 text-accent hover:bg-accent/30">
            {submitting ? "Creating analysis..." : mode === "upload" ? "Upload and analyze" : mode === "demo" ? "Run demo analysis" : "Run repository rating"}
          </Button>
          <p className="text-sm text-slate-300">
            Analyses support triage and monitoring. They do not certify packages as safe or unsafe.
          </p>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Explainable evidence", "Each score keeps factors, missing signals, and provenance visible for analyst review."],
          ["Provider-aware intake", "Repository and upload modes align with deps.dev, GitHub, and Scorecard-backed enrichment paths."],
          ["Operational caution", "The dashboard frames outputs as risk profiles and action cues, not definitive trust verdicts."]
        ].map(([title, body]) => (
          <Card key={title} className="border-white/10 bg-panelAlt/80 text-white">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

