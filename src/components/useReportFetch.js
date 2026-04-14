// useReportFetch -- Unified hook for watching webhooks and fetching user reports.
//
// All non-document demos share the same flow:
//   1. Wait for a webhook (order-status-updated:completed or task-status-updated:done)
//   2. Fetch reports via GET /api/users/:userId/reports/:type
//      (backend does POST to create + GET to retrieve)
//   3. Stop polling
//
// Usage:
//   const { reports, loading, error, reset } = useReportFetch({
//     userId: order?.user_id,
//     products: ['income'],
//     webhooks: panel.webhooks,
//     pollOnceAndStop,
//     webhookEvent: 'task',        // 'task' (default) or 'order'
//     onComplete: () => { ... },   // demo-specific side effects
//   });

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { API_BASE } from './hooks.js';
import { parsePayload } from './WebhookFeed.jsx';

// Webhook event types:
//   'task'  = Bridge/user-token flow -> listens for task-status-updated:done
//   'order' = Orders API flow        -> listens for order-status-updated:completed
export const WEBHOOK_EVENTS = { TASK: 'task', ORDER: 'order' };

// 'assets' product always also fetches 'income_insights'
export function getReportTypes(products) {
  const types = [];
  for (const p of products) {
    types.push(p);
    if (p === 'assets' && !products.includes('income_insights')) {
      types.push('income_insights');
    }
  }
  return types;
}

export function checkWebhookDone(webhooks, webhookEvent) {
  if (!webhookEvent) return false;
  const [event, status] = webhookEvent === 'order'
    ? ['order-status-updated', 'completed']
    : ['task-status-updated', 'done'];
  return webhooks.some(w => {
    const p = parsePayload(w.payload);
    return (p.event_type === event && p.status === status)
      || (w.event_type === event && w.status === status);
  });
}

export function useReportFetch({
  userId,
  products,
  webhooks,
  pollOnceAndStop,
  webhookEvent = 'task',
  onComplete,
}) {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);
  const prevUserIdRef = useRef(userId);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pollOnceAndStopRef = useRef(pollOnceAndStop);
  pollOnceAndStopRef.current = pollOnceAndStop;

  // Stabilize products array to avoid spurious effect re-runs
  const productsKey = JSON.stringify(products);

  // Reset when userId or products change (handles FollowUp task-switching where
  // all tasks share the same userId but have different products)
  const prevProductsKeyRef = useRef(productsKey);
  useEffect(() => {
    if (userId !== prevUserIdRef.current || productsKey !== prevProductsKeyRef.current) {
      prevUserIdRef.current = userId;
      prevProductsKeyRef.current = productsKey;
      fetchedRef.current = false;
      setReports(null);
      setLoading(false);
      setError(null);
    }
  }, [userId, productsKey]);

  // Watch webhooks and fetch reports when done.
  // Uses a generation counter to cancel stale in-flight fetches when
  // userId or products change (e.g., FollowUp task switching).
  const generationRef = useRef(0);

  useEffect(() => {
    if (!userId || !products?.length || fetchedRef.current) return;
    if (!checkWebhookDone(webhooks, webhookEvent)) return;

    const gen = ++generationRef.current;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    const reportTypes = getReportTypes(products);
    (async () => {
      try {
        const results = {};
        const fetchReports = (types) => Promise.all(
          types.map(rt =>
            fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/${rt}`)
              .then(r => {
                if (!r.ok) { console.warn(`Report fetch failed: ${rt} (${r.status})`); return null; }
                return r.json();
              })
              .then(d => { if (d) results[rt] = d; })
          )
        );
        await fetchReports(reportTypes);
        if (gen !== generationRef.current) return; // stale fetch, discard

        // Retry failed report types once after a delay (handles timing gaps
        // where some reports aren't ready yet, e.g., PLL deposit_switch
        // completes before income data is ready)
        const failed = reportTypes.filter(rt => !results[rt]);
        if (failed.length > 0) {
          await new Promise(r => setTimeout(r, 5000));
          if (gen !== generationRef.current) return; // stale fetch, discard
          await fetchReports(failed);
          if (gen !== generationRef.current) return;
        }

        if (Object.keys(results).length === 0) {
          setError('Failed to load report');
        } else {
          setReports(results);
          if (onCompleteRef.current) onCompleteRef.current(results);
        }
      } catch (e) {
        if (gen !== generationRef.current) return;
        console.error(e);
        setError('Failed to load report');
      }
      pollOnceAndStopRef.current();
      setLoading(false);
    })();
  }, [webhooks, userId, productsKey, webhookEvent]);

  const reset = useCallback(() => {
    fetchedRef.current = false;
    prevUserIdRef.current = undefined;
    setReports(null);
    setLoading(false);
    setError(null);
  }, []);

  return { reports, loading, error, reset };
}
