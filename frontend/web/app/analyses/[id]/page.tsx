import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { SiteHeader } from "@/components/site-header";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <SiteHeader />
      <AnalysisDashboard analysisId={id} />
    </>
  );
}
