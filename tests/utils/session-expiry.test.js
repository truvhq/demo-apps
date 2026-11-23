import { describe, it, expect, vi } from 'vitest';
import { installSessionExpiryWatcher, SESSION_EXPIRED_EVENT } from '../../src/utils/sessionExpiry.js';

// Minimal window: an EventTarget carrying a scripted fetch.
function makeWindow(fetchImpl) {
  const win = new EventTarget();
  win.fetch = fetchImpl;
  return win;
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('installSessionExpiryWatcher', () => {
  it('dispatches the expiry event on a 401 session_required from /api', async () => {
    const win = makeWindow(vi.fn(async () => json(401, { error: 'session_required' })));
    installSessionExpiryWatcher(win);
    const onExpired = vi.fn();
    win.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await win.fetch('/api/orders');
    await flush();

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('also recognizes the sandbox error shape { error: { code } }', async () => {
    const win = makeWindow(vi.fn(async () => json(401, { error: { code: 'session_required' } })));
    installSessionExpiryWatcher(win);
    const onExpired = vi.fn();
    win.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await win.fetch('/api/sandbox/scenarios');
    await flush();

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves the response body readable for the caller', async () => {
    const win = makeWindow(vi.fn(async () => json(401, { error: 'session_required' })));
    installSessionExpiryWatcher(win);

    const res = await win.fetch('/api/orders');

    expect(await res.json()).toEqual({ error: 'session_required' });
  });

  it('ignores a 401 with a different error (e.g. bad credentials at sign-in)', async () => {
    const win = makeWindow(vi.fn(async () => json(401, { error: 'invalid_credentials' })));
    installSessionExpiryWatcher(win);
    const onExpired = vi.fn();
    win.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await win.fetch('/api/session', { method: 'POST' });
    await flush();

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('ignores session_required outside /api and non-401 responses', async () => {
    const win = makeWindow(vi.fn()
      .mockResolvedValueOnce(json(401, { error: 'session_required' }))
      .mockResolvedValueOnce(json(200, { error: 'session_required' })));
    installSessionExpiryWatcher(win);
    const onExpired = vi.fn();
    win.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await win.fetch('https://example.com/other');
    await win.fetch('/api/orders');
    await flush();

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not throw when a 401 body is not JSON', async () => {
    const win = makeWindow(vi.fn(async () => new Response('nope', { status: 401 })));
    installSessionExpiryWatcher(win);

    await expect(win.fetch('/api/orders')).resolves.toBeInstanceOf(Response);
    await flush();
  });

  it('wraps fetch only once however many times it is installed', async () => {
    const inner = vi.fn(async () => json(401, { error: 'session_required' }));
    const win = makeWindow(inner);
    installSessionExpiryWatcher(win);
    installSessionExpiryWatcher(win);
    const onExpired = vi.fn();
    win.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await win.fetch('/api/orders');
    await flush();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
