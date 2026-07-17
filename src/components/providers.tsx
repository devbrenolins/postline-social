"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useEffect } from "react";

/** Keepalive: impede que a sandbox hiberne enquanto a aba está aberta. */
function useKeepalive() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/health", { method: "GET", cache: "no-store" }).catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useKeepalive();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            fontSize: "13.5px",
          },
        }}
      />
    </ThemeProvider>
  );
}
