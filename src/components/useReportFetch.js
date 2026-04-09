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
//     stopPolling,
//     webhookEvent: 'order',       // 'order' or 'task'
//     onComplete: () => { ... },   // demo-specific side effects
//   });

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { API_BASE, parsePayload } from './index.js';

// 'assets' product always also fetches 'income_insights'
function getReportTypes(products) {
  const types = [];
  for (const p of products) {
    types.push(p);
    if (p === 'assets' && !products.includes('income_insights')) {
      types.push('income_insights');
    }
  }
  return types;
}

function checkWebhookDone(webhooks, webhookEvent) {
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
  stopPolling,
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

  // Stabilize products array to avoid spurious effect re-runs
  const productsKey = JSON.stringify(products);

  // Reset when userId changes (handles FollowUp task-switching)
  useEffect(() => {
    if (userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId;
      fetchedRef.current = false;
      setReports(null);
      setLoading(false);
      setError(null);
    }
  }, [userId]);

  // Watch webhooks and fetch reports when done
  useEffect(() => {
    if (!userId || !products?.length || fetchedRef.current) return;
    if (!checkWebhookDone(webhooks, webhookEvent)) return;

    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    const reportTypes = getReportTypes(products);
    (async () => {
      try {
        const results = {};
        await Promise.all(
          reportTypes.map(rt =>
            fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/${rt}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => { if (d) results[rt] = d; })
          )
        );
        setReports(results);
        if (onCompleteRef.current) onCompleteRef.current(results);
      } catch (e) {
        console.error(e);
        setError('Failed to load report');
      }
      stopPolling();
      setLoading(false);
    })();
  }, [webhooks, userId, productsKey, webhookEvent, stopPolling]);

  const reset = useCallback(() => {
    fetchedRef.current = false;
    prevUserIdRef.current = null;
    setReports(null);
    setLoading(false);
    setError(null);
  }, []);

  return { reports, loading, error, reset };
}
