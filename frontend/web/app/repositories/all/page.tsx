import { RepositoryDirectory } from "@/components/repository-directory";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default function RepositoryDirectoryPage() {
  return (
    <WorkspaceLayout>
      <RepositoryDirectory />
    </WorkspaceLayout>
  );
}
