import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// Shapes of DB rows returned by the API (mirrors server/db.ts)
export interface ApiLogRow {
  id: number;
  user_id: string | null;
  method: string;
  endpoint: string;
  url?: string;
  request_body: string | null;
  response_body: string | null;
  status_code: number | null;
  duration_ms: number | null;
  timestamp: string;
}

export interface WebhookEventRow {
  id: number;
  user_id: string | null;
  webhook_id: string | null;
  event_type: string | null;
  status: string | null;
  payload: string | null;
  received_at: string;
  // available in some display contexts
  created_at?: string;
  timestamp?: number;
}

export interface BridgeEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface PanelState {
  apiLogs: ApiLogRow[];
  bridgeEvents: BridgeEvent[];
  webhooks: WebhookEventRow[];
  tunnelUrl: string | null;
  currentStep: number;
}

export interface UsePanelReturn {
  panel: PanelState;
  setCurrentStep: (step: number) => void;
  startPolling: (userId: string) => void;
  stopPolling: () => void;
  addBridgeEvent: (type: string, data: unknown) => void;
  reset: () => void;
}

const API_BASE = window.location.origin;
export { API_BASE };

export function usePanel(): UsePanelReturn {
  const [apiLogs, setApiLogs] = useState<ApiLogRow[]>([]);
  const [bridgeEvents, setBridgeEvents] = useState<BridgeEvent[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEventRow[]>([]);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const userIdRef = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch tunnel URL on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/tunnel-url`)
      .then(r => r.json())
      .then((d: { url?: string }) => { if (d?.url) setTunnelUrl(d.url); })
      .catch(() => {});
  }, []);

  // Start polling logs and webhooks by user_id every 3s
  const startPolling = useCallback((userId: string) => {
    userIdRef.current = userId;
    if (pollingRef.current) clearInterval(pollingRef.current);

    const poll = async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        const [logs, whs] = await Promise.all([
          fetch(`${API_BASE}/api/users/${uid}/logs`).then(r => r.json()) as Promise<ApiLogRow[]>,
          fetch(`${API_BASE}/api/users/${uid}/webhooks`).then(r => r.json()) as Promise<WebhookEventRow[]>,
        ]);
        setApiLogs(logs ?? []);
        setWebhooks(whs ?? []);
      } catch {}
    };

    poll();
    pollingRef.current = setInterval(poll, 3000);
  }, []);

  const stopPolling = useCallback(() => {
    userIdRef.current = null;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const addBridgeEvent = useCallback((type: string, data: unknown) => {
    setBridgeEvents(prev => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setApiLogs([]);
    setBridgeEvents([]);
    setWebhooks([]);
    setCurrentStep(0);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), []);

  return {
    panel: { apiLogs, bridgeEvents, webhooks, tunnelUrl, currentStep },
    setCurrentStep,
    startPolling,
    stopPolling,
    addBridgeEvent,
    reset,
  };
}
