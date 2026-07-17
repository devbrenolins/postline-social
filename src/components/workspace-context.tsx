"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { WorkspaceData } from "@/lib/types";

const WorkspaceContext = createContext<{
  data: WorkspaceData | null;
  loading: boolean;
  refetch: () => Promise<void>;
}>({ data: null, loading: true, refetch: async () => {} });

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const onChange = () => refetch();
    window.addEventListener("postline:workspace-changed", onChange);
    return () => window.removeEventListener("postline:workspace-changed", onChange);
  }, [refetch]);

  return <WorkspaceContext.Provider value={{ data, loading, refetch }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
