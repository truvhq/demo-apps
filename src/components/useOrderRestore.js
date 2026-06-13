/**
 * FILE SUMMARY: useOrderRestore() hook. Restores a finished Orders-flow session
 * when the user re-enters a results URL (refresh, back/forward, bookmark).
 *
 * DATA FLOW:
 *   Browser (results URL with orderId) --> this hook --> Express backend
 *     GET /api/orders/:orderId/info  -> returns user_id + product_type (SQLite only)
 *   Then startPolling(user_id) so persisted webhooks flow back into usePanel,
 *   the existing completed webhook satisfies useReportFetch's checkWebhookDone,
 *   and the reports are fetched again.
 *
 * INTEGRATION PATTERN: Orders flow only. Demo components remount with no
 * userId/productType state when navigated to directly, so the results screen
 * would otherwise spin forever (useReportFetch's `!userId || !products?.length`
 * guard never passes). OrderWaitingScreen already does this for the waiting URL;
 * this hook is the equivalent for results URLs.
 */

// Preact hooks and shared API base URL
import { useEffect, useRef } from 'preact/hooks';
import { API_BASE } from './hooks.js';

// Helper (exported for tests): fetch order info from the backend and normalize it
// into { userId, products }. product_type is stored comma-joined when the order
// was created with a products array, so split it back into a list.
// Returns null when the order is missing or has no user yet.
export async function fetchOrderRestoreInfo(orderId) {
  const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
  const data = await resp.json();
  if (!resp.ok || !data.user_id) return null;
  const products = data.product_type ? String(data.product_type).split(',').filter(Boolean) : [];
  return { userId: data.user_id, products };
}

// Core restore routine (exported for tests): fetches order info, delivers it to
// the demo via onRestore({ userId, products }), then starts webhook polling so
// useReportFetch can pick up the completion webhook from history.
// isCancelled lets the effect discard results after unmount.
export async function restoreOrderSession({ orderId, startPolling, onRestore, isCancelled = () => false }) {
  try {
    const restored = await fetchOrderRestoreInfo(orderId);
    if (isCancelled() || !restored) return null;
    onRestore(restored);
    startPolling(restored.userId);
    return restored;
  } catch {
    return null;
  }
}

// Main hook: runs the restore when `active` (e.g., screen === 'results'), an
// orderId is present, and the demo has no userId yet (fresh mount). Demos that
// arrived here through the normal flow already have userId set, so this no-ops.
export function useOrderRestore({ active, orderId, userId, startPolling, onRestore }) {
  // Refs: hold stable references to callbacks so the effect only re-runs on inputs
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const startPollingRef = useRef(startPolling);
  startPollingRef.current = startPolling;

  // Effect: restore session state from the backend on re-entry to a results URL
  useEffect(() => {
    if (!active || !orderId || userId) return;
    let cancelled = false;
    restoreOrderSession({
      orderId,
      startPolling: (uid) => startPollingRef.current(uid),
      onRestore: (restored) => onRestoreRef.current(restored),
      isCancelled: () => cancelled,
    });
    return () => { cancelled = true; };
  }, [active, orderId, userId]);
}
