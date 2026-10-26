/**
 * FILE SUMMARY: usePanel() hook. Central state management for every demo in the app.
 *
 * DATA FLOW:
 *   Browser (this hook) --poll every 3s--> Express backend (port 3000)
 *     GET /api/users/:userId/logs?session_id=...  -> returns API call logs
 *     GET /api/users/:userId/webhooks             -> returns received webhook events
 *     GET /api/tunnel-url                         -> returns ngrok/tunnel URL (on mount)
 *
 * INTEGRATION PATTERN: Used by both Orders flow and Bridge flow demos.
 *   Polling starts when a demo calls startPolling(userId) after creating a user or order.
 *   A demo that creates one Truv user per person (Renewals) passes every user id instead, with
 *   a label for each, and the panel shows all of their calls and webhooks in one list.
 *   The returned panel object feeds the Panel sidebar (API Logs, Bridge Events, Webhooks tabs).
 *
 * The hook also generates a sessionId that groups pre-order API calls (like employer search)
 * so the backend can filter logs belonging to this demo run. useReportFetch calls
 * pollOnceAndStop after fetching reports to capture the final API log entries.
 */

// Preact hooks imports
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

import { mergeByUser } from '../utils/panelLogs.js';

// API base URL: same origin as the frontend, proxied to Express on port 3000
const API_BASE = window.location.origin;
export { API_BASE };

export function usePanel() {
  // State: data displayed in the Panel sidebar tabs
  const [apiLogs, setApiLogs] = useState([]);
  const [bridgeEvents, setBridgeEvents] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Refs: track the active user, polling interval, and session scope
  const userIdsRef = useRef([]);
  const labelsRef = useRef({});
  const pollingRef = useRef(null);
  // Session ID ties pre-order API calls (company search) to this demo run
  const sessionIdRef = useRef(`s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // On mount: fetch the tunnel URL so demos can display the webhook callback address
  useEffect(() => {
    fetch(`${API_BASE}/api/tunnel-url`).then(r => r.json()).then(d => { if (d?.url) setTunnelUrl(d.url); }).catch(() => {});
  }, []);

  // Ref to hold the current poll function so pollOnceAndStop can invoke it directly
  const pollRef = useRef(null);

  // startPolling: begins a 3-second interval that fetches logs and webhooks for the given user.
  // Called by demo components once a Truv user/order is created.
  // Pass one user id, or an array of them with `labels` ({ userId: 'Ana Silva' }) to follow
  // several people at once: their entries are merged in the order they happened and each is
  // tagged with its label.
  // Data flow: GET /api/users/:userId/logs + GET /api/users/:userId/webhooks in parallel.
  const startPolling = useCallback((userId, { labels = {} } = {}) => {
    userIdsRef.current = [].concat(userId).filter(Boolean);
    labelsRef.current = labels;
    if (pollingRef.current) clearInterval(pollingRef.current);

    const poll = async () => {
      const uids = userIdsRef.current;
      if (!uids.length) return;
      try {
        const sid = sessionIdRef.current;
        const perUser = await Promise.all(uids.map(async (uid) => {
          // Parallel fetch: API logs (filtered by session) and webhook events
          const [logs, whs] = await Promise.all([
            fetch(`${API_BASE}/api/users/${uid}/logs?session_id=${sid}`).then(r => r.json()),
            fetch(`${API_BASE}/api/users/${uid}/webhooks`).then(r => r.json()),
          ]);
          return { uid, logs: Array.isArray(logs) ? logs : [], whs: Array.isArray(whs) ? whs : [] };
        }));
        if (uids.length === 1 && !Object.keys(labelsRef.current).length) {
          setApiLogs(perUser[0].logs);
          setWebhooks(perUser[0].whs);
          return;
        }
        setApiLogs(mergeByUser(perUser, 'logs', labelsRef.current));
        setWebhooks(mergeByUser(perUser, 'whs', labelsRef.current));
      } catch {}
    };
    pollRef.current = poll;

    // Immediate first poll, then every 3 seconds
    poll();
    pollingRef.current = setInterval(poll, 3000);
  }, []);

  // stopPolling: clears the interval and resets the userId ref. Used by reset and cleanup.
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    userIdsRef.current = [];
  }, []);

  // pollOnceAndStop: run one final poll to capture API log entries written after the last
  // 3s tick, then stop. Called by useReportFetch after reports are fetched so the
  // API Logs panel shows the report-fetch calls.
  const pollOnceAndStop = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (pollRef.current) pollRef.current().then(() => { userIdsRef.current = []; }).catch(() => { userIdsRef.current = []; });
    else userIdsRef.current = [];
  }, []);

  // pollNow: fetch once right now and keep polling. For demos that follow several users, where
  // stopping after one action would leave the others' calls out of the panel.
  const pollNow = useCallback(() => pollRef.current?.(), []);

  // addBridgeEvent: push a TruvBridge SDK event (e.g., onLoad, onSuccess) into panel state
  const addBridgeEvent = useCallback((type, data) => {
    setBridgeEvents(prev => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  // reset: clear all panel state, stop polling, and generate a fresh sessionId.
  // Called when a demo restarts or the user clicks "Start Over".
  const reset = useCallback(() => {
    stopPolling();
    setApiLogs([]);
    setBridgeEvents([]);
    setWebhooks([]);
    setCurrentStep(0);
    sessionIdRef.current = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, [stopPolling]);

  // Cleanup on unmount: stop polling to prevent memory leaks
  useEffect(() => () => stopPolling(), []);

  // Return value: panel object for the sidebar, plus control functions for demo components
  return {
    panel: { apiLogs, bridgeEvents, webhooks, tunnelUrl, currentStep },
    sessionId: sessionIdRef.current,
    setCurrentStep,
    startPolling,
    stopPolling,
    pollOnceAndStop,
    pollNow,
    addBridgeEvent,
    reset,
  };
}
