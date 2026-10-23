import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { requireSession, GATED_PATHS } from '../../server/serve-static.js';
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

describe('the guides\' files, behind the real session middleware', () => {
  const secret = 'test-cookie-secret-test-cookie-secret';
  const store = createSessionStore({ idleTtlMs: 60_000 });
  const dir = mkdtempSync(join(tmpdir(), 'guides-'));
  // One real file under every gated folder, plus one outside them.
  const files = ['/batching/kit.zip', '/guides/embedded-orders/nine-rules.mp4', '/guides/embedded-orders/img/acme-do.png'];
  let server, base;

  it('gates the Batching downloads and the Embedded Orders media', () => {
    expect(GATED_PATHS).toEqual(['/batching', '/guides']);
  });

  beforeAll(async () => {
    for (const f of [...files, '/brand/logo.png']) {
      mkdirSync(join(dir, f.slice(0, f.lastIndexOf('/'))), { recursive: true });
      writeFileSync(join(dir, f), 'bytes');
    }
    const app = express();
    app.use(cookieParser());
    app.use(sessionMiddleware({ store, cookieSecret: secret }));
    app.use(GATED_PATHS, requireSession);
    app.use(express.static(dir));
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

  it('serves each file to a visitor with a valid session cookie', async () => {
    const id = store.create({ clientId: 'cid', secret: 'sec' });
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionId(id, secret)}`;
    for (const f of files) {
      const res = await get(f, cookie);
      expect(res.status, f).toBe(200);
      expect(await res.text()).toBe('bytes');
    }
  });

  it('serves part of a file when asked, so a six-second clip does not pull the whole video', async () => {
    const id = store.create({ clientId: 'cid', secret: 'sec' });
    const res = await fetch(`${base}/guides/embedded-orders/nine-rules.mp4`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${signSessionId(id, secret)}`, Range: 'bytes=0-1' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-1/5');
    expect(await res.text()).toBe('by');
  });

  it('refuses a visitor with no cookie, on every gated folder', async () => {
    for (const f of files) {
      const res = await get(f);
      expect(res.status, f).toBe(401);
      expect(await res.json()).toEqual({ error: 'session_required' });
    }
  });

  it('refuses a forged cookie and a cookie for a session that no longer exists', async () => {
    const id = store.create({ clientId: 'cid', secret: 'sec' });
    for (const cookie of [`${SESSION_COOKIE_NAME}=${signSessionId(id, 'a-different-secret')}`, `${SESSION_COOKIE_NAME}=${signSessionId('gone', secret)}`]) {
      for (const f of files) expect((await get(f, cookie)).status, f).toBe(401);
    }
  });

  it('leaves the sign-in screen\'s own files public', async () => {
    expect((await get('/brand/logo.png')).status).toBe(200);
  });
});
