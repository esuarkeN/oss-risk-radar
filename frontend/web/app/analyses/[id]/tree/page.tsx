import { notFound } from "next/navigation";

import { DependencyTreeFull } from "@/components/dependency-tree-full";
import { AppSidebar } from "@/components/app-sidebar";
import { getDependencies, getDependencyGraph } from "@/lib/api";

export default async function DependencyTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [dependencies, graph] = await Promise.all([
      getDependencies(id),
      getDependencyGraph(id),
    ]);

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
            />
          </div>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
