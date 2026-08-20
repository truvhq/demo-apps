/**
 * FILE SUMMARY: Renewals & Data Refresh routes (recertification without re-collecting docs)
 * DATA FLOW: Frontend -> POST/GET /api/renewals/* -> TruvClient -> Truv API
 * INTEGRATION PATTERN: Orders flow, refreshing the connections an earlier order made
 *
 * Drives the public-sector renewals demo:
 *   1. Refresh an existing order        POST /api/renewals/refresh/:orderId
 *   2. Resolve each refresh's outcome   GET  /api/renewals/outcome/:refreshOrderId
 *   3. (diagnostic) list user tasks     GET  /api/renewals/tasks/:userId
 *
 * THE POINT OF THIS DEMO: a refresh has two outcomes and they look nothing alike
 * on the wire.
 *
 *   Session still valid   -> the refresh order completes by itself, no applicant
 *                            action, and you get `order-status-updated: completed`.
 *   Re-auth needed        -> the refresh TASK fails. The order's status never
 *                            changes, so NO further `order-status-updated` is ever
 *                            emitted. It sits at `sent` indefinitely. The only
 *                            signal is the `order-refresh-failed` event.
 *
 * A client subscribed solely to `order-status-updated` therefore sees refreshes
 * "stall at Sent" with no explanation. That is the exact production confusion this
 * demo exists to make visible.
 *
 * Verified in sandbox 2026-08-19/20 (Claude TAM account):
 *   goodlogin/goodpassword  -> silent success in ~13-15s
 *   goodlogin/mfa_captcha   -> order-refresh-failed (mfa_error) in 0.2-5.5s
 *   goodlogin/mfa on a bank -> same shape, product: assets
 * A failed refresh order IS recoverable through its own bridge_token: Bridge skips
 * username/password (credentials are stored on the link) and resumes at the MFA
 * challenge, after which the refresh order itself completes.
 */

// Express router factory
import { Router } from 'express';

// Demo identifier persisted on every order this demo creates
const RENEWALS_DEMO_ID = 'public-sector-renewals-refresh';

// Task statuses that mean "the applicant has to clear something" — a stored
// session went stale or the provider now wants MFA. These are the ones that
// should route to a re-authorization prompt.
export const REAUTH_STATUSES = [
  'login_error',
  'mfa_error',
  'session_expired',
  'account_locked',
  'unable_to_reset',
];

// Task statuses that also fail the refresh but are NOT the applicant's problem.
// Prompting someone to re-authenticate because the provider is down (or because
// the provider returned no records) is a bad experience, so they get their own
// bucket. `order-refresh-failed` fires for these too, which is why branching on
// `status` rather than on the event type is the correct client implementation.
export const NON_REAUTH_FAILURE_STATUSES = [
  'unavailable',
  'config_error',
  'error',
  'no_data',
  'not_supported',
];

// Utility: safely parse JSON strings from the DB without throwing
function safeParse(str) { try { return JSON.parse(typeof str === 'string' ? str : '{}'); } catch { return {}; } }

// Reads a suborder status out of an order response regardless of product. Payroll
// products land in `employers[]`, bank products in `financial_accounts[]`.
function suborderStatuses(orderData) {
  const groups = [orderData?.employers, orderData?.financial_accounts, orderData?.insurance ? [orderData.insurance] : null];
  const out = [];
  for (const g of groups) {
    if (!Array.isArray(g)) continue;
    for (const s of g) if (s?.status) out.push(s.status);
  }
  return out;
}

/**
 * Selects the tasks belonging to one refresh order.
 *
 * Matches on `order_id`, which the public tasks payload carries. Deliberately
 * does NOT rely on `is_refresh`: that field exists on the internal Task model but
 * is absent from the `GET /v1/tasks/` response (verified live 2026-08-20), so an
 * `is_refresh` filter matches nothing and silently disables every caller. It is
 * still accepted when present, in case a later API version exposes it.
 */
export function tasksForOrder(tasks, truvOrderId) {
  return (tasks || []).filter(t => (
    (truvOrderId && t?.order_id === truvOrderId) || t?.is_refresh === true
  ));
}

/**
 * Resolves what actually happened to a refresh, from state rather than from
 * observed transitions.
 *
 * This is deliberately state-based, not event-based. Measured timings make the
 * naive "watch it transition" approach unreliable: failures arrive 0.2-5.5s after
 * the refresh POST (frequently before the UI that wants to show them has even
 * mounted) while a silent success takes ~13-15s. Anything that only reacts to a
 * live transition will miss the fast case entirely.
 *
 * Dual-path detection, in priority order:
 *   1. `order-refresh-failed` webhook for this order  (fast, exact, hosted only)
 *   2. the refresh task's own status                  (works with no webhook
 *                                                      tunnel, i.e. localhost)
 *   3. the order's suborder status                    (completed = silent success)
 *
 * Path 2 is why local development works at all: Truv cannot POST a webhook to
 * localhost, so a webhook-only implementation shows nothing during `npm run dev`.
 *
 * Exported pure so the test suite exercises the real logic.
 *
 * @returns {{state: string, reason: string|null, product: string|null, source: string}}
 *   state: 'refreshing' | 'refreshed' | 'reauth_required' | 'failed_other'
 */
export function classifyRefreshOutcome({ truvOrderId, orderData = null, webhooks = [], tasks = [] } = {}) {
  // 1. The dedicated failure event, matched to this specific refresh order.
  for (const wh of webhooks) {
    if (wh?.event_type !== 'order-refresh-failed') continue;
    const payload = typeof wh.payload === 'string' ? safeParse(wh.payload) : (wh.payload || {});
    if (truvOrderId && payload.order_id && payload.order_id !== truvOrderId) continue;
    const status = payload.status || wh.status || null;
    return {
      state: NON_REAUTH_FAILURE_STATUSES.includes(status) ? 'failed_other' : 'reauth_required',
      reason: status,
      product: payload.product || null,
      source: 'order-refresh-failed',
    };
  }

  // 2. No webhook (or no tunnel): read the refresh task's own status.
  //
  // Match tasks to this refresh by `order_id`, which the tasks payload carries.
  // Do NOT filter on `is_refresh`: that field exists on the internal Task model
  // but the public `GET /v1/tasks/` response does not expose it (verified live
  // 2026-08-20 — it comes back absent, so an `is_refresh` filter silently matches
  // nothing and this whole fallback dies). `order_id` is exact, and scopes us to
  // the refresh order rather than the original, so recency guessing is unnecessary.
  const refreshTasks = tasksForOrder(tasks, truvOrderId);
  for (const t of refreshTasks) {
    if (REAUTH_STATUSES.includes(t.status)) {
      return { state: 'reauth_required', reason: t.status, product: t.product_type || null, source: 'task', errorMessage: t.error_message || null };
    }
    if (NON_REAUTH_FAILURE_STATUSES.includes(t.status)) {
      return { state: 'failed_other', reason: t.status, product: t.product_type || null, source: 'task', errorMessage: t.error_message || null };
    }
  }

  // 2b. Some suborders surface the same thing as `last_task_status`. Cheap to
  // check, already in the order response, and covers a task list we could not
  // match. Absent (null) on many responses, so it cannot be the primary path.
  for (const group of [orderData?.employers, orderData?.financial_accounts]) {
    if (!Array.isArray(group)) continue;
    for (const s of group) {
      const st = s?.last_task_status;
      if (!st) continue;
      if (REAUTH_STATUSES.includes(st)) return { state: 'reauth_required', reason: st, product: s.product_type || null, source: 'suborder' };
      if (NON_REAUTH_FAILURE_STATUSES.includes(st)) return { state: 'failed_other', reason: st, product: s.product_type || null, source: 'suborder' };
    }
  }

  // 3. Success is the order reaching a completed suborder with no applicant action.
  const statuses = suborderStatuses(orderData);
  if (statuses.length && statuses.every(s => s === 'completed')) {
    return { state: 'refreshed', reason: null, product: null, source: 'order' };
  }
  if (statuses.includes('completed')) {
    return { state: 'refreshed', reason: null, product: null, source: 'order' };
  }

  // Still in flight.
  return { state: 'refreshing', reason: null, product: null, source: 'pending' };
}

// Factory function: receives shared dependencies and returns a configured router
export default function renewalsRefreshRoutes({ truv, db, apiLogger }) {
  const router = Router();

  // POST /api/renewals/refresh/:orderId
  // Creates a data-refresh order against an order this demo already completed.
  // Truv returns a NEW order; we persist it so the outcome endpoint can resolve it
  // and so the panel's per-user polling is authorized for this session.
  router.post('/api/renewals/refresh/:orderId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });

      const original = db.getOrder(req.params.orderId);
      if (!original || !original.truv_order_id) return res.status(404).json({ error: 'Original order not found' });

      const products = req.body?.products || (original.product_type === 'assets' ? ['assets'] : ['income']);
      const refreshOrderId = db.generateId();

      const result = await truvClient.createRefreshOrder(original.truv_order_id, { products });
      const truvData = result.data;
      apiLogger.logApiCall({
        userId: original.user_id, method: 'POST', endpoint: `/v1/orders/${original.truv_order_id}/`,
        requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs,
      });

      // The per-order refresh cap is 3 per 24h. Surface it as its own signal so the
      // UI can say what happened instead of showing a generic failure.
      if (result.statusCode === 429) {
        return res.status(429).json({
          error: 'refresh_cap_reached',
          message: 'Truv allows 3 refreshes per order per 24 hours. This order has hit that limit.',
          retry_after: result.retryAfter ?? null,
          details: truvData,
        });
      }
      if (result.statusCode >= 400) {
        return res.status(result.statusCode).json({ error: 'Failed to create refresh order', details: truvData });
      }

      const userId = truvData?.user_id || original.user_id || null;
      db.createOrder({
        orderId: refreshOrderId, truvOrderId: truvData.id, userId,
        demoId: RENEWALS_DEMO_ID,
        bridgeToken: truvData.bridge_token, shareUrl: truvData.share_url,
        status: truvData.status || 'created', rawResponse: truvData,
      });
      db.updateOrder(refreshOrderId, { product_type: products.join('_') });
      // Authorizes this session to poll logs/webhooks for the user in hosted mode.
      db.recordSessionUser(req.session?.id, userId);

      res.json({
        order_id: refreshOrderId,
        truv_order_id: truvData.id,
        original_order_id: original.id,
        original_truv_order_id: original.truv_order_id,
        user_id: userId,
        // A failed refresh is recoverable through these: Bridge resumes at the MFA
        // challenge rather than asking for credentials again.
        bridge_token: truvData.bridge_token,
        share_url: truvData.share_url,
        products,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // GET /api/renewals/outcome/:refreshOrderId
  // Resolves one refresh to 'refreshing' | 'refreshed' | 'reauth_required' |
  // 'failed_other' using the webhook, the task status, and the order state. See
  // classifyRefreshOutcome for why all three are consulted.
  router.get('/api/renewals/outcome/:refreshOrderId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });

      const refreshOrder = db.getOrder(req.params.refreshOrderId);
      if (!refreshOrder || !refreshOrder.truv_order_id) return res.status(404).json({ error: 'Refresh order not found' });
      const userId = refreshOrder.user_id;

      const orderResult = await truvClient.getOrder(refreshOrder.truv_order_id);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${refreshOrder.truv_order_id}/`, responseBody: orderResult.data, statusCode: orderResult.statusCode, durationMs: orderResult.durationMs });
      if (orderResult.statusCode >= 400) return res.status(orderResult.statusCode).json({ error: 'Failed to fetch refresh order', details: orderResult.data });

      // Locally stored webhook events for this user (empty without a tunnel).
      const webhooks = userId ? db.getWebhookEventsByUserId(userId) : [];

      // Task fallback. Only fetched when the webhook path has not already produced
      // a verdict, so the happy path stays at one upstream call.
      let tasks = [];
      const fromWebhook = classifyRefreshOutcome({ truvOrderId: refreshOrder.truv_order_id, orderData: orderResult.data, webhooks });
      let outcome = fromWebhook;
      if (fromWebhook.state === 'refreshing' && userId) {
        const tasksResult = await truvClient.getUserTasks(userId);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/tasks/?user_id=${userId}`, responseBody: tasksResult.data, statusCode: tasksResult.statusCode, durationMs: tasksResult.durationMs });
        if (tasksResult.statusCode < 400) {
          tasks = tasksResult.data?.results || tasksResult.data || [];
          if (!Array.isArray(tasks)) tasks = [];
          outcome = classifyRefreshOutcome({ truvOrderId: refreshOrder.truv_order_id, orderData: orderResult.data, webhooks, tasks });
        }
      }

      res.json({
        order_id: refreshOrder.id,
        truv_order_id: refreshOrder.truv_order_id,
        user_id: userId,
        outcome,
        suborder_statuses: suborderStatuses(orderResult.data),
        // Present on the refresh order itself; used to re-engage only the applicants
        // whose refresh actually failed.
        share_url: safeParse(refreshOrder.raw_response)?.share_url || refreshOrder.share_url || null,
        bridge_token: safeParse(refreshOrder.raw_response)?.bridge_token || refreshOrder.bridge_token || null,
        voie_report_id: orderResult.data?.voie_report_id || null,
        voa_report_id: orderResult.data?.voa_report_id || null,
        _raw: { order: orderResult.data, refresh_tasks: tasksForOrder(tasks, refreshOrder.truv_order_id) },
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // GET /api/renewals/tasks/:userId
  // Diagnostic. Refresh tasks carry `is_refresh: true` plus the provider's literal
  // error_message, which is what tells you whether to re-prompt the applicant or
  // just retry later.
  router.get('/api/renewals/tasks/:userId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });
      const { userId } = req.params;
      const result = await truvClient.getUserTasks(userId);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/tasks/?user_id=${userId}`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to fetch tasks', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  return router;
}
