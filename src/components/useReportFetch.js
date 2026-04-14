/**
 * FILE SUMMARY: useReportFetch() hook. Watches webhook events for completion signals,
 * then fetches the corresponding reports from the backend.
 *
 * DATA FLOW:
 *   usePanel (webhooks state) --> this hook (detects completion) --> Express backend
 *     GET /api/users/:userId/reports/:type  (one request per product type)
 *   The backend proxies this to the Truv API: POST to create the report, then GET to retrieve it.
 *
 * INTEGRATION PATTERN: Supports both flows via the webhookEvent parameter.
 *   Bridge flow (webhookEvent='task'):  listens for task-status-updated with status "done".
 *   Orders flow (webhookEvent='order'): listens for order-status-updated with status "completed".
 *   After fetching reports, calls pollOnceAndStop from usePanel to capture final API log entries.
 *
 * If some report types fail on the first attempt (common when deposit_switch completes before
 * income data is indexed), the hook retries those types once after a 5-second delay.
 */

// Retry delay for partial report failures. Some flows (e.g., Paycheck Linked Lending)
// complete the deposit_switch before income data is indexed; 5s covers the typical gap.
const REPORT_RETRY_DELAY_MS = 5000;

// Imports: Preact hooks, shared API_BASE from usePanel, webhook payload parser
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { API_BASE } from './hooks.js';
import { parsePayload } from './WebhookFeed.jsx';

// Webhook event type constants used by demo components to specify their integration pattern.
//   'task'  = Bridge/user-token flow: listens for task-status-updated with status "done"
//   'order' = Orders API flow: listens for order-status-updated with status "completed"
export const WEBHOOK_EVENTS = { TASK: 'task', ORDER: 'order' };

// Helper: expand product list into report types to fetch.
// 'assets' product always also fetches 'income_insights' because the Truv
// Assets (VOA) report is paired with Income Insights from the same bank connection.
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

// Helper: check whether any webhook in the array signals completion for the given flow.
// Parses each webhook payload and matches against the expected event_type and status.
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

// Main hook: accepts userId, products, webhooks (from usePanel), pollOnceAndStop,
// webhookEvent type, and an optional onComplete callback for demo-specific side effects.
export function useReportFetch({
  userId,
  products,
  webhooks,
  pollOnceAndStop,
  webhookEvent = 'task',
  onComplete,
}) {
  // State: fetched reports map, loading flag, and error message
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs: guard against duplicate fetches and hold stable references to callbacks
  const fetchedRef = useRef(false);
  const prevUserIdRef = useRef(userId);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pollOnceAndStopRef = useRef(pollOnceAndStop);
  pollOnceAndStopRef.current = pollOnceAndStop;

  // Stabilize products array to avoid spurious effect re-runs
  const productsKey = JSON.stringify(products);

  // Reset effect: clears state when userId or products change.
  // Handles FollowUp demo task-switching where all tasks share the same userId
  // but have different products.
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

  // Core effect: watch webhooks for a completion signal, then fetch all report types.
  // Uses a generation counter to cancel stale in-flight fetches when
  // userId or products change (e.g., FollowUp task switching).
  const generationRef = useRef(0);

  useEffect(() => {
    // Guard: skip if missing inputs, already fetched, or no completion webhook yet
    if (!userId || !products?.length || fetchedRef.current) return;
    if (!checkWebhookDone(webhooks, webhookEvent)) return;

    const gen = ++generationRef.current;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    // Expand products into the full list of report types to fetch
    const reportTypes = getReportTypes(products);
    (async () => {
      try {
        const results = {};
        // Fetch reports in parallel: GET /api/users/:userId/reports/:type for each type.
        // The backend proxies to Truv API (POST create + GET retrieve).
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

        // Retry: re-fetch any report types that failed on the first attempt.
        // Waits 5 seconds to handle timing gaps (e.g., PLL deposit_switch
        // completes before income data is ready).
        const failed = reportTypes.filter(rt => !results[rt]);
        if (failed.length > 0) {
          await new Promise(r => setTimeout(r, REPORT_RETRY_DELAY_MS));
          if (gen !== generationRef.current) return; // stale fetch, discard
          await fetchReports(failed);
          if (gen !== generationRef.current) return;
        }

        // Deliver results or set error
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
      // Final step: one last poll to capture the report-fetch API logs, then stop polling
      pollOnceAndStopRef.current();
      setLoading(false);
    })();
  }, [webhooks, userId, productsKey, webhookEvent]);

  // reset: allows demo components to clear report state (e.g., when restarting a flow)
  const reset = useCallback(() => {
    fetchedRef.current = false;
    prevUserIdRef.current = undefined;
    setReports(null);
    setLoading(false);
    setError(null);
  }, []);

  // Return: reports map keyed by product type, loading/error state, and reset function
  return { reports, loading, error, reset };
}
