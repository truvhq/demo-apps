import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiLogEntry, WebhookEventEntry } from "@/lib/types";
import { subscribeToEvents } from "@/lib/api";

export function useWebhookStream(orderId: string | null) {
  const [webhooks, setWebhooks] = useState<WebhookEventEntry[]>([]);
  const [apiCalls, setApiCalls] = useState<ApiLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const es = subscribeToEvents(orderId);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("webhook", (e) => {
      const data = JSON.parse(e.data) as WebhookEventEntry;
      setWebhooks((prev) => [...prev, data]);
    });

    es.addEventListener("api_call", (e) => {
      const data = JSON.parse(e.data) as ApiLogEntry;
      setApiCalls((prev) => [...prev, data]);
    });

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [orderId]);

  const clearStream = useCallback(() => {
    setWebhooks([]);
    setApiCalls([]);
  }, []);

  return { webhooks, apiCalls, connected, clearStream };
}
