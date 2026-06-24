import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <WorkspaceLayout>
      <AnalysisDashboard analysisId={id} />
    </WorkspaceLayout>
  );
}
