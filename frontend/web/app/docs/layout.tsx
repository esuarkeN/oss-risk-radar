import type { ReactNode } from "react";

import { DocsShell } from "@/components/docs/docs-shell";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceLayout>
      <DocsShell>{children}</DocsShell>
    </WorkspaceLayout>
  );
}
