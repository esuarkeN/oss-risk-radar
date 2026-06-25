import { notFound } from "next/navigation";

import { DependencyTreeFull } from "@/components/dependency-tree-full";
import { AppSidebar } from "@/components/app-sidebar";
import { getAnalysis, getDependencies, getDependencyGraph } from "@/lib/api";

export default async function DependencyTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [analysis, dependencies, graph] = await Promise.all([
      getAnalysis(id),
      getDependencies(id),
      getDependencyGraph(id),
    ]);
    const analysisTargetLabel = analysis.submission.repositoryUrl ?? analysis.submission.artifactName ?? "Demo analysis";

    return (
      <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Full-viewport tree canvas — no extra padding, fills everything */}
          <div className="flex-1 overflow-hidden">
            <DependencyTreeFull
              dependencies={dependencies}
              graph={graph}
              analysisId={id}
              analysisTargetLabel={analysisTargetLabel}
            />
          </div>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
