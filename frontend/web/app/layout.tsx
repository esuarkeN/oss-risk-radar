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
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
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
      <body className="bg-background font-sans text-foreground antialiased">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
