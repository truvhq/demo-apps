/**
 * FILE SUMMARY: OrderWaitingScreen
 * DATA FLOW: GET /api/orders/:id/info -> start polling -> watch webhooks for "completed" -> navigate to results
 * INTEGRATION PATTERN: Orders flow only (Mortgage/Public Sector). Bridge flow uses BridgeScreen callbacks instead.
 *
 * Displays a waiting state while Truv processes an order in the background. Polls for
 * webhooks via usePanel() and watches for the order-status-updated/completed event.
 * Enforces a minimum display time (10s) before navigating to the results screen.
 */

// Preact hooks and app-level navigation/utility imports
import { useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App.jsx';
import { API_BASE, parsePayload } from '../index.js';
import { WaitingScreen } from '../WebhookFeed.jsx';

// Minimum time (ms) to show the waiting screen, even if webhooks arrive instantly
const WAITING_MIN_MS = 10000;

// Props: orderId (the order being watched), demoPath (route prefix), webhooks (from usePanel polling),
// startPolling (begins polling for this user), maxWidth (layout constraint)
export function OrderWaitingScreen({ orderId, demoPath, webhooks, startPolling, maxWidth = 'max-w-lg' }) {
  // Refs: track when the screen was first displayed and whether navigation is already pending
  const waitingStartRef = useRef(Date.now());
  const advancePendingRef = useRef(false);

  // Effect: fetch order info to get user_id, then start polling for API logs and webhooks.
  // This is needed when the user navigates directly to the waiting URL (e.g., page refresh).
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (resp.ok && data.user_id) startPolling(data.user_id);
      } catch {}
    })();
  }, [orderId]);

  // Effect: watch incoming webhooks for the completion signal.
  // When order-status-updated with status "completed" arrives, schedule navigation
  // to the results screen after enforcing the minimum display time.
  useEffect(() => {
    if (advancePendingRef.current) return;
    const isCompleted = webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'order-status-updated' && p.status === 'completed')
        || (w.event_type === 'order-status-updated' && w.status === 'completed');
    });
    if (isCompleted) {
      advancePendingRef.current = true;
      const delay = Math.max(1000, WAITING_MIN_MS - (Date.now() - waitingStartRef.current) + 1000);
      setTimeout(() => navigate(`${demoPath}/results/${orderId}`), delay);
    }
  }, [webhooks, orderId]);

  // Render: WaitingScreen shows a spinner, explanation text, and live WebhookFeed
  return <div class={`${maxWidth} mx-auto`}><WaitingScreen webhooks={webhooks} /></div>;
}
