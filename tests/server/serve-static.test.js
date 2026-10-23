import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { requireSession } from '../../server/serve-static.js';
import { sessionMiddleware } from '../../server/sessions/middleware.js';
import { createSessionStore } from '../../server/sessions/store.js';
import { SESSION_COOKIE_NAME, signSessionId } from '../../server/sessions/cookie.js';

describe('requireSession', () => {
  const run = (req) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireSession(req, res, next);
    return { res, next };
  };

  it('lets a signed-in request through', () => {
    const { res, next } = run({ truv: {} });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 401 session_required when there is no session', () => {
    const { res, next } = run({ truv: null });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_required' });
  });
});

describe('the Batching downloads, behind the real session middleware', () => {
  const secret = 'test-cookie-secret-test-cookie-secret';
  const store = createSessionStore({ idleTtlMs: 60_000 });
  const dir = mkdtempSync(join(tmpdir(), 'batching-'));
  let server, base;

  beforeAll(async () => {
    writeFileSync(join(dir, 'kit.zip'), 'zip-bytes');
    const app = express();
    app.use(cookieParser());
    app.use(sessionMiddleware({ store, cookieSecret: secret }));
    app.use('/batching', requireSession);
    app.use('/batching', express.static(dir));
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (cookie) => fetch(`${base}/batching/kit.zip`, { headers: cookie ? { Cookie: cookie } : {} });

  it('serves the file to a visitor with a valid session cookie', async () => {
    const id = store.create({ clientId: 'cid', secret: 'sec' });
    const res = await get(`${SESSION_COOKIE_NAME}=${signSessionId(id, secret)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('zip-bytes');
  });

  it('refuses a visitor with no cookie', async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'session_required' });
  });

  it('refuses a forged cookie', async () => {
    const id = store.create({ clientId: 'cid', secret: 'sec' });
    const res = await get(`${SESSION_COOKIE_NAME}=${signSessionId(id, 'a-different-secret')}`);
    expect(res.status).toBe(401);
  });

  it('refuses a cookie for a session that no longer exists', async () => {
    const res = await get(`${SESSION_COOKIE_NAME}=${signSessionId('gone', secret)}`);
    expect(res.status).toBe(401);
  });
});
