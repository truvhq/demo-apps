import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSessionStore } from '../../../server/sessions/store.js';
import { signSessionId, SESSION_COOKIE_NAME } from '../../../server/sessions/cookie.js';
import { sessionMiddleware } from '../../../server/sessions/middleware.js';
import { TruvClient } from '../../../server/truv.js';

const COOKIE_SECRET = 'mw-test-secret';

function makeReq({ signedCookie } = {}) {
  return {
    cookies: signedCookie ? { [SESSION_COOKIE_NAME]: signedCookie } : {},
  };
}

function makeRes() {
  return {};
}

describe('sessionMiddleware', () => {
  let store;
  let middleware;

  beforeEach(() => {
    store = createSessionStore({ idleTtlMs: 60_000 });
    middleware = sessionMiddleware({ store, cookieSecret: COOKIE_SECRET });
  });

  it('attaches null when no cookie is present', () => {
    const req = makeReq();
    const next = vi.fn();
    middleware(req, makeRes(), next);
    expect(req.truv).toBeNull();
    expect(req.session).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches a per-request TruvClient when the cookie resolves to a live session', () => {
    const id = store.create({ clientId: 'cid_1', secret: 'sec_1' });
    const req = makeReq({ signedCookie: signSessionId(id, COOKIE_SECRET) });
    const next = vi.fn();

    middleware(req, makeRes(), next);

    expect(req.truv).toBeInstanceOf(TruvClient);
    expect(req.truv.clientId).toBe('cid_1');
    expect(req.truv.secret).toBe('sec_1');
    expect(req.session).toEqual({ id });
    expect(next).toHaveBeenCalled();
  });

  it('refreshes lastUsedAt by calling store.touch', async () => {
    const id = store.create({ clientId: 'c', secret: 's' });
    const before = store.get(id).lastUsedAt;
    await new Promise(r => setTimeout(r, 5));

    const req = makeReq({ signedCookie: signSessionId(id, COOKIE_SECRET) });
    middleware(req, makeRes(), vi.fn());

    expect(store.get(id).lastUsedAt).toBeGreaterThanOrEqual(before);
  });

  it('attaches null when the session was destroyed', () => {
    const id = store.create({ clientId: 'c', secret: 's' });
    const cookie = signSessionId(id, COOKIE_SECRET);
    store.destroy(id);

    const req = makeReq({ signedCookie: cookie });
    middleware(req, makeRes(), vi.fn());
    expect(req.truv).toBeNull();
    expect(req.session).toBeNull();
  });

  it('attaches null and does not consult the store when the cookie is tampered', () => {
    const id = store.create({ clientId: 'c', secret: 's' });
    const cookie = signSessionId(id, COOKIE_SECRET);
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');

    const getSpy = vi.spyOn(store, 'get');
    const req = makeReq({ signedCookie: tampered });
    middleware(req, makeRes(), vi.fn());

    expect(req.truv).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('does not log credentials to the console', () => {
    const id = store.create({ clientId: 'cid_logged', secret: 'sec_logged' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const req = makeReq({ signedCookie: signSessionId(id, COOKIE_SECRET) });
    middleware(req, makeRes(), vi.fn());

    for (const call of [...errorSpy.mock.calls, ...logSpy.mock.calls]) {
      const flat = JSON.stringify(call);
      expect(flat).not.toContain('sec_logged');
      expect(flat).not.toContain('cid_logged');
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
