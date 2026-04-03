// usePanel() — Central state hook used by every demo.
//
// Provides the sidebar Panel with live data (API logs, Bridge events, webhooks)
// by polling the backend every 3 seconds once startPolling(userId) is called.
//
// Returns:
//   panel          — { apiLogs, bridgeEvents, webhooks, tunnelUrl, currentStep }
//   setCurrentStep — advance the Guide tab to step N
//   startPolling   — begin polling API logs + webhooks for a user ID
//   addBridgeEvent — push a Bridge SDK event to the panel
//   reset          — clear all state and stop polling

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

const API_BASE = window.location.origin;
export { API_BASE };

export function usePanel() {
  const [apiLogs, setApiLogs] = useState([]);
  const [bridgeEvents, setBridgeEvents] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  const userIdRef = useRef(null);
  const pollingRef = useRef(null);
  // Session ID ties pre-order API calls (company search) to this demo run
  const sessionIdRef = useRef(`s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // Fetch tunnel URL on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/tunnel-url`).then(r => r.json()).then(d => { if (d?.url) setTunnelUrl(d.url); }).catch(() => {});
  }, []);

  // Start polling logs and webhooks by user_id every 3s
  const startPolling = useCallback((userId) => {
    userIdRef.current = userId;
    if (pollingRef.current) clearInterval(pollingRef.current);

    const poll = async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        const sid = sessionIdRef.current;
        const [logs, whs] = await Promise.all([
          fetch(`${API_BASE}/api/users/${uid}/logs?session_id=${sid}`).then(r => r.json()),
          fetch(`${API_BASE}/api/users/${uid}/webhooks`).then(r => r.json()),
        ]);
        setApiLogs(logs || []);
        setWebhooks(whs || []);
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

  const addBridgeEvent = useCallback((type, data) => {
    setBridgeEvents(prev => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setApiLogs([]);
    setBridgeEvents([]);
    setWebhooks([]);
    setCurrentStep(0);
    sessionIdRef.current = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), []);

  return {
    panel: { apiLogs, bridgeEvents, webhooks, tunnelUrl, currentStep },
    sessionId: sessionIdRef.current,
    setCurrentStep,
    startPolling,
    stopPolling,
    addBridgeEvent,
    reset,
  };
}
