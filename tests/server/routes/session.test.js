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
