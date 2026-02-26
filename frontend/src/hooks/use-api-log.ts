import { useState, useCallback, useRef } from "react";
import type { ApiLogEntry } from "@/lib/types";
import { getApiLogs } from "@/lib/api";

export function useApiLog() {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchLogs = useCallback(async (orderId: string) => {
    setLoading(true);
    try {
      const data = await getApiLogs(orderId);
      setLogs(data);
      fetchedRef.current.add(orderId);
    } finally {
      setLoading(false);
    }
  }, []);

  const addLog = useCallback((log: ApiLogEntry) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    fetchedRef.current.clear();
  }, []);

  return { logs, loading, fetchLogs, addLog, clearLogs };
}
