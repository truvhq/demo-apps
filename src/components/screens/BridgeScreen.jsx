/**
 * FILE SUMMARY: BridgeScreen
 * DATA FLOW: GET /api/orders/:id/info -> receive bridge_token -> init TruvBridge widget -> onEvent/onSuccess/onClose callbacks
 * INTEGRATION PATTERN: Used by both Orders flow and Bridge flow after order creation
 *
 * Fetches the bridge_token from the backend, then initializes Truv's embedded verification
 * widget (TruvBridge) inside an inline container. Bridge SDK callbacks (onLoad, onEvent,
 * onSuccess, onClose) are forwarded to the Panel sidebar via addBridgeEvent. On completion,
 * navigates to the waiting screen or calls onCompleted.
 *
 * CLOSE-RACE HANDLING: the TruvBridge SDK fires onClose for programmatic closes too
 * (e.g., our unmount cleanup calling b.close()). Without guards, the unmount triggered
 * right after COMPLETED navigates to the waiting screen would fire onClose and navigate
 * BACK to the demo root, interrupting a successfully progressing session. The guards
 * object tracks completion and programmatic-close state so onClose only reacts to a
 * genuine user-initiated close, which calls onAbort (if provided) so the parent demo
 * can stop polling and clear stale state before navigating back.
 */

// Preact hooks and app-level navigation/API utilities
import { useState, useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App.jsx';
import { API_BASE } from '../hooks.js';

// Helper (exported for tests): builds the TruvBridge SDK callback set with
// close-race guards. Returned `guards` flags:
//   guards.completed - set when COMPLETED fires; onClose after completion is ignored
//   guards.closing   - set by the unmount cleanup before b.close(); programmatic
//                      closes are ignored so they never navigate
// On a genuine user close, onAbort is called (parent stops polling / clears stale
// state and navigates); without onAbort, falls back to navigating to the demo root.
export function createBridgeCallbacks({ orderId, demoPath, addBridgeEvent, onCompleted, onAbort, navigateFn = navigate }) {
  const guards = { completed: false, closing: false };
  return {
    guards,
    // onLoad: fired when the Bridge widget iframe is ready
    onLoad: () => addBridgeEvent('onLoad()', null),
    // onEvent: fired for each verification step. On COMPLETED from order source,
    // mark the guard (before navigating, so a racing onClose is ignored) and
    // navigate to the waiting screen to watch for webhooks.
    onEvent: (type, payload, source) => {
      const payloadStr = payload ? 'payload' : 'undefined';

      addBridgeEvent(`onEvent("${type}", ${payloadStr}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
      if (type === 'COMPLETED' && source === 'order') {
        guards.completed = true;
        if (onCompleted) onCompleted();
        navigateFn(`${demoPath}/waiting/${orderId}`);
      }
    },
    // onSuccess: fired when user completes verification successfully
    onSuccess: () => addBridgeEvent('onSuccess()', null),
    // onClose: fired when the widget closes, for BOTH user-initiated and
    // programmatic closes. Ignore post-completion and programmatic closes;
    // for a genuine user close, let the parent abort cleanly (or fall back
    // to navigating to the demo root).
    onClose: () => {
      addBridgeEvent('onClose()', null);
      if (guards.completed || guards.closing) return;
      if (onAbort) onAbort();
      else navigateFn(`${demoPath}`);
    },
  };
}

// Props: orderId (created order), demoPath (route prefix), companyMappingId (pre-selected employer),
// addBridgeEvent (logs SDK events to Panel), startPolling (begins webhook/API log polling),
// onCompleted (fired on COMPLETED), onAbort (fired on genuine user-initiated close)
export function BridgeScreen({ orderId, demoPath, companyMappingId, addBridgeEvent, startPolling, onCompleted, onAbort }) {
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
    // Build the guarded SDK callbacks (see createBridgeCallbacks above)
    const callbacks = createBridgeCallbacks({ orderId, demoPath, addBridgeEvent, onCompleted, onAbort });
    const b = window.TruvBridge.init({
      ...bridgeOpts,
      onLoad: callbacks.onLoad,
      onEvent: callbacks.onEvent,
      onSuccess: callbacks.onSuccess,
      onClose: callbacks.onClose,
    });
    // Open the Bridge widget in the inline container
    b.open();
    // Cleanup: mark the close as programmatic BEFORE calling b.close() so the
    // SDK-fired onClose does not navigate (prevents the post-COMPLETED race).
    return () => { callbacks.guards.closing = true; try { b.close(); } catch {} };
  }, [bridgeToken]);

  // Error state: show error message
  if (error) return <div class="text-center py-16 text-red-600">{error}</div>;
  // Loading state: show spinner while fetching bridge_token
  if (!bridgeToken) return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  // Render: container div where the TruvBridge iframe will be mounted
  return <div ref={containerRef} class="w-full h-full overflow-hidden bg-white [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" style="zoom: 0.85;" />;
}
