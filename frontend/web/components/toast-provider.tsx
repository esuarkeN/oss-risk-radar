"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type ToastTone = "info" | "success" | "error";

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastRecord extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  info: "border-sky-400/25 bg-slate-950/90 text-white",
  success: "border-emerald-400/30 bg-emerald-950/90 text-white",
  error: "border-rose-400/30 bg-rose-950/90 text-white",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs ?? 4200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [onDismiss, toast.durationMs, toast.id]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-full max-w-sm rounded-[1.4rem] border px-4 py-3 shadow-2xl backdrop-blur transition",
        toneStyles[toast.tone ?? "info"],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight">{toast.title}</p>
          {toast.description ? <p className="text-sm text-white/75">{toast.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const nextIdRef = useRef(0);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  function dismiss(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function toast(input: ToastInput) {
    const id = nextIdRef.current + 1;
    nextIdRef.current = id;
    setToasts((current) => [...current, { id, tone: "info", ...input }]);
    return id;
  }

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4 sm:justify-end">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {toasts.map((item) => (
            <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
