import { RepositoryRadar } from "@/components/repository-radar";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default function RepositoriesPage() {
  return (
    <WorkspaceLayout>
      <RepositoryRadar />
    </WorkspaceLayout>
  );
}
