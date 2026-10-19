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
 * THE POINT OF THIS DEMO: reading a refresh result is harder than making the call.
 *
 * Measured against sandbox on 2026-09-17 with a webhook tunnel (REFRESH-FINDINGS.md),
 * on an order with three connected employers where one refreshed and two failed:
 *
 *   `order-status-updated` is emitted PER SUBORDER and carries an `employer_id`.
 *   Three `sent` events arrived, then a `completed` for the single employer that
 *   succeeded -- while the other two had already failed.
 *
 * So a client subscribed solely to `order-status-updated` does NOT see silence. It
 * sees `completed` and may conclude the refresh worked, having just accepted two
 * stale employers as verified income. That is worse than silence and it is the real
 * failure mode. `order-refresh-failed` is the trigger; the per-connection reason
 * lives only on the task.
 *
 * (An earlier version of this file claimed no further `order-status-updated` is ever
 * emitted and that the order "sits at sent". The order-level `completed_at` does stay
 * null, but the per-suborder events keep coming.)
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
];

// Also failures, and also not the applicant's to fix by signing in again: the
// account is blocked at the provider and they have to resolve it there. Prompting
// for re-authentication here cannot succeed, so these are deliberately NOT in
// REAUTH_STATUSES even though they are credential-adjacent.
export const PROVIDER_BLOCKED_STATUSES = [
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
  ...PROVIDER_BLOCKED_STATUSES,
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
 * naive "watch it transition" approach unreliable. Two captured runs agree on the
 * shape and differ on magnitude: 2026-08-19/20 saw failures at 0.2-5.5s and success
 * at ~13-15s; 2026-09-17 saw failures at 3-5s and success at ~20s. Either way the
 * failures land first, frequently before the UI that wants to show them has even
 * mounted, so anything reacting only to a live transition misses them.
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
  // EVERY suborder must be completed. Accepting a single `completed` here is the
  // false positive the whole demo is about: on a multi-connection order it reports
  // success while other connections are dead. (Removed 2026-09-17.)
  const statuses = suborderStatuses(orderData);
  if (statuses.length && statuses.every(s => s === 'completed')) {
    return { state: 'refreshed', reason: null, product: null, source: 'order' };
  }

  // Still in flight.
  return { state: 'refreshing', reason: null, product: null, source: 'pending' };
}

/**
 * Flattens an order's connections into one list regardless of product.
 *
 * Payroll connections live in `employers[]`, bank ones in `financial_accounts[]`.
 * Callers that care about per-connection state need them side by side, because a
 * mixed income+assets order can have one of each fail for different reasons.
 */
export function suborders(orderData) {
  const out = [];
  for (const [kind, group] of [['employer', orderData?.employers], ['financial_account', orderData?.financial_accounts]]) {
    if (!Array.isArray(group)) continue;
    for (const s of group) {
      if (!s) continue;
      out.push({
        id: s.id || null,
        kind,
        suborder_number: s.suborder_number || null,
        company_name: s.company_name || s.provider?.name || null,
        link_id: s.link_id || null,
        // Bridge Update Mode needs this specific connection's access_token, which is
        // why per-suborder resolution matters: one order can need a different remedy
        // per row.
        access_token: s.access_token || null,
        product_type: s.product_type || null,
        status: s.status || null,
        last_task_status: s.last_task_status || null,
      });
    }
  }
  return out;
}

/**
 * Resolves what happened to EACH connection on a refresh order.
 *
 * `classifyRefreshOutcome` answers "did this refresh work?" for the order as a
 * whole. That is the wrong grain for the common real case: an order with three
 * employers where one refreshes silently, one needs an MFA re-auth, and one belongs
 * to a job the person no longer has. Each row needs its own verdict because each
 * row needs a different remedy.
 *
 * Same dual-path detection as the order-level function, applied per row:
 *   1. `order-refresh-failed` matched on BOTH order_id and employer_id. The event
 *      carries employer_id, which is what makes per-row attribution possible. Note
 *      it ships link_id: null, so you cannot join it to a link — match on the
 *      suborder id.
 *   2. a refresh task for this order, matched to the row by link_id when both sides
 *      have one.
 *   3. the row's own `last_task_status`, then its `status`.
 *
 * @returns {Array} one record per connection, each carrying the fields from
 *   `suborders()` plus { state, reason, product, source, errorMessage }.
 *   state: 'refreshing' | 'refreshed' | 'reauth_required' | 'failed_other'
 */
export function classifyRefreshOutcomePerSuborder({ truvOrderId, orderData = null, originalOrderData = null, webhooks = [], tasks = [] } = {}) {
  const rows = suborders(orderData);

  // A FAILED suborder on a refresh order carries link_id: null and
  // access_token: null (verified 2026-09-17). So the refresh order alone cannot be
  // joined to a task, which is exactly the rows we most need to resolve. The
  // original order still holds the stable link_id per employer, so recover it by
  // company name and use that as the join key. Without this the no-webhook path
  // resolves the successful rows and hangs the failed ones forever.
  const linkByCompany = new Map();
  for (const o of suborders(originalOrderData)) {
    if (o.company_name && o.link_id) linkByCompany.set(o.company_name, o.link_id);
  }

  // Index the refresh-failure events by employer_id once, rather than rescanning
  // the webhook list for every row.
  const failureByEmployer = new Map();
  for (const wh of webhooks) {
    if (wh?.event_type !== 'order-refresh-failed') continue;
    const payload = typeof wh.payload === 'string' ? safeParse(wh.payload) : (wh.payload || {});
    if (truvOrderId && payload.order_id && payload.order_id !== truvOrderId) continue;
    const key = payload.employer_id || null;
    if (!key || failureByEmployer.has(key)) continue;
    failureByEmployer.set(key, { status: payload.status || null, product: payload.product || null });
  }

  const refreshTasks = tasksForOrder(tasks, truvOrderId);

  return rows.map(row => {
    // Fails CLOSED: only a known credential status routes to re-authentication.
    // The previous form treated anything unrecognised -- including null -- as
    // "prompt the applicant", which is the worst default in a benefits context.
    const stateFor = (status) => (REAUTH_STATUSES.includes(status) ? 'reauth_required' : 'failed_other');

    // 1. The dedicated failure event for this specific connection.
    const wh = row.id ? failureByEmployer.get(row.id) : null;
    if (wh) {
      return { ...row, state: stateFor(wh.status), reason: wh.status, product: wh.product, source: 'order-refresh-failed', errorMessage: null };
    }

    // 2. A refresh task we can attribute to this row, joined on link_id — the only
    //    identifier stable across a refresh. `employer_id` is regenerated on the
    //    refresh order, so it cannot reach back to the case file.
    const linkId = row.link_id || linkByCompany.get(row.company_name) || null;
    const task = linkId ? refreshTasks.find(t => t?.link_id === linkId) : null;
    if (task) {
      if (REAUTH_STATUSES.includes(task.status) || NON_REAUTH_FAILURE_STATUSES.includes(task.status)) {
        return { ...row, link_id: linkId, state: stateFor(task.status), reason: task.status, product: task.product_type || row.product_type, source: 'task', errorMessage: task.error_message || null };
      }
      if (task.status === 'done') {
        return { ...row, link_id: linkId, state: 'refreshed', reason: null, product: task.product_type || row.product_type, source: 'task', errorMessage: null };
      }
    }

    // 3. The row's own last task status, then its suborder status.
    if (row.last_task_status) {
      if (REAUTH_STATUSES.includes(row.last_task_status) || NON_REAUTH_FAILURE_STATUSES.includes(row.last_task_status)) {
        return { ...row, state: stateFor(row.last_task_status), reason: row.last_task_status, product: row.product_type, source: 'suborder', errorMessage: null };
      }
    }
    if (row.status === 'completed') {
      return { ...row, state: 'refreshed', reason: null, product: row.product_type, source: 'order', errorMessage: null };
    }
    if (row.status && NON_REAUTH_FAILURE_STATUSES.includes(row.status)) {
      return { ...row, state: 'failed_other', reason: row.status, product: row.product_type, source: 'order', errorMessage: null };
    }

    return { ...row, state: 'refreshing', reason: null, product: row.product_type, source: 'pending', errorMessage: null };
  });
}

/**
 * Rolls per-connection verdicts up to the order.
 *
 * The order does not complete while any one connection is unresolved -- its
 * `completed_at` stays null. But per-suborder `order-status-updated` events keep
 * arriving for the connections that DID work, so "watch for silence" is the wrong
 * detector. `resolvedBy` names the signal that actually carries the failure.
 */
export function rollupRefreshOutcome(rows = []) {
  const counts = { refreshed: 0, reauth_required: 0, failed_other: 0, refreshing: 0 };
  for (const r of rows) if (counts[r.state] !== undefined) counts[r.state] += 1;
  const total = rows.length;
  const blocked = counts.reauth_required + counts.failed_other;
  return {
    counts,
    total,
    // Every connection came back clean: the order completes on its own.
    complete: total > 0 && counts.refreshed === total,
    // Something failed, so the order will stay at `sent` indefinitely.
    // Some connection failed and nothing is still running. The order will not
    // complete, though per-suborder events keep arriving for the ones that worked.
    blocked: blocked > 0 && counts.refreshing === 0,
    stuckAtSent: blocked > 0 && counts.refreshing === 0, // deprecated alias
    // Still in flight.
    pending: counts.refreshing > 0,
    resolvedBy: blocked > 0 ? 'order-refresh-failed' : (total > 0 && counts.refreshed === total ? 'order-status-updated' : null),
  };
}

/**
 * Derives an order's status from its connections.
 *
 * The Order object has **no top-level `status` field** — verified against a live
 * sandbox order on 2026-09-16, whose keys are id / products / employers /
 * financial_accounts / *_report_id / initial_order / refresh_order / is_expired and
 * so on, with no `status` among them. Status lives on each suborder, and the
 * order's state is the aggregate.
 *
 * This is why a partially failed refresh never reports completion at the order
 * level: there is no order-level field to flip, so `completed_at` stays null.
 * It does NOT mean the events stop -- `order-status-updated` is per suborder and
 * keeps arriving for the connections that worked.
 */
export function deriveOrderStatus(orderData) {
  const rows = suborders(orderData);
  if (!rows.length) return null;
  if (orderData?.is_expired) return 'expired';
  if (orderData?.canceled_at) return 'canceled';
  const statuses = rows.map(r => r.status).filter(Boolean);
  if (!statuses.length) return null;
  if (statuses.every(st => st === 'completed')) return 'completed';
  // Anything unfinished keeps the order open. This is the state the TDHS orders
  // were stuck in.
  return statuses.find(st => st !== 'completed') || 'sent';
}

// Factory function: receives shared dependencies and returns a configured router
export default function renewalsRefreshRoutes({ truv, db, apiLogger }) {
  const router = Router();

  // POST /api/renewals/refresh/:orderId
  // Creates a data-refresh order against an order this demo already completed.
  // Truv returns a NEW order; we persist it so the outcome endpoint can resolve it
  // and so the panel's per-user polling is authorized for this session.
  // Shared by the single-order route and the batch runner below, so both persist
  // the new order identically and map the cap the same way. Returns a plain result
  // rather than touching `res`, which is what lets the batch path collect many.
  async function runRefresh(truvClient, sessionId, originalOrderId, body = {}) {
    const original = db.getOrder(originalOrderId);
    if (!original || !original.truv_order_id) return { statusCode: 404, payload: { error: 'Original order not found' } };

    const products = body.products || (original.product_type === 'assets' ? ['assets'] : ['income']);
    const refreshOrderId = db.generateId();

    // Optional scope. Omitting both refreshes every connection on the order; passing
    // a subset is how you skip an employer the applicant has told you they no longer
    // work for, without deleting the historical verification.
    const { employers, financial_accounts, request_extended_history } = body;

    const result = await truvClient.createRefreshOrder(original.truv_order_id, {
      products, employers, financial_accounts, request_extended_history,
    });
    const truvData = result.data;
    apiLogger.logApiCall({
      userId: original.user_id, method: 'POST', endpoint: `/v1/orders/${original.truv_order_id}/`,
      requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs,
    });

    // The per-order refresh cap is 3 per 24h. Surface it as its own signal so the UI
    // can say what happened instead of showing a generic failure.
    if (result.statusCode === 429) {
      return { statusCode: 429, payload: {
        error: 'refresh_cap_reached',
        message: 'Truv allows 3 refreshes per order per 24 hours. This order has hit that limit.',
        retry_after: result.retryAfter ?? null,
        details: truvData,
      } };
    }
    // Truv rejects a refresh when the order has no connected employer yet. That
    // happens for a few seconds after Bridge finishes — the order reads as
    // completed before its connections are refresh-eligible — and the raw message
    // ("Can not find any employers connected to refresh the data") reads like a
    // broken integration rather than "wait a moment".
    const invalid = truvData?.error?.extra?.['invalid-params'] || [];
    if (result.statusCode === 400 && invalid.some(p => /employers/.test(p?.field || '') && /connected/i.test(p?.message || ''))) {
      return { statusCode: 409, payload: {
        error: 'no_connections_yet',
        message: 'This order has no connection that can be refreshed yet. If Bridge only just finished, give it a few seconds and try again.',
        details: truvData,
      } };
    }
    if (result.statusCode >= 400) {
      return { statusCode: result.statusCode, payload: { error: 'Failed to create refresh order', details: truvData } };
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
    db.recordSessionUser(sessionId, userId);

    return { statusCode: 200, payload: {
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
    } };
  }

  router.post('/api/renewals/refresh/:orderId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });
      const { statusCode, payload } = await runRefresh(truvClient, req.session?.id, req.params.orderId, req.body || {});
      res.status(statusCode).json(payload);
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
  // Diagnostic. The task carries the provider's literal error_message, which is
  // what tells you whether to re-prompt the applicant or just retry later.
  // (`is_refresh` exists on the internal model but is absent from this response --
  // see tasksForOrder above. Match on order_id.)
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

  // GET /api/renewals/triage/:refreshOrderId
  // Per-connection outcomes for one refresh, plus the order-level roll-up.
  //
  // This is the endpoint the triage board runs on. The order-level
  // /api/renewals/outcome/:id above answers "did the refresh work?"; a three-employer
  // order needs "what happened to each of them?", because each row gets a different
  // remedy and two of the remedies are mutually exclusive.
  router.get('/api/renewals/triage/:refreshOrderId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });

      const refreshOrder = db.getOrder(req.params.refreshOrderId);
      if (!refreshOrder || !refreshOrder.truv_order_id) return res.status(404).json({ error: 'Refresh order not found' });
      const userId = refreshOrder.user_id;

      const orderResult = await truvClient.getOrder(refreshOrder.truv_order_id);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${refreshOrder.truv_order_id}/`, responseBody: orderResult.data, statusCode: orderResult.statusCode, durationMs: orderResult.durationMs });
      if (orderResult.statusCode >= 400) return res.status(orderResult.statusCode).json({ error: 'Failed to fetch refresh order', details: orderResult.data });

      const webhooks = userId ? db.getWebhookEventsByUserId(userId) : [];

      // Always fetch tasks here, unlike the order-level endpoint. A partial failure
      // produces a mix of resolved and unresolved rows, so there is no "already have
      // a verdict" short-circuit that would be safe to take.
      let tasks = [];
      if (userId) {
        const tasksResult = await truvClient.getUserTasks(userId);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/tasks/?user_id=${userId}`, responseBody: tasksResult.data, statusCode: tasksResult.statusCode, durationMs: tasksResult.durationMs });
        if (tasksResult.statusCode < 400) {
          tasks = tasksResult.data?.results || tasksResult.data || [];
          if (!Array.isArray(tasks)) tasks = [];
        }
      }

      // The refresh order's failed suborders have no link_id, so fetch the order it
      // came from -- `initial_order` points at it -- and recover the stable link per
      // employer from there. This is what lets a failed row resolve from task state
      // with no webhook delivery at all.
      let originalOrderData = null;
      const initialId = orderResult.data?.initial_order;
      if (initialId) {
        const origResult = await truvClient.getOrder(initialId);
        if (origResult.statusCode < 400) originalOrderData = origResult.data;
      }

      const rows = classifyRefreshOutcomePerSuborder({
        truvOrderId: refreshOrder.truv_order_id,
        orderData: orderResult.data, originalOrderData, webhooks, tasks,
      });
      res.json({
        order_id: refreshOrder.id,
        truv_order_id: refreshOrder.truv_order_id,
        user_id: userId,
        order_status: deriveOrderStatus(orderResult.data),
        connections: rows,
        rollup: rollupRefreshOutcome(rows),
        _raw: { order: orderResult.data, refresh_tasks: tasksForOrder(tasks, refreshOrder.truv_order_id) },
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // POST /api/renewals/reauth/:refreshOrderId/:suborderId
  // Mints a Bridge Update Mode token for ONE connection that failed a refresh.
  //
  // The token has to come from the ORIGINAL order. A failed suborder on the refresh
  // order carries access_token: null (verified 2026-09-17), so reading it there
  // fails for exactly the rows that need re-authenticating. We resolve the employer
  // by name on the order the refresh came from and use its stored token.
  //
  // Worth saying: for most cases you do not need this at all. The refresh order's
  // own share_url / bridge_token covers every failed connection in one applicant
  // action. This endpoint is for driving one specific connection inline.
  router.post('/api/renewals/reauth/:refreshOrderId/:suborderId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });

      const refreshOrder = db.getOrder(req.params.refreshOrderId);
      if (!refreshOrder || !refreshOrder.truv_order_id) return res.status(404).json({ error: 'Refresh order not found' });

      const orderResult = await truvClient.getOrder(refreshOrder.truv_order_id);
      if (orderResult.statusCode >= 400) return res.status(orderResult.statusCode).json({ error: 'Failed to fetch order', details: orderResult.data });

      const row = suborders(orderResult.data).find(r => r.id === req.params.suborderId);
      if (!row) return res.status(404).json({ error: 'Connection not found on this order' });

      // Prefer the refresh order's own token when it has one (the succeeded rows),
      // otherwise fall back to the original order's suborder for the same employer.
      let accessToken = row.access_token;
      let tokenFrom = 'refresh order';
      if (!accessToken && orderResult.data?.initial_order) {
        const origResult = await truvClient.getOrder(orderResult.data.initial_order);
        if (origResult.statusCode < 400) {
          const orig = suborders(origResult.data).find(o => o.company_name === row.company_name && o.access_token);
          if (orig) { accessToken = orig.access_token; tokenFrom = 'original order'; }
        }
      }
      if (!accessToken) {
        return res.status(409).json({
          error: 'no_access_token',
          message: 'No stored access_token for this connection on either the refresh order or the order it came from. Send the refresh order\'s share_url instead — it covers every failed connection.',
          share_url: safeParse(refreshOrder.raw_response)?.share_url || refreshOrder.share_url || null,
        });
      }

      const userId = orderResult.data?.user_id || refreshOrder.user_id;
      const productType = req.body?.product_type || row.product_type || 'income';
      const result = await truvClient.createUserBridgeToken(userId, productType, { access_token: accessToken });
      apiLogger.logApiCall({
        userId, method: 'POST', endpoint: `/v1/users/${userId}/tokens/`,
        requestBody: result.requestBody, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs,
      });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to create update-mode bridge token', details: result.data });

      db.recordSessionUser(req.session?.id, userId);
      res.json({ bridge_token: result.data?.bridge_token || null, user_id: userId, suborder_id: row.id, product_type: productType, mode: 'update', token_from: tokenFrom });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // GET /api/renewals/refresh-task/:taskId
  // Reads a refresh task by id. The only place a `session_expired` refresh task is
  // visible — it does not appear in GET /v1/tasks/?user_id=. Applies to the
  // token-refresh path, which hands back a task_id; the order-refresh path does not,
  // so there `order-refresh-failed` remains the signal.
  router.get('/api/renewals/refresh-task/:taskId', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });
      const result = await truvClient.getRefreshTask(req.params.taskId);
      apiLogger.logApiCall({ method: 'GET', endpoint: `/v1/refresh/tasks/${req.params.taskId}/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to fetch refresh task', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  return router;
}
