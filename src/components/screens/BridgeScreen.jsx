/**
 * FILE SUMMARY: BridgeScreen
 * DATA FLOW: GET /api/orders/:id/info -> receive bridge_token -> init TruvBridge widget -> onEvent/onSuccess/onClose callbacks
 * INTEGRATION PATTERN: Used by both Orders flow and Bridge flow after order creation
 *
 * Fetches the bridge_token from the backend, then initializes Truv's embedded verification
 * widget (TruvBridge) inside an inline container. Bridge SDK callbacks (onLoad, onEvent,
 * onSuccess, onClose) are forwarded to the Panel sidebar via addBridgeEvent. On completion,
 * navigates to the waiting screen or calls onCompleted.
 */

// Preact hooks and app-level navigation/API utilities
import { useState, useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App.jsx';
import { API_BASE } from '../hooks.js';

// Props: orderId (created order), demoPath (route prefix), companyMappingId (pre-selected employer),
// addBridgeEvent (logs SDK events to Panel), startPolling (begins webhook/API log polling), onCompleted
export function BridgeScreen({ orderId, demoPath, companyMappingId, addBridgeEvent, startPolling, onCompleted }) {
  // State: bridge_token from backend, error message if fetch fails
  const [bridgeToken, setBridgeToken] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const bridgeInitRef = useRef(false);

  // Effect: fetch order info from backend to get bridge_token and user_id.
  // The backend proxies GET /api/orders/:id/info to Truv's API.
  // Once we have user_id, start polling for API logs and webhooks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) { setError(data.error || 'Unknown error'); return; }
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  // Effect: initialize TruvBridge widget once bridge_token is available.
  // Runs only once (guarded by bridgeInitRef). Sets up all SDK callbacks
  // that feed real-time events into the Panel sidebar.
  useEffect(() => {
    if (!bridgeToken || !containerRef.current || !window.TruvBridge || bridgeInitRef.current) return;
    bridgeInitRef.current = true;
    const bridgeOpts = {
      bridgeToken, isOrder: true,
      position: { type: 'inline', container: containerRef.current },
    };
    if (companyMappingId) bridgeOpts.companyMappingId = companyMappingId;
    const b = window.TruvBridge.init({
      ...bridgeOpts,
      // onLoad: fired when the Bridge widget iframe is ready
      onLoad: () => addBridgeEvent('onLoad()', null),
      // onEvent: fired for each verification step. On COMPLETED from order source,
      // navigate to the waiting screen to watch for webhooks.
      onEvent: (type, payload, source) => {
        const payloadStr = payload ? 'payload' : 'undefined';

        addBridgeEvent(`onEvent("${type}", ${payloadStr}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
        if (type === 'COMPLETED' && source === 'order') {
          if (onCompleted) onCompleted();
          navigate(`${demoPath}/waiting/${orderId}`);
        }
      },
      // onSuccess: fired when user completes verification successfully
      onSuccess: () => addBridgeEvent('onSuccess()', null),
      // onClose: fired when user closes the widget. Navigate back to demo start.
      onClose: () => {
        addBridgeEvent('onClose()', null);
        navigate(`${demoPath}`);
      },
    });
    // Open the Bridge widget in the inline container
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken]);

  // Error state: show error message
  if (error) return <div class="text-center py-16 text-red-600">{error}</div>;
  // Loading state: show spinner while fetching bridge_token
  if (!bridgeToken) return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  // Render: container div where the TruvBridge iframe will be mounted
  return <div ref={containerRef} class="w-full h-full overflow-hidden bg-white [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" style="zoom: 0.85;" />;
}
