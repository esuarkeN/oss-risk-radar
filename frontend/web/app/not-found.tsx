import { ArrowLeft, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { WorkspaceLayout } from "@/components/workspace-layout";

export default function NotFound() {
  return (
    <WorkspaceLayout>
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-lg rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-8 text-center shadow-soft sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Not Found</p>
          <h1 className="mt-4 text-3xl font-bold text-foreground">This page is not available.</h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            The URL does not match an available dashboard, or the referenced analysis is no longer in the API store.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/repositories"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--accent)/0.4)] bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--accent)/0.85)]"
            >
              <LayoutDashboard className="h-4 w-4" />
              Repository overview
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-2 text-sm font-semibold text-foreground transition hover:border-[hsl(var(--accent)/0.4)] hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" />
              New analysis
            </Link>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
