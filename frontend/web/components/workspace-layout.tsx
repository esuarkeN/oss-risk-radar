import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] space-y-6 p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
