import { useState, useEffect, useRef } from "react";
import type { ApiLogEntry, WebhookEventEntry } from "@/lib/types";
import { subscribeToEvents } from "@/lib/api";

export function useWebhookStream(orderId: string | null) {
  const [webhooks, setWebhooks] = useState<WebhookEventEntry[]>([]);
  const [apiCalls, setApiCalls] = useState<ApiLogEntry[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Clear state when orderId changes
    setWebhooks([]);
    setApiCalls([]);

    if (!orderId) return;

    const es = subscribeToEvents(orderId);
    esRef.current = es;

    es.addEventListener("webhook", (e) => {
      try {
        const data = JSON.parse(e.data) as WebhookEventEntry;
        setWebhooks((prev) => [...prev, data]);
      } catch {
        // Ignore malformed SSE payloads
      }
    });

    es.addEventListener("api_call", (e) => {
      try {
        const data = JSON.parse(e.data) as ApiLogEntry;
        setApiCalls((prev) => [...prev, data]);
      } catch {
        // Ignore malformed SSE payloads
      }
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [orderId]);

  return { webhooks, apiCalls };
}
