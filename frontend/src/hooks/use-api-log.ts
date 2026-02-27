import { useState, useCallback } from "react";
import type { ApiLogEntry } from "@/lib/types";
import { getApiLogs } from "@/lib/api";

export function useApiLog() {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);

  const fetchLogs = useCallback(async (orderId: string) => {
    try {
      const data = await getApiLogs(orderId);
      setLogs(data);
    } catch {
      // Ignore fetch errors for log polling
    }
  }, []);

  return { logs, fetchLogs };
}
