/**
 * FILE SUMMARY: Sandbox Data Playground: create, manage and try test logins.
 * DATA FLOW: Frontend -> /api/sandbox/* -> TruvClient -> Truv sandbox data API (/v1/sandbox/*)
 *            Frontend -> POST /api/sandbox/run -> order (+ headless sign-in) -> GET /api/sandbox/run/:orderId
 *
 * Scenarios are a login plus the data Truv returns for it. They live on the account, are shared by
 * everyone using a sandbox key, and the API refuses production keys (403 env_not_sandbox).
 *
 * This is not a general proxy. Each route maps to one documented endpoint, ids are checked before
 * they go into a path, and nothing here can reach an endpoint outside the sandbox data API, orders,
 * checks and tasks.
 *
 * Every result comes back in an envelope { status, data, calls }. `calls` is the trace of every
 * Truv request the route made, so the Dev panel can show exactly what happened.
 */

import { Router } from 'express';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PAGES = 20;          // 100 scenarios per account by default, so this is generous
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// The size of a base64 string once decoded, to the byte.
const decodedBytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export default function sandboxRoutes({ truv }) {
  const router = Router();

  // One Truv request, recorded. Returns { result, call }.
  async function traced(calls, fn, method, endpoint, requestBody) {
    const result = await fn();
    const call = {
      id: `${Date.now()}-${calls.length}`,
      method,
      endpoint,
      status_code: result.statusCode,
      request_body: requestBody ?? result.requestBody ?? null,
      response_body: result.statusCode === 204 ? null : result.data,
      duration_ms: result.durationMs,
    };
    calls.push(call);
    return result;
  }

  // Resolves the client for this request, or answers 401.
  function client(req, res) {
    const c = req.truv || truv;
    if (!c) { res.status(401).json({ error: 'session_required' }); return null; }
    return c;
  }

  // Creating an order on a production key would create a real one, so a run first asks the sandbox
  // data API, which only sandbox keys can use. A good answer is remembered for ten minutes per client.
  const sandboxKeys = new WeakMap();
  async function sandboxKeyOnly(c, calls) {
    if (sandboxKeys.get(c) > Date.now() - 10 * 60 * 1000) return null;
    const r = await traced(calls, () => c.sandbox('GET', 'scenarios/'), 'GET', '/v1/sandbox/scenarios/');
    if (r.statusCode === 200) { sandboxKeys.set(c, Date.now()); return null; }
    return r;
  }

  const bad = (res, message) => res.status(400).json({ error: 'bad_request', message });
  const envelope = (res, result, calls, extra = {}) => res.json({ status: result.statusCode, data: result.data, calls, ...extra });
  const fail = (res, err) => { console.error(err); res.status(500).json({ error: 'internal_error', message: err?.message }); };
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

  // GET /api/sandbox/scenarios?data_source=&enabled=&product=
  // Follows the cursor to the end, so the page always holds the whole list.
  router.get('/api/sandbox/scenarios', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const params = new URLSearchParams();
      for (const k of ['data_source', 'enabled', 'product']) if (typeof req.query[k] === 'string' && req.query[k]) params.set(k, req.query[k]);
      const calls = [];
      const results = [];
      let cursor = null;
      let last = null;
      let truncated = false;
      const seen = new Set();
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = new URLSearchParams(params);
        if (cursor) q.set('cursor', cursor);
        const qs = q.toString();
        last = await traced(calls, () => c.sandbox('GET', `scenarios/${qs ? `?${qs}` : ''}`), 'GET', `/v1/sandbox/scenarios/${qs ? `?${qs}` : ''}`);
        if (last.statusCode >= 400) return envelope(res, last, calls);
        results.push(...(last.data?.results || []));
        const next = last.data?.next;
        if (!next) { cursor = null; break; }
        try { cursor = new URL(next).searchParams.get('cursor'); } catch { cursor = null; }
        if (!cursor) break;
        if (seen.has(cursor)) { truncated = true; break; }
        seen.add(cursor);
        if (page === MAX_PAGES - 1) truncated = true;
      }
      res.json({ status: 200, data: { results, truncated }, calls });
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/scenarios
  router.post('/api/sandbox/scenarios', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!isObject(req.body)) return bad(res, 'Send the scenario as a JSON object.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('POST', 'scenarios/', req.body), 'POST', '/v1/sandbox/scenarios/', req.body);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // PATCH /api/sandbox/scenarios/:id
  router.patch('/api/sandbox/scenarios/:id', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!ID.test(req.params.id)) return bad(res, 'That is not a scenario id.');
      if (!isObject(req.body)) return bad(res, 'Send the changes as a JSON object.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('PATCH', `scenarios/${req.params.id}/`, req.body), 'PATCH', `/v1/sandbox/scenarios/${req.params.id}/`, req.body);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // DELETE /api/sandbox/scenarios/:id   (204 from Truv; answered here as { status: 204 })
  router.delete('/api/sandbox/scenarios/:id', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!ID.test(req.params.id)) return bad(res, 'That is not a scenario id.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('DELETE', `scenarios/${req.params.id}/`), 'DELETE', `/v1/sandbox/scenarios/${req.params.id}/`);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/resolve   { data_source, username, password, provider_id, company_domain, product, is_refresh }
  router.post('/api/sandbox/resolve', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!isObject(req.body)) return bad(res, 'Send the login to check as a JSON object.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('POST', 'scenarios/resolve/', req.body), 'POST', '/v1/sandbox/scenarios/resolve/', req.body);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // --- PDF library ---

  router.get('/api/sandbox/documents', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const calls = [];
      const results = [];
      let cursor = null;
      let last = null;
      let truncated = false;
      const seen = new Set();
      for (let page = 0; page < MAX_PAGES; page++) {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        last = await traced(calls, () => c.sandbox('GET', `documents/${qs}`), 'GET', `/v1/sandbox/documents/${qs}`);
        if (last.statusCode >= 400) return envelope(res, last, calls);
        results.push(...(last.data?.results || []));
        const next = last.data?.next;
        if (!next) break;
        try { cursor = new URL(next).searchParams.get('cursor'); } catch { cursor = null; }
        if (!cursor) break;
        if (seen.has(cursor)) { truncated = true; break; }
        seen.add(cursor);
        if (page === MAX_PAGES - 1) truncated = true;
      }
      res.json({ status: 200, data: { results, truncated }, calls });
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/documents   { filename, content }   content is the PDF, base64 encoded
  router.post('/api/sandbox/documents', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const { filename, content } = req.body || {};
      if (typeof filename !== 'string' || !filename.trim()) return bad(res, 'Give the file a name.');
      if (typeof content !== 'string' || !content) return bad(res, 'Choose a PDF to upload.');
      if (decodedBytes(content) > MAX_PDF_BYTES) return bad(res, 'That file is over the 10 MB limit.');
      const calls = [];
      // The trace shows the request without the file bytes.
      const traceBody = { filename, content: `[${Math.round(decodedBytes(content) / 1024)} KB, base64]` };
      const r = await traced(calls, () => c.sandbox('POST', 'documents/', { filename, content }), 'POST', '/v1/sandbox/documents/', traceBody);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  router.patch('/api/sandbox/documents/:id', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!ID.test(req.params.id)) return bad(res, 'That is not a document id.');
      if (!isObject(req.body)) return bad(res, 'Send the changes as a JSON object.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('PATCH', `documents/${req.params.id}/`, req.body), 'PATCH', `/v1/sandbox/documents/${req.params.id}/`, req.body);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  router.delete('/api/sandbox/documents/:id', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!ID.test(req.params.id)) return bad(res, 'That is not a document id.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('DELETE', `documents/${req.params.id}/`), 'DELETE', `/v1/sandbox/documents/${req.params.id}/`);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // --- Try a login ---

  const PRODUCTS = ['income', 'employment', 'assets', 'deposit_switch', 'pll'];
  const HEADLESS_PRODUCTS = ['income', 'employment'];

  // POST /api/sandbox/run   { mode: 'headless' | 'widget', product, login?, password? }
  //   headless: creates a sandbox order, then signs in to the Truv test payroll provider with the login,
  //             the way Bridge would. Income and employment only. A login that asks for an MFA code
  //             cannot be answered without the widget, so the page sends those to widget mode.
  //   widget:   creates the order and returns its bridge token, for opening Bridge as a dialog.
  // Returns the ids to read the run back with.
  router.post('/api/sandbox/run', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const { mode = 'headless', product = 'income', login, password } = req.body || {};
      if (!['headless', 'widget'].includes(mode)) return bad(res, 'Choose headless or widget.');
      if (!PRODUCTS.includes(product)) return bad(res, 'That product cannot be tried here.');
      if (mode === 'headless') {
        if (!HEADLESS_PRODUCTS.includes(product)) return bad(res, 'Running a login here covers income and employment. Open the others in Bridge.');
        if (typeof login !== 'string' || !login) return bad(res, 'Enter a login.');
        if (typeof password !== 'string' || !password) return bad(res, 'Enter a password.');
      }
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      // Deposit switch and PLL attach their test account to an employer; the others take none.
      const employers = ['deposit_switch', 'pll'].includes(product) ? [{ company_name: 'Sandbox Employer' }] : undefined;
      const order = await traced(calls, () => c.createOrder({ product_type: product, first_name: 'Test', last_name: 'Login', ...(employers ? { employers } : {}) }), 'POST', '/v1/orders/');
      if (order.statusCode >= 400) return envelope(res, order, calls);
      const ids = { order_id: order.data?.id, user_id: order.data?.user_id };
      if (mode === 'widget') {
        if (!order.data?.bridge_token) return res.json({ status: 502, data: { error: { code: 'no_bridge_token', message: 'Truv created the order but returned no token to open Bridge with.' } }, calls });
        return res.json({ status: 201, data: { ...ids, bridge_token: order.data.bridge_token }, calls });
      }
      const bridgeToken = order.data?.employers?.[0]?.bridge_token || order.data?.bridge_token;
      if (!bridgeToken) return res.json({ status: 502, data: { error: { code: 'no_bridge_token', message: 'Truv created the order but returned no token to sign in with.' } }, calls });
      const checkBody = { employee_login: login, employee_password: '***', payroll_provider_id: 'truv', product_type: product };
      const check = await traced(calls, () => c.createCheck(bridgeToken, { login, password, productType: product }), 'POST', '/v1/checks/', checkBody);
      if (check.statusCode >= 400) return envelope(res, check, calls, ids);
      res.json({ status: 201, data: { ...ids, check_id: check.data?.check_id || null, task_id: check.data?.task_id || null }, calls });
    } catch (err) { fail(res, err); }
  });

  // GET /api/sandbox/run/:orderId?user_id=   One read of where a run stands: the user's tasks and the order.
  router.get('/api/sandbox/run/:orderId', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const userId = typeof req.query.user_id === 'string' ? req.query.user_id : '';
      if (!ID.test(req.params.orderId) || !ID.test(userId)) return bad(res, 'That run could not be found.');
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      const tasks = await traced(calls, () => c.getUserTasks(userId), 'GET', `/v1/tasks/?user_id=${userId}`);
      const order = await traced(calls, () => c.getOrder(req.params.orderId), 'GET', `/v1/orders/${req.params.orderId}/`);
      res.json({
        status: 200,
        data: {
          tasks: Array.isArray(tasks.data) ? tasks.data : (tasks.data?.results || []),
          order: order.statusCode < 400 ? order.data : null,
          order_status: order.statusCode,
        },
        calls,
      });
    } catch (err) { fail(res, err); }
  });

  return router;
}
