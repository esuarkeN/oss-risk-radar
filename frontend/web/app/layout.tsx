import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/toast-provider";

import "./globals.css";

const themeBootScript = `
(function () {
  try {
    var storedTheme = window.localStorage.getItem("oss-risk-radar-theme");
    var theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    var root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
  } catch (error) {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export const metadata: Metadata = {
  title: "OSS Risk Radar",
  description: "Decision-support tooling for OSS dependency maintenance and supply-chain risk triage.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-background font-sans text-foreground antialiased transition-colors duration-200">
        <ToastProvider>
          <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-4 lg:px-8 lg:py-6">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
