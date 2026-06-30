import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';

// node-fetch is imported by server/truv.js to make outbound API calls.
// We mock the module so the listWebhooks probe inside POST /api/session
// returns whatever the test sets. The session route constructs its own
// TruvClient internally, so this is the only seam available.
let truvFetchHandler = () => Promise.resolve(jsonResponse(200, { results: [] }));
vi.mock('node-fetch', () => ({
  default: (url, opts) => truvFetchHandler(url, opts),
}));

import { createSessionStore } from '../../../server/sessions/store.js';
import { sessionMiddleware } from '../../../server/sessions/middleware.js';
import { SESSION_COOKIE_NAME, signSessionId, verifySessionCookie } from '../../../server/sessions/cookie.js';
import sessionRoutes from '../../../server/routes/session.js';

const COOKIE_SECRET = 'route-test-secret';

function startServer({
  storeOpts = { idleTtlMs: 60_000 },
  onSessionCreated,
  onSessionDestroyed,
  dashboardClient,
  ssoEnabled,
  rateLimitMax = 100,
  rateLimitWindowMs = 60_000,
} = {}) {
  const store = createSessionStore(storeOpts);
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware({ store, cookieSecret: COOKIE_SECRET }));
  app.use(sessionRoutes({
    store,
    cookieSecret: COOKIE_SECRET,
    idleTtlMs: storeOpts.idleTtlMs,
    onSessionCreated,
    onSessionDestroyed,
    dashboardClient,
    ssoEnabled,
    rateLimitMax,
    rateLimitWindowMs,
  }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, store });
    });
    server.on('error', reject);
  });
}

const closeServer = (server) => new Promise(r => server.close(r));

function mockFetch(handler) {
  truvFetchHandler = handler;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const m = setCookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

describe('POST /api/session', () => {
  let fetchSpy;
  let ctx;

  beforeEach(async () => {
    fetchSpy?.mockRestore();
    if (ctx) await closeServer(ctx.server);
    ctx = await startServer();
  });

  it('creates a session and sets the cookie when credentials are valid', async () => {
    fetchSpy = mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');

    const signed = extractSessionCookie(setCookie);
    const sid = verifySessionCookie(signed, COOKIE_SECRET);
    expect(sid).toBeTruthy();
    expect(ctx.store.get(sid)).toMatchObject({ clientId: 'cid_abcdef', secret: 'sec_abcdef' });
  });

  it('returns 401 invalid_credentials when Truv probe returns 401', async () => {
    fetchSpy = mockFetch(() => Promise.resolve(jsonResponse(401, { error: 'unauthorized' })));

    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_baduser', secret: 'sec_baduser' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(ctx.store.all()).toHaveLength(0);
  });

  it('returns 502 truv_unreachable when probe returns 500', async () => {
    fetchSpy = mockFetch(() => Promise.resolve(jsonResponse(500, { error: 'server' })));

    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_okok', secret: 'sec_okok' }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'truv_unreachable' });
    expect(ctx.store.all()).toHaveLength(0);
  });

  it('returns 502 when fetch throws (network failure)', async () => {
    fetchSpy = mockFetch(() => Promise.reject(new Error('network down')));

    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_okok', secret: 'sec_okok' }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'truv_unreachable' });
    expect(ctx.store.all()).toHaveLength(0);
  });

  it('returns 400 invalid_input when client_id is missing', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'sec_abcdef' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_input' });
  });

  it('returns 400 when client_id is an empty string', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: '', secret: 'sec_abcdef' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when secret exceeds the 256-char ceiling', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'x'.repeat(257) }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when fields are non-string', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 12345, secret: ['no'] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 502 webhook_registration_failed when onSessionCreated throws, and rolls back the session', async () => {
    const onCreated = vi.fn(() => { throw new Error('webhook 409'); });
    if (ctx) await closeServer(ctx.server);
    ctx = await startServer({ onSessionCreated: onCreated });

    fetchSpy?.mockRestore();
    fetchSpy = mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    const res = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'webhook_registration_failed' });
    expect(ctx.store.all()).toHaveLength(0);
  });

  it('does not log the submitted secret to console', async () => {
    fetchSpy = mockFetch(() => Promise.resolve(jsonResponse(401, { error: 'unauthorized' })));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_logspy_test', secret: 'sec_logspy_test' }),
    });

    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      const flat = JSON.stringify(call);
      expect(flat).not.toContain('sec_logspy_test');
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('POST /api/session — rate limiting', () => {
  it('returns 429 once max attempts within the window are exceeded', async () => {
    const ctx = await startServer({ rateLimitMax: 2, rateLimitWindowMs: 60_000 });
    mockFetch(() => Promise.resolve(jsonResponse(401, {})));

    try {
      const post = () => fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });

      const a = await post();
      const b = await post();
      const c = await post();
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(c.status).toBe(429);
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });
});

describe('DELETE /api/session', () => {
  it('destroys the session and clears the cookie', async () => {
    const ctx = await startServer();
    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    try {
      const create = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });
      const setCookie = create.headers.get('set-cookie');
      const signed = extractSessionCookie(setCookie);
      const sid = verifySessionCookie(signed, COOKIE_SECRET);

      const res = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}` },
      });

      expect(res.status).toBe(204);
      const clearCookie = res.headers.get('set-cookie');
      expect(clearCookie).toContain(SESSION_COOKIE_NAME);
      // Cookie clearance shows up either as an empty value or an expires-in-the-past directive
      expect(clearCookie.toLowerCase()).toMatch(/(expires=thu, 01 jan 1970|max-age=0|=;)/);
      expect(ctx.store.get(sid)).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });

  it('returns 204 even when no session cookie is present', async () => {
    const ctx = await startServer();
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session`, { method: 'DELETE' });
      expect(res.status).toBe(204);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('calls onSessionDestroyed with the record when present', async () => {
    const onDestroyed = vi.fn();
    const ctx = await startServer({ onSessionDestroyed: onDestroyed });
    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    try {
      const create = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });
      const signed = extractSessionCookie(create.headers.get('set-cookie'));

      await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}` },
      });

      expect(onDestroyed).toHaveBeenCalledTimes(1);
      const arg = onDestroyed.mock.calls[0][0];
      expect(arg.record).toMatchObject({ clientId: 'cid_abcdef', secret: 'sec_abcdef' });
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });
});

describe('GET /api/session/status', () => {
  it('reports authenticated:false without a cookie', async () => {
    const ctx = await startServer();
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/status`);
      expect(await res.json()).toEqual({ authenticated: false });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('reports authenticated:true after a successful create', async () => {
    const ctx = await startServer();
    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    try {
      const create = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });
      const signed = extractSessionCookie(create.headers.get('set-cookie'));

      const res = await fetch(`${ctx.baseUrl}/api/session/status`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}` },
      });
      expect(await res.json()).toEqual({ authenticated: true });
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });
});

describe('POST /api/session — integration with middleware', () => {
  it('subsequent requests with the cookie populate req.truv via the middleware', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(sessionMiddleware({ store, cookieSecret: COOKIE_SECRET }));
    app.use(sessionRoutes({ store, cookieSecret: COOKIE_SECRET, idleTtlMs: 60_000, rateLimitMax: 100 }));
    app.get('/api/test/echo', (req, res) => {
      res.json({ has_truv: req.truv !== null, has_session: req.session !== null });
    });

    const server = await new Promise((resolve) => {
      const s = http.createServer(app);
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));

    try {
      const create = await fetch(`${baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });
      const signed = extractSessionCookie(create.headers.get('set-cookie'));

      const res = await fetch(`${baseUrl}/api/test/echo`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}` },
      });
      expect(await res.json()).toEqual({ has_truv: true, has_session: true });
    } finally {
      vi.restoreAllMocks();
      await closeServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/session/sso
// ---------------------------------------------------------------------------

// Wrap key objects in the real dashboard /v2/user_keys/ response shape, which
// is keyed by environment with an active_keys[] array (not a flat keys[]).
// The secret is carried as `access_key`.
function userKeysResponse(activeKeys, env = 'sandbox') {
  return { [env]: { title: env, can_create_new_key: true, active_keys: activeKeys } };
}

function makeMockDashboardClient(overrides = {}) {
  return {
    fetchUserKeys: vi.fn().mockResolvedValue({
      statusCode: 200,
      data: userKeysResponse([{ client_id: 'sso_cid_abcdef', access_key: 'sso_sec_abcdef' }]),
      durationMs: 12,
      ...overrides.fetchUserKeys,
    }),
    fetchMe: vi.fn().mockResolvedValue({
      statusCode: 200,
      data: { id: 'user_1', default_company_id: 'co_default' },
      durationMs: 8,
      ...overrides.fetchMe,
    }),
  };
}

const VALID_TOKEN = 'eyJ' + 'a'.repeat(40); // 43 chars, looks like a real JWT prefix

describe('POST /api/session/sso', () => {
  let ctx;

  it('returns 503 sso_disabled when SSO is disabled or no dashboard client', async () => {
    ctx = await startServer({ ssoEnabled: false });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'sso_disabled' });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 503 when no dashboardClient is provided even if ssoEnabled defaults to true', async () => {
    ctx = await startServer();
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(503);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('creates a session and sets the cookie on a successful dashboard call', async () => {
    const dashboardClient = makeMockDashboardClient();
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(dashboardClient.fetchUserKeys).toHaveBeenCalledWith({ accessToken: VALID_TOKEN, env: 'sandbox' });

      const signed = extractSessionCookie(res.headers.get('set-cookie'));
      const sid = verifySessionCookie(signed, COOKIE_SECRET);
      expect(ctx.store.get(sid)).toMatchObject({
        clientId: 'sso_cid_abcdef',
        secret: 'sso_sec_abcdef',
      });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 400 invalid_input when access_token is missing', async () => {
    ctx = await startServer({ dashboardClient: makeMockDashboardClient() });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_input' });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 400 when access_token is too short', async () => {
    ctx = await startServer({ dashboardClient: makeMockDashboardClient() });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'short' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 400 when access_token exceeds 4096 chars', async () => {
    ctx = await startServer({ dashboardClient: makeMockDashboardClient() });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'x'.repeat(4097) }),
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 401 invalid_credentials when dashboard returns 401', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: { statusCode: 401, data: { error: 'unauthorized' } },
    });
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_credentials' });
      expect(ctx.store.all()).toHaveLength(0);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 502 truv_unreachable when dashboard returns 500', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: { statusCode: 500, data: { error: 'server' } },
    });
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'truv_unreachable' });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 502 when fetch fails at the network layer (statusCode 0)', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: { statusCode: 0, data: null, error: 'network' },
    });
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(502);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 409 no_keys_available when dashboard returns no active sandbox keys', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: { statusCode: 200, data: userKeysResponse([]) },
    });
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('no_keys_available');
      expect(body.dashboard_url).toMatch(/dashboard\.truv\.com/);
      expect(ctx.store.all()).toHaveLength(0);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('rolls back the session and returns 502 when onSessionCreated throws', async () => {
    const dashboardClient = makeMockDashboardClient();
    const onCreated = vi.fn(() => { throw new Error('webhook fail'); });
    ctx = await startServer({ dashboardClient, onSessionCreated: onCreated });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'webhook_registration_failed' });
      expect(ctx.store.all()).toHaveLength(0);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('picks the first key when dashboard returns multiple', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: {
        statusCode: 200,
        data: userKeysResponse([
          { client_id: 'first_cid_abc', access_key: 'first_sec_abc' },
          { client_id: 'second_cid_xyz', access_key: 'second_sec_xyz' },
        ]),
      },
    });
    ctx = await startServer({ dashboardClient });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(200);
      const signed = extractSessionCookie(res.headers.get('set-cookie'));
      const sid = verifySessionCookie(signed, COOKIE_SECRET);
      expect(ctx.store.get(sid).clientId).toBe('first_cid_abc');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 502 when the returned key object has the wrong shape', async () => {
    const dashboardClient = makeMockDashboardClient({
      fetchUserKeys: {
        statusCode: 200,
        data: userKeysResponse([{ id: 'unexpected' }]),
      },
    });
    ctx = await startServer({ dashboardClient });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      expect(res.status).toBe(502);
    } finally {
      errSpy.mockRestore();
      await closeServer(ctx.server);
    }
  });

  it('does not log the access_token, returned client_id, or secret', async () => {
    const dashboardClient = makeMockDashboardClient();
    ctx = await startServer({ dashboardClient });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });

      const allLogs = [...logSpy.mock.calls, ...errSpy.mock.calls].map(args => JSON.stringify(args)).join(' ');
      expect(allLogs).not.toContain(VALID_TOKEN);
      expect(allLogs).not.toContain('sso_cid_abcdef');
      expect(allLogs).not.toContain('sso_sec_abcdef');
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      await closeServer(ctx.server);
    }
  });

  it('subsequent requests with the cookie populate req.truv via the middleware', async () => {
    const dashboardClient = makeMockDashboardClient();
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(sessionMiddleware({ store, cookieSecret: COOKIE_SECRET }));
    app.use(sessionRoutes({ store, cookieSecret: COOKIE_SECRET, idleTtlMs: 60_000, rateLimitMax: 100, dashboardClient }));
    app.get('/api/test/echo', (req, res) => {
      res.json({ has_truv: req.truv !== null, has_session: req.session !== null });
    });

    const server = await new Promise((resolve) => {
      const s = http.createServer(app);
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const create = await fetch(`${baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      const signed = extractSessionCookie(create.headers.get('set-cookie'));

      const res = await fetch(`${baseUrl}/api/test/echo`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}` },
      });
      expect(await res.json()).toEqual({ has_truv: true, has_session: true });
    } finally {
      await closeServer(server);
    }
  });
});

describe('PUT /api/session/keys — in-session override', () => {
  it('returns 401 without an existing session', async () => {
    const ctx = await startServer();
    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_newvalue', secret: 'sec_newvalue' }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'session_required' });
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('swaps credentials in place when a session exists and new keys are valid', async () => {
    const onCreated = vi.fn().mockResolvedValue(true);
    const onDestroyed = vi.fn().mockResolvedValue(true);
    const ctx = await startServer({ onSessionCreated: onCreated, onSessionDestroyed: onDestroyed });

    // Create a session via paste
    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));
    const create = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_oldvalue', secret: 'sec_oldvalue' }),
    });
    const signed = extractSessionCookie(create.headers.get('set-cookie'));
    const sid = verifySessionCookie(signed, COOKIE_SECRET);
    ctx.store.setWebhookId(sid, 'wh_old');

    try {
      // Override
      const res = await fetch(`${ctx.baseUrl}/api/session/keys`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`,
        },
        body: JSON.stringify({ client_id: 'cid_newvalue', secret: 'sec_newvalue' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      // Cookie/session id is preserved across the swap
      const record = ctx.store.get(sid);
      expect(record).toBeDefined();
      expect(record.clientId).toBe('cid_newvalue');
      expect(record.secret).toBe('sec_newvalue');

      // Old webhook teardown fired before new credentials were stored
      expect(onDestroyed).toHaveBeenCalled();
      // New webhook registration fired with the new client
      expect(onCreated).toHaveBeenCalledTimes(2); // once at create, once at override
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });

  it('returns 401 invalid_credentials and does not touch the session when probe fails', async () => {
    const onDestroyed = vi.fn();
    const ctx = await startServer({ onSessionDestroyed: onDestroyed });

    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));
    const create = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_oldvalue', secret: 'sec_oldvalue' }),
    });
    const signed = extractSessionCookie(create.headers.get('set-cookie'));
    const sid = verifySessionCookie(signed, COOKIE_SECRET);

    // Probe rejects the new creds
    mockFetch(() => Promise.resolve(jsonResponse(401, {})));

    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/keys`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`,
        },
        body: JSON.stringify({ client_id: 'cid_badnewvalue', secret: 'sec_badnewvalue' }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_credentials' });

      // Old credentials still in place — no destructive change happened
      const record = ctx.store.get(sid);
      expect(record.clientId).toBe('cid_oldvalue');
      expect(record.secret).toBe('sec_oldvalue');
      expect(onDestroyed).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });

  it('returns 400 on bad input', async () => {
    const ctx = await startServer();
    mockFetch(() => Promise.resolve(jsonResponse(200, { results: [] })));
    const create = await fetch(`${ctx.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'cid_oldvalue', secret: 'sec_oldvalue' }),
    });
    const signed = extractSessionCookie(create.headers.get('set-cookie'));

    try {
      const res = await fetch(`${ctx.baseUrl}/api/session/keys`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`,
        },
        body: JSON.stringify({ client_id: '', secret: 'sec_newvalue' }),
      });
      expect(res.status).toBe(400);
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });
});

describe('POST /api/session/sso — shared rate limit with paste', () => {
  it('429 fires when paste and SSO together exceed the limit', async () => {
    const dashboardClient = makeMockDashboardClient();
    const ctx = await startServer({ dashboardClient, rateLimitMax: 2, rateLimitWindowMs: 60_000 });
    mockFetch(() => Promise.resolve(jsonResponse(401, {})));

    try {
      // First attempt: paste (consumes 1 of 2)
      const a = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });
      // Second attempt: sso (consumes 2 of 2)
      const b = await fetch(`${ctx.baseUrl}/api/session/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: VALID_TOKEN }),
      });
      // Third attempt: another paste — should 429
      const c = await fetch(`${ctx.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid_abcdef', secret: 'sec_abcdef' }),
      });

      expect(a.status).toBe(401);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
    } finally {
      vi.restoreAllMocks();
      await closeServer(ctx.server);
    }
  });
});
