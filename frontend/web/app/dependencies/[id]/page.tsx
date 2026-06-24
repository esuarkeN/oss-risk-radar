import { DependencyDetailCard } from "@/components/dependency-detail-card";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default async function DependencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <WorkspaceLayout>
      <DependencyDetailCard dependencyId={id} />
    </WorkspaceLayout>
  );
}
