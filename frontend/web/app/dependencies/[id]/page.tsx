import { DependencyDetailCard } from "@/components/dependency-detail-card";
import { SiteHeader } from "@/components/site-header";

export default async function DependencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <SiteHeader />
      <DependencyDetailCard dependencyId={id} />
    </>
  );
}
