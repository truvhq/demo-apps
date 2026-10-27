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

import { createHash } from 'crypto';
import { Router } from 'express';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PAGES = 20;          // 100 scenarios per account by default, so this is generous
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// The size of a base64 string once decoded, to the byte.
const decodedBytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export default function sandboxRoutes({ truv, db }) {
  const router = Router();

  // An order without the tokens that sign in to it: those belong in the request that uses them, not in a trace or a download.
  const scrub = (o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    const out = { ...o };
    delete out.bridge_token;
    if (Array.isArray(out.employers)) out.employers = out.employers.map(e => (e && typeof e === 'object' ? (({ bridge_token, ...rest }) => rest)(e) : e));
    return out;
  };

  // One Truv request, recorded. Returns { result, call }.
  async function traced(calls, fn, method, endpoint, requestBody) {
    const result = await fn();
    // A network failure carries the upstream address and system text; the page gets a fixed line.
    if (result.statusCode === 502 && result.data?.error === 'network_error') result.data = { error: 'network_error', message: 'The request could not reach Truv.' };
    const call = {
      id: `${Date.now()}-${calls.length}`,
      method,
      endpoint,
      status_code: result.statusCode,
      request_body: requestBody ?? result.requestBody ?? null,
      response_body: result.statusCode === 204 ? null : scrub(result.data),
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
  // Hosted mode builds a new client for every request, so the answer is remembered per set of keys (a hash, not
  // the keys), not per client object.
  const sandboxKeys = new Map();
  const keyId = (c) => createHash('sha256').update(`${c.clientId}\u0000${c.secret}`).digest('hex');
  async function sandboxKeyOnly(c, calls) {
    const id = keyId(c);
    if (sandboxKeys.get(id) > Date.now() - 10 * 60 * 1000) return null;
    const r = await traced(calls, () => c.sandbox('GET', 'scenarios/'), 'GET', '/v1/sandbox/scenarios/');
    if (r.statusCode === 200) {
      if (sandboxKeys.size >= 500) sandboxKeys.delete(sandboxKeys.keys().next().value);
      sandboxKeys.set(id, Date.now());
      // The check only matters for its status; keep the account's scenarios out of the trace.
      const call = calls.at(-1);
      if (call) call.response_body = { checked: 'This is a sandbox key.' };
      return null;
    }
    return r;
  }

  const bad = (res, message) => res.status(400).json({ error: 'bad_request', message });
  const envelope = (res, result, calls, extra = {}) => res.json({ status: result.statusCode, data: result.data, calls, ...extra });
  const fail = (res, err) => { console.error(err); res.status(500).json({ error: 'internal_error', message: 'The request could not be completed.' }); };
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  // A scenario is a small object. An empty body is what Express leaves when the content type was not JSON.
  const BODY_LIMIT = 1_500_000;
  const badBody = (req, what) => (!isObject(req.body) || !Object.keys(req.body).length ? `Send ${what} as a JSON object.` : (req.rawBody?.length ?? 0) > BODY_LIMIT ? 'That is over the 1 MB limit for a scenario.' : null);

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

  // GET /api/sandbox/scenarios/:id
  router.get('/api/sandbox/scenarios/:id', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      if (!ID.test(req.params.id)) return bad(res, 'That is not a scenario id.');
      const calls = [];
      const r = await traced(calls, () => c.sandbox('GET', `scenarios/${req.params.id}/`), 'GET', `/v1/sandbox/scenarios/${req.params.id}/`);
      envelope(res, r, calls);
    } catch (err) { fail(res, err); }
  });

  // GET /api/sandbox/whoami   Which account the page is talking to: the last four characters of the client id, never the secret.
  router.get('/api/sandbox/whoami', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      const id = String(c.clientId || '');
      res.json({ status: 200, data: { environment: 'sandbox', key_hint: id ? `\u2026${id.slice(-4)}` : '' }, calls });
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/scenarios
  router.post('/api/sandbox/scenarios', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const why = badBody(req, 'the scenario'); if (why) return bad(res, why);
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
      const why = badBody(req, 'the changes'); if (why) return bad(res, why);
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
      const why = badBody(req, 'the login to check'); if (why) return bad(res, why);
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

  const PRODUCTS = ['income', 'employment', 'assets'];
  const HEADLESS_PRODUCTS = ['income', 'employment'];
  const MAX_LOGINS = 3;

  // POST /api/sandbox/run   { mode: 'headless' | 'widget', product, login?, password?, logins?: [{ login, password }] }
  //   headless: creates a sandbox order, then signs in to the Truv test payroll provider with the login,
  //             the way Bridge would. Income and employment only. A login that asks for an MFA code
  //             cannot be answered without the widget, so the page sends those to widget mode.
  //   widget:   creates the order and returns its bridge token, for opening Bridge as a dialog.
  //   logins:   headless only, one to three. The order gets one employer per login and only the first is signed in to
  //             here: Truv refuses a second check while the first is still running, so the page starts each later one
  //             with POST /api/sandbox/run/:orderId/check once the one before it has finished. It replaces login and password.
  // Returns the ids to read the run back with.
  router.post('/api/sandbox/run', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const { mode = 'headless', product = 'income', login, password, logins } = req.body || {};
      if (!['headless', 'widget'].includes(mode)) return bad(res, 'Choose headless or widget.');
      if (!PRODUCTS.includes(product)) return bad(res, 'That product cannot be tried here.');
      if (mode === 'headless') {
        if (!HEADLESS_PRODUCTS.includes(product)) return bad(res, 'Running a login here covers income and employment. Open the others in Bridge.');
        if (logins === undefined) {
          if (typeof login !== 'string' || !login) return bad(res, 'Enter a login.');
          if (typeof password !== 'string' || !password) return bad(res, 'Enter a password.');
        } else {
          if (!Array.isArray(logins) || !logins.length) return bad(res, 'Enter a login.');
          if (logins.length > MAX_LOGINS) return bad(res, `Use up to ${MAX_LOGINS} logins in one order.`);
          for (const l of logins) {
            if (!isObject(l) || typeof l.login !== 'string' || !l.login) return bad(res, 'Enter a login.');
            if (typeof l.password !== 'string' || !l.password) return bad(res, 'Enter a password.');
          }
          if (new Set(logins.map(l => l.login)).size !== logins.length) return bad(res, 'Each login in an order must be different.');
        }
      }
      const attempts = mode === 'headless' ? (logins === undefined ? [{ login, password }] : logins.map(l => ({ login: l.login, password: l.password }))) : [];
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      const several = attempts.length > 1;
      const names = attempts.map((_, i) => `Sandbox login ${i + 1}`);
      const order = await traced(calls, () => c.createOrder({ product_type: product, first_name: 'Test', last_name: 'Login', ...(several ? { employers: names.map(company_name => ({ company_name })) } : {}) }), 'POST', '/v1/orders/');
      if (order.statusCode >= 400) return envelope(res, order, calls);
      const ids = { order_id: order.data?.id, user_id: order.data?.user_id };
      db?.recordSessionUser(req.session?.id, ids.user_id);
      if (mode === 'widget') {
        if (!order.data?.bridge_token) return res.json({ status: 502, data: { error: { code: 'no_bridge_token', message: 'Truv created the order but returned no token to open Bridge with.' } }, calls });
        return res.json({ status: 201, data: { ...ids, bridge_token: order.data.bridge_token }, calls });
      }
      // Truv does not list a created order's employers in the order they were made, so each is found by its name.
      const byName = (name) => order.data?.employers?.find(e => e?.company_name === name)?.bridge_token;
      const tokens = attempts.map((_, i) => (several ? byName(names[i]) : (order.data?.employers?.[0]?.bridge_token || order.data?.bridge_token)) || null);
      if (tokens.some(t => !t)) return res.json({ status: 502, data: { error: { code: 'no_bridge_token', message: 'Truv created the order but returned no token to sign in with.' } }, calls });
      const employers = attempts.map((a, i) => ({ company_name: several ? names[i] : (order.data?.employers?.[0]?.company_name || null), login: a.login }));
      const { login: l, password: pw } = attempts[0];
      const checkBody = { employee_login: l, employee_password: '***', payroll_provider_id: 'truv', product_type: product };
      const check = await traced(calls, () => c.createCheck(tokens[0], { login: l, password: pw, productType: product }), 'POST', '/v1/checks/', checkBody);
      if (check.statusCode >= 400) return envelope(res, check, calls, { ...ids, employers });
      res.json({ status: 201, data: { ...ids, check_id: check.data?.check_id || null, task_id: check.data?.task_id || null, employers }, calls });
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
          user_id: userId,
          tasks: Array.isArray(tasks.data) ? tasks.data : (tasks.data?.results || []),
          order: order.statusCode < 400 ? scrub(order.data) : null,
          order_status: order.statusCode,
        },
        calls,
      });
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/run/:orderId/check   { user_id, index, login, password, product }
  // Signs in to the order's next employer (index 1 or 2). Call it once the previous task has finished.
  router.post('/api/sandbox/run/:orderId/check', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const { user_id: userId, index, login, password, product } = isObject(req.body) ? req.body : {};
      if (!ID.test(req.params.orderId) || typeof userId !== 'string' || !ID.test(userId)) return bad(res, 'That run could not be found.');
      if (!HEADLESS_PRODUCTS.includes(product)) return bad(res, 'Running a login here covers income and employment. Open the others in Bridge.');
      if (!Number.isInteger(index) || index < 1 || index >= MAX_LOGINS) return bad(res, 'Choose which login of the order to run.');
      if (typeof login !== 'string' || !login) return bad(res, 'Enter a login.');
      if (typeof password !== 'string' || !password) return bad(res, 'Enter a password.');
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      const order = await traced(calls, () => c.getOrder(req.params.orderId), 'GET', `/v1/orders/${req.params.orderId}/`);
      if (order.statusCode >= 400) return envelope(res, order, calls);
      const token = order.data?.employers?.find(e => e?.company_name === `Sandbox login ${index + 1}`)?.bridge_token;
      if (!token) return bad(res, 'That order has no such login to run.');
      const checkBody = { employee_login: login, employee_password: '***', payroll_provider_id: 'truv', product_type: product };
      const check = await traced(calls, () => c.createCheck(token, { login, password, productType: product }), 'POST', '/v1/checks/', checkBody);
      if (check.statusCode >= 400) return envelope(res, check, calls);
      res.json({ status: 201, data: { order_id: req.params.orderId, user_id: userId, index, check_id: check.data?.check_id || null, task_id: check.data?.task_id || null }, calls });
    } catch (err) { fail(res, err); }
  });

  // POST /api/sandbox/run/:orderId/refresh   { user_id, product }
  // Asks Truv to refresh the connections the order made. Truv only does that for connections finished in Bridge,
  // and says so when it cannot; its answer is passed on as it is.
  router.post('/api/sandbox/run/:orderId/refresh', async (req, res) => {
    try {
      const c = client(req, res); if (!c) return;
      const { user_id: userId, product } = isObject(req.body) ? req.body : {};
      if (!ID.test(req.params.orderId) || typeof userId !== 'string' || !ID.test(userId)) return bad(res, 'That run could not be found.');
      if (!HEADLESS_PRODUCTS.includes(product)) return bad(res, 'Choose income or employment.');
      const calls = [];
      const refused = await sandboxKeyOnly(c, calls);
      if (refused) return envelope(res, refused, calls);
      const body = { products: [product] };
      const r = await traced(calls, () => c.createRefreshOrder(req.params.orderId, body), 'POST', `/v1/orders/${req.params.orderId}/`, body);
      if (r.statusCode >= 400) return envelope(res, r, calls);
      // Only the user Truv names is recorded as this session's: the one in the request is not checked against the order.
      if (r.data?.user_id) db?.recordSessionUser(req.session?.id, r.data.user_id);
      res.json({ status: r.statusCode, data: { order_id: r.data?.id, user_id: r.data?.user_id || userId, product }, calls });
    } catch (err) { fail(res, err); }
  });

  return router;
}
