/**
 * FILE SUMMARY: Renewals & Data Refresh routes (recertification without re-collecting docs)
 * DATA FLOW: Frontend -> POST/GET /api/renewals/* -> TruvClient -> Truv API
 * INTEGRATION PATTERN: Orders flow, refreshing the connections an earlier order made
 *
 * Drives the public-sector renewals demo:
 *   1. Refresh an existing order        POST /api/renewals/refresh/:orderId
 *   2. Resolve each refresh's outcome   GET  /api/renewals/outcome/:refreshOrderId
 *   3. Read the refresh's report        GET  /api/renewals/report/:refreshOrderId/:type
 *   4. (diagnostic) list user tasks     GET  /api/renewals/tasks/:userId
 *
 * Measured against sandbox on 2026-09-17 with a webhook tunnel (REFRESH-FINDINGS.md),
 * on an order with three connected employers where one refreshed and two failed:
 *
 *   `order-status-updated` is sent per suborder and carries an `employer_id`.
 *   Three `sent` events arrived, then a `completed` for the one employer that
 *   succeeded, after the other two had already failed.
 *
 * So a client that only subscribes to `order-status-updated` does not see silence. It
 * sees `completed` and may conclude the refresh worked, and accept two stale employers
 * as verified income. `order-refresh-failed` is the event to act on, and the reason for
 * each connection is only on the task.
 *
 * Tested in the sandbox on 2026-08-19/20:
 *   goodlogin/goodpassword  -> succeeds on its own in ~13-15s
 *   goodlogin/mfa_captcha   -> order-refresh-failed (mfa_error) in 0.2-5.5s
 *   goodlogin/mfa on a bank -> same result, product: assets
 * A failed refresh order can be recovered with its own bridge_token: Bridge skips
 * username/password (the connection is already authorized) and resumes at the MFA
 * challenge, after which the refresh order itself completes.
 */

// WHICH FUNCTION TO USE, if you are lifting the logic into your own code:
//   classifyRefreshOutcomePerSuborder  one verdict per connection. This is the one to build on.
//   rollupRefreshOutcome               turns those verdicts into an order-level summary.
//   classifyRefreshOutcome             a single verdict for the whole refresh order. It is correct for an
//                                      order with one connection and too coarse for more than one.
//   tasksForOrder, suborders           small helpers the classifiers use.
// All of these are pure (no database, no network). The router below (runRefresh and the routes) is
// demo wiring: it uses SQLite and the demo's logger, so copy the classifiers and write your own routes.

// Express router factory
import { Router } from 'express';

// Demo identifier persisted on every order this demo creates
const RENEWALS_DEMO_ID = 'public-sector-renewals-refresh';

// Task statuses where the applicant has to sign in or answer MFA again: the saved
// session went stale or the provider now wants an MFA code. Only these should
// prompt the applicant.
export const REAUTH_STATUSES = [
  'login_error',
  'mfa_error',
  'session_expired',
];

// Also failures, but signing in again will not fix them: the account is blocked at
// the provider and the applicant has to sort it out there. They stay out of
// REAUTH_STATUSES because a sign-in prompt cannot succeed.
export const PROVIDER_BLOCKED_STATUSES = [
  'account_locked',
  'unable_to_reset',
];

// Task statuses that also fail the refresh but are not the applicant's fault.
// Asking someone to sign in again because the provider is down, or returned no
// records, would only confuse them, so these are kept separate.
// `order-refresh-failed` fires for these too, so branch on `status`, not on the
// event type.
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

// Collects each suborder's status from an order response, for any product. Payroll
// connections are in `employers[]`, bank connections in `financial_accounts[]`.
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
 * Picks out the tasks that belong to one refresh order.
 *
 * Matches on `order_id`, which the tasks response includes. It does not rely on
 * `is_refresh`: that field is missing from the `GET /v1/tasks/` response (checked
 * live 2026-08-20), so filtering on it matches nothing. `is_refresh` is still used
 * when a task has no `order_id`, in case a later API version adds it. A task that
 * names a different order never matches.
 */
export function tasksForOrder(tasks, truvOrderId) {
  return (tasks || []).filter(t => (
    (truvOrderId && t?.order_id === truvOrderId) || (t?.order_id == null && t?.is_refresh === true)
  ));
}

/**
 * The most recent task in a list, by `created_at`. One connection can have two tasks on
 * the same refresh order: one that failed, then one that finished after the applicant
 * cleared the challenge. The list order is not guaranteed, so pick by time.
 */
function newestTask(tasks) {
  return tasks.reduce((best, t) => (
    !best || (Date.parse(t?.created_at) || 0) > (Date.parse(best?.created_at) || 0) ? t : best
  ), null);
}

/**
 * Works out what happened to a refresh from its current state, not by watching it
 * change.
 *
 * Timing is why. Two captured runs followed the same pattern with different
 * numbers: 2026-08-19/20 saw failures at 0.2-5.5s and success at ~13-15s;
 * 2026-09-17 saw failures at 3-5s and success at ~20s. Failures come back first,
 * often before the screen that shows them has loaded, so code that only reacts to a
 * live change misses them.
 *
 * Checks, in order:
 *   1. `order-refresh-failed` webhook for this order  (fast and exact, hosted only)
 *   2. the refresh task's own status                  (works with no webhook
 *                                                      tunnel, i.e. localhost)
 *   3. the order's suborder status                    (completed = succeeded on its own)
 *
 * Check 2 is what makes local development work: Truv cannot send a webhook to
 * localhost, so a webhook-only version shows nothing during `npm run dev`.
 *
 * Exported so the tests run the real logic.
 *
 * @returns {{state: string, reason: string|null, product: string|null, source: string}}
 *   state: 'refreshing' | 'refreshed' | 'reauth_required' | 'failed_other'
 */
export function classifyRefreshOutcome({ truvOrderId, orderData = null, webhooks = [], tasks = [] } = {}) {
  // If every suborder completed, the refresh worked. That includes the case where the
  // applicant just answered a challenge on a failed refresh order: an older
  // credential failure must not win, or the row flips back to "needs the applicant"
  // on the next poll. Provider failures like no_data are not overridden, since
  // completing does not clear them.
  const priorStatuses = suborderStatuses(orderData);
  const allDone = priorStatuses.length > 0 && priorStatuses.every(s => s === 'completed');

  // 1. The dedicated failure event, matched to this specific refresh order.
  for (const wh of webhooks) {
    if (wh?.event_type !== 'order-refresh-failed') continue;
    const payload = typeof wh.payload === 'string' ? safeParse(wh.payload) : (wh.payload || {});
    if (truvOrderId && payload.order_id && payload.order_id !== truvOrderId) continue;
    const status = payload.status || wh.status || null;
    // Only a known credential status prompts the applicant. Anything else counts as a
    // failure the applicant cannot fix.
    const state = REAUTH_STATUSES.includes(status) ? 'reauth_required' : 'failed_other';
    if (state === 'reauth_required' && allDone) continue;
    return {
      state,
      reason: status,
      product: payload.product || null,
      source: 'order-refresh-failed',
    };
  }

  // 2. No webhook (or no tunnel): read the refresh task's own status.
  //
  // Match tasks by `order_id`. Do not filter on `is_refresh`: the public
  // `GET /v1/tasks/` response leaves it out (checked live 2026-08-20), so that filter
  // matches nothing and this fallback never fires. `order_id` points at the refresh
  // order, not the original, so there is no need to guess by recency.
  const refreshTasks = tasksForOrder(tasks, truvOrderId);
  for (const t of refreshTasks) {
    if (REAUTH_STATUSES.includes(t.status) && !allDone) {
      return { state: 'reauth_required', reason: t.status, product: t.product_type || null, source: 'task', errorMessage: t.error_message || null };
    }
    if (NON_REAUTH_FAILURE_STATUSES.includes(t.status)) {
      return { state: 'failed_other', reason: t.status, product: t.product_type || null, source: 'task', errorMessage: t.error_message || null };
    }
  }

  // 2b. Some suborders carry the same status in `last_task_status`. It is already in
  // the order response and helps when no task matches, but it is null on many
  // responses, so it cannot be the main check.
  for (const group of [orderData?.employers, orderData?.financial_accounts]) {
    if (!Array.isArray(group)) continue;
    for (const s of group) {
      const st = s?.last_task_status;
      if (!st) continue;
      if (REAUTH_STATUSES.includes(st) && !allDone) return { state: 'reauth_required', reason: st, product: s.product_type || null, source: 'suborder' };
      if (NON_REAUTH_FAILURE_STATUSES.includes(st)) return { state: 'failed_other', reason: st, product: s.product_type || null, source: 'suborder' };
    }
  }

  // 3. Success means every suborder is completed. Accepting a single `completed`
  // gives a false positive on a multi-connection order, where other connections have
  // failed. (The single-completed check was removed 2026-09-17.)
  if (allDone) {
    return { state: 'refreshed', reason: null, product: null, source: 'order' };
  }

  // Still in flight.
  return { state: 'refreshing', reason: null, product: null, source: 'pending' };
}

/**
 * Puts an order's connections in one list, for any product.
 *
 * Payroll connections are in `employers[]` and bank connections in
 * `financial_accounts[]`. A mixed income and assets order can fail on each for
 * different reasons, so callers need them side by side.
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
        // Bridge Update Mode needs this connection's access_token. Each connection on
        // an order can need a different fix.
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
 * Works out what happened to each connection on a refresh order.
 *
 * `classifyRefreshOutcome` answers "did this refresh work?" for the whole order.
 * That is too coarse for a typical case: three employers, where one refreshes on
 * its own, one needs the applicant for MFA, and one is a job the person no longer
 * has. Each connection needs its own result because each needs a different fix.
 *
 * Same checks as the order-level function, run per connection:
 *   1. `order-refresh-failed`, matched on both order_id and employer_id. The
 *      event's `employer_id` is what ties it to one connection. Its `link_id` is
 *      null, so match on the suborder id.
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

  // A failed suborder on a refresh order has link_id: null and access_token: null
  // (checked 2026-09-17), so it cannot be matched to a task, and those are the rows
  // we most need to resolve. The original order still has each employer's link_id,
  // so look it up by company name and match on that. Without this, the no-webhook
  // path resolves the successful rows and never resolves the failed ones.
  const linkByCompany = new Map();
  for (const o of suborders(originalOrderData)) {
    if (o.company_name && o.link_id) linkByCompany.set(o.company_name, o.link_id);
  }

  // Index the failure events by employer_id so each row does not rescan the list.
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
    // Only a known credential status prompts the applicant. An earlier version
    // treated any unrecognized status, including null, as "prompt the applicant",
    // which is the wrong default for a benefits case.
    const stateFor = (status) => (REAUTH_STATUSES.includes(status) ? 'reauth_required' : 'failed_other');

    // 1. The dedicated failure event for this specific connection.
    const recovered = row.status === 'completed';
    const staleReauth = (status) => recovered && stateFor(status) === 'reauth_required';
    const wh = row.id ? failureByEmployer.get(row.id) : null;
    if (wh && !staleReauth(wh.status)) {
      return { ...row, state: stateFor(wh.status), reason: wh.status, product: wh.product, source: 'order-refresh-failed', errorMessage: null };
    }

    // 2. A refresh task for this row, matched on link_id. That is the only id that
    //    stays the same across a refresh. `employer_id` is new on every refresh order,
    //    so it cannot be matched back to the case file.
    const linkId = row.link_id || linkByCompany.get(row.company_name) || null;
    const task = linkId ? newestTask(refreshTasks.filter(t => t?.link_id === linkId)) : null;
    if (task) {
      if ((REAUTH_STATUSES.includes(task.status) || NON_REAUTH_FAILURE_STATUSES.includes(task.status)) && !staleReauth(task.status)) {
        return { ...row, link_id: linkId, state: stateFor(task.status), reason: task.status, product: task.product_type || row.product_type, source: 'task', errorMessage: task.error_message || null };
      }
      if (task.status === 'done') {
        return { ...row, link_id: linkId, state: 'refreshed', reason: null, product: task.product_type || row.product_type, source: 'task', errorMessage: null };
      }
    }

    // 3. The row's own last task status, then its suborder status.
    if (row.last_task_status) {
      if ((REAUTH_STATUSES.includes(row.last_task_status) || NON_REAUTH_FAILURE_STATUSES.includes(row.last_task_status)) && !staleReauth(row.last_task_status)) {
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
 * Combines per-connection results into one result for the order.
 *
 * The order does not complete while any connection is unresolved, so its
 * `completed_at` stays null. But `order-status-updated` events keep arriving for
 * the connections that worked, so waiting for silence will not detect a failure.
 * `resolvedBy` names the event that does.
 */
export function rollupRefreshOutcome(rows = []) {
  const counts = { refreshed: 0, reauth_required: 0, failed_other: 0, refreshing: 0 };
  for (const r of rows) if (counts[r.state] !== undefined) counts[r.state] += 1;
  const total = rows.length;
  const blocked = counts.reauth_required + counts.failed_other;
  return {
    counts,
    total,
    // Every connection refreshed: the order completes on its own.
    complete: total > 0 && counts.refreshed === total,
    // At least one connection failed and none are still running. The order will not
    // complete, though events keep arriving for the connections that worked.
    blocked: blocked > 0 && counts.refreshing === 0,
    // Still in flight.
    pending: counts.refreshing > 0,
    resolvedBy: blocked > 0 ? 'order-refresh-failed' : (total > 0 && counts.refreshed === total ? 'order-status-updated' : null),
  };
}

/**
 * Reduces per-connection results to the one result a case-level screen needs.
 *
 * Nothing is reported until every connection has an answer, so the screen never
 * says "needs the applicant" while another connection is still running. After that
 * the worst result wins: a failure the applicant can fix ranks above one they
 * cannot, and any failure ranks above success. For an order with one connection,
 * `classifyRefreshOutcome` is enough. This function exists because that one returns
 * the first failure it finds, which is too coarse for several connections.
 *
 * @returns {{state: string, reason: string|null, product: string|null, source: string, errorMessage: string|null}}
 */
export function outcomeFromConnections(rows = []) {
  if (!rows.length || rows.some(r => r.state === 'refreshing')) {
    return { state: 'refreshing', reason: null, product: null, source: 'pending' };
  }
  const worst = rows.find(r => r.state === 'reauth_required') || rows.find(r => r.state === 'failed_other');
  if (worst) {
    return { state: worst.state, reason: worst.reason || null, product: worst.product || null, source: worst.source || 'task', errorMessage: worst.errorMessage || null };
  }
  return { state: 'refreshed', reason: null, product: null, source: 'order' };
}

/**
 * Works out an order's status from its connections.
 *
 * The Order object has no top-level `status` field. Checked against a live sandbox
 * order on 2026-09-16: its keys are id / products / employers / financial_accounts /
 * *_report_id / initial_order / refresh_order / is_expired and so on, with no
 * `status`. Status is on each suborder, so the order's status is built from those.
 *
 * So a partly failed refresh never shows as complete at the order level, and
 * `completed_at` stays null. The events do not stop: `order-status-updated` is sent
 * per suborder and keeps arriving for the connections that worked.
 */
export function deriveOrderStatus(orderData) {
  const rows = suborders(orderData);
  if (!rows.length) return null;
  if (orderData?.is_expired) return 'expired';
  if (orderData?.canceled_at) return 'canceled';
  const statuses = rows.map(r => r.status).filter(Boolean);
  if (!statuses.length) return null;
  if (statuses.every(st => st === 'completed')) return 'completed';
  // Any unfinished suborder keeps the order unfinished. TDHS orders were stuck in
  // this state.
  return statuses.find(st => st !== 'completed') || 'sent';
}

// Which field on a refresh order names its report, and how to read that report by id.
const REFRESH_REPORT_KINDS = {
  income: {
    orderField: 'voie_report_id',
    get: (t, uid, rid) => t.getVoieReport(uid, rid),
    path: (uid, rid) => `/v1/users/${uid}/reports/${rid}/`,
  },
  assets: {
    orderField: 'voa_report_id',
    get: (t, uid, rid) => t.getAssetsReport(uid, rid),
    path: (uid, rid) => `/v1/users/${uid}/assets/reports/${rid}/`,
  },
};

// Factory: receives shared dependencies and returns a configured router
export default function renewalsRefreshRoutes({ truv, db, apiLogger, reportDelaysMs = [0, 2000, 4000] }) {
  const router = Router();

  // POST /api/renewals/refresh/:orderId
  // Creates a refresh order against an order this demo already completed. Truv
  // returns a new order; we save it so the outcome endpoint can look it up and the
  // panel can poll that user for this session. Returns a result object rather than
  // writing to `res`.
  async function runRefresh(truvClient, sessionId, originalOrderId, body = {}) {
    const original = db.getOrder(originalOrderId);
    if (!original || !original.truv_order_id) return { statusCode: 404, payload: { error: 'Original order not found' } };

    const products = body.products || (original.product_type === 'assets' ? ['assets'] : ['income']);
    const refreshOrderId = db.generateId();

    // Optional scope. Leave both out to refresh every connection on the order. Pass a
    // subset to skip an employer the applicant no longer works for, without deleting
    // the earlier verification.
    const { employers, financial_accounts, request_extended_history } = body;

    const result = await truvClient.createRefreshOrder(original.truv_order_id, {
      products, employers, financial_accounts, request_extended_history,
    });
    const truvData = result.data;
    apiLogger.logApiCall({
      userId: original.user_id, method: 'POST', endpoint: `/v1/orders/${original.truv_order_id}/`,
      requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs,
    });

    // The limit is counted per connection (access_token): 1 initial request plus 3
    // refreshes per 24h. Return it as its own error so the UI can say what happened.
    if (result.statusCode === 429) {
      // Truv's response says when the order can be refreshed again:
      // "Order refresh limit exceeded Expected available in 86315 seconds."
      const waitSeconds = Number((JSON.stringify(truvData || {}).match(/available in (\d+) seconds/i) || [])[1]) || null;
      const hours = Math.max(1, Math.round((waitSeconds || 0) / 3600));
      const wait = waitSeconds ? ` It can be refreshed again in about ${hours} hour${hours === 1 ? '' : 's'}.` : '';
      return { statusCode: 429, payload: {
        error: 'refresh_cap_reached',
        message: `Truv limits each connection to 3 refreshes per 24 hours, and a connection on this order has reached that limit.${wait}`,
        retry_after: result.retryAfter ?? waitSeconds,
        details: truvData,
      } };
    }
    // A refresh sent while another is still running on the same order is rejected.
    // Observed 2026-10-21: 400 {"error":{"code":"invalid","message":"Refresh already in progress"}}.
    if (result.statusCode === 400 && /already in progress/i.test(truvData?.error?.message || '')) {
      return { statusCode: 409, payload: {
        error: 'refresh_in_progress',
        message: 'A refresh is already running for this order. Wait for it to finish before starting another.',
        details: truvData,
      } };
    }
    // Truv rejects a refresh when the order has no connected employer yet. This
    // happens for a few seconds after Bridge finishes: the order shows completed
    // before its connections can be refreshed. The raw message ("Can not find any
    // employers connected to refresh the data") looks like a broken integration, so
    // return a clearer one.
    const invalid = truvData?.error?.extra?.['invalid-params'] || [];
    if (result.statusCode === 400 && invalid.some(p => /employers|financial_accounts/.test(p?.field || '') && /connected/i.test(p?.message || ''))) {
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
      // Use these to recover a failed refresh: Bridge resumes at the MFA challenge
      // instead of asking for credentials again.
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

      // Task fallback. Only fetched when the webhook has not already given an answer,
      // so the normal case makes one Truv call.
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

      // More than one connection on this refresh: resolve each on its own, then
      // combine. A single-connection refresh keeps the order-level answer above.
      let connections = null;
      if (suborders(orderResult.data).length > 1 && userId) {
        if (!tasks.length) {
          const tasksResult = await truvClient.getUserTasks(userId);
          apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/tasks/?user_id=${userId}`, responseBody: tasksResult.data, statusCode: tasksResult.statusCode, durationMs: tasksResult.durationMs });
          if (tasksResult.statusCode < 400) {
            tasks = tasksResult.data?.results || tasksResult.data || [];
            if (!Array.isArray(tasks)) tasks = [];
          }
        }
        let originalOrderData = null;
        const initialId = orderResult.data?.initial_order;
        if (initialId) {
          const origResult = await truvClient.getOrder(initialId);
          if (origResult.statusCode < 400) originalOrderData = origResult.data;
        }
        connections = classifyRefreshOutcomePerSuborder({ truvOrderId: refreshOrder.truv_order_id, orderData: orderResult.data, originalOrderData, webhooks, tasks });
        outcome = outcomeFromConnections(connections);
      }

      res.json({
        order_id: refreshOrder.id,
        truv_order_id: refreshOrder.truv_order_id,
        user_id: userId,
        outcome,
        connections: connections && connections.map(({ id, kind, company_name, product_type, state, reason, errorMessage }) => ({ id, kind, company_name, product_type, state, reason, errorMessage })),
        suborder_statuses: suborderStatuses(orderResult.data),
        // On the refresh order itself. Used to contact only the applicants whose
        // refresh failed.
        share_url: safeParse(refreshOrder.raw_response)?.share_url || refreshOrder.share_url || null,
        bridge_token: safeParse(refreshOrder.raw_response)?.bridge_token || refreshOrder.bridge_token || null,
        voie_report_id: orderResult.data?.voie_report_id || null,
        voa_report_id: orderResult.data?.voa_report_id || null,
        _raw: { order: orderResult.data, refresh_tasks: tasksForOrder(tasks, refreshOrder.truv_order_id) },
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // GET /api/renewals/report/:refreshOrderId/:type   (type: income | assets)
  // Reads the report a completed refresh already has. Nothing is created: the
  // refresh order has its own report id (`voie_report_id` for income,
  // `voa_report_id` for assets), so it is GET order, then GET report by that id.
  router.get('/api/renewals/report/:refreshOrderId/:type', async (req, res) => {
    try {
      const truvClient = req.truv || truv;
      if (!truvClient) return res.status(401).json({ error: 'session_required' });

      const kind = REFRESH_REPORT_KINDS[req.params.type];
      if (!kind) return res.status(400).json({ error: `Unknown report type: ${req.params.type}` });
      const refreshOrder = db.getOrder(req.params.refreshOrderId);
      if (!refreshOrder || !refreshOrder.truv_order_id) return res.status(404).json({ error: 'Refresh order not found' });
      const userId = refreshOrder.user_id;

      // The report id can show up a moment after the order completes, so retry a few times.
      let reportId = null;
      let orderStatus = 200;
      for (let i = 0; i < reportDelaysMs.length && !reportId; i++) {
        if (reportDelaysMs[i]) await new Promise(r => setTimeout(r, reportDelaysMs[i]));
        const orderResult = await truvClient.getOrder(refreshOrder.truv_order_id);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${refreshOrder.truv_order_id}/`, responseBody: orderResult.data, statusCode: orderResult.statusCode, durationMs: orderResult.durationMs });
        orderStatus = orderResult.statusCode;
        if (orderStatus >= 400) return res.status(orderStatus).json({ error: 'Failed to fetch refresh order', details: orderResult.data });
        reportId = orderResult.data?.[kind.orderField] || null;
      }
      if (!reportId) return res.status(404).json({ error: 'report_not_ready', message: 'The refresh order does not have a report yet.' });

      let result;
      for (let i = 0; i < reportDelaysMs.length; i++) {
        if (reportDelaysMs[i]) await new Promise(r => setTimeout(r, reportDelaysMs[i]));
        result = await kind.get(truvClient, userId, reportId);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: kind.path(userId, reportId), responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
        if (result.statusCode < 400) break;
      }
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to retrieve report', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error', detail: err?.message }); }
  });

  // GET /api/renewals/tasks/:userId
  // For debugging. The task has the provider's exact error_message, which tells you
  // whether to ask the applicant to sign in again or just retry later.
  // (`is_refresh` is not in this response, see tasksForOrder above. Match on
  // order_id.)
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
  // Result for each connection on one refresh, plus the order-level summary.
  //
  // The order-level /api/renewals/outcome/:id above answers "did the refresh work?".
  // An order with three employers needs "what happened to each one?", because each
  // needs a different fix.
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

      // Always fetch tasks here, unlike the order-level endpoint. With a partial
      // failure some connections are resolved and some are not, so there is no safe
      // shortcut.
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
      // came from (`initial_order`) and get each employer's link_id there. This lets a
      // failed connection resolve from its task with no webhook at all.
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
  // Creates a Bridge Update Mode token for one connection that failed a refresh.
  //
  // The access token comes from the original order. A failed suborder on the refresh
  // order has access_token: null (checked 2026-09-17), so it is missing for exactly
  // the connections that need it. We find the employer by name on the original order
  // and use its access token.
  //
  // You usually do not need this. The refresh order's own share_url / bridge_token
  // covers every failed connection in one step for the applicant. This endpoint is
  // for opening one specific connection directly.
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

      // Use the refresh order's own token when it has one (connections that
      // succeeded), otherwise the original order's token for the same employer.
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
          message: 'No access_token is available for this connection on either the refresh order or the order it came from. Send the refresh order\'s share_url instead. It covers every failed connection.',
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
  // Reads a refresh task by id. This is the only place a `session_expired` refresh
  // task shows up; it is not in GET /v1/tasks/?user_id=. It only helps on the
  // token-refresh path, which returns a task_id. The order-refresh path does not, so
  // there `order-refresh-failed` is the signal.
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
