"use client";

import { ArrowRight, FileUp, FlaskConical, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, startTransition, useState } from "react";

import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAnalysis, createUpload } from "@/lib/api";
import type { AnalysisSubmission, CreateUploadResponse, SubmissionKind } from "@/lib/types";

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
    kind: "upload",
    label: "Dependency File",
    description: "Register a manifest or lockfile.",
    icon: FileUp
  },
  {
    kind: "demo",
    label: "Demo Profile",
    description: "Open a seeded walkthrough.",
    icon: FlaskConical
  }
];

const supportedArtifacts = ["package-lock.json", "requirements.txt", "poetry.lock", "go.mod"];

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

      <div className="grid gap-2 md:grid-cols-3">
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
            <label className="flex items-center gap-3 text-sm text-[hsl(var(--muted))]">
              <input
                type="checkbox"
                checked={includeTransitiveDependencies}
                onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border))] bg-transparent"
              />
              Include transitive dependencies when available.
            </label>
          </div>
        ) : null}

        {mode === "upload" ? (
          <div className="space-y-4">
            <div className="rounded-[9px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
              <label htmlFor="artifact" className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                Dependency artifact
              </label>
              <Input
                id="artifact"
                type="file"
                accept=".json,.txt,.lock,.mod"
                onChange={handleFileChange}
                className="mt-3 file:mr-4 file:rounded-md file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-background"
              />
              <p className="mt-3 text-sm text-muted">
                Supported: {supportedArtifacts.join(", ")}
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={includeTransitiveDependencies}
                onChange={(event) => setIncludeTransitiveDependencies(event.target.checked)}
                className="h-4 w-4 rounded border-line bg-transparent"
              />
              Expand transitive dependencies when parsing supports it.
            </label>
            {selectedFile || uploadedArtifact ? (
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-muted">
                {selectedFile ? (
                  <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-emerald-700 dark:text-emerald-200">
                    {selectedFile.name} selected
                  </span>
                ) : null}
                {uploadedArtifact ? (
                  <span className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-accent">
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
          {submitting ? "Creating analysis..." : mode === "upload" ? "Upload and analyze" : mode === "demo" ? "Run demo analysis" : "Score and rank repository"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
