import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/hooks.js', () => ({ API_BASE: 'http://api.test' }));
const { api, isOk } = await import('../../src/sandbox/api.js');

const reply = (status, body, { json = true } = {}) => ({ status, json: async () => { if (!json) throw new Error('not json'); return body; } });
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the page\'s one way to talk to the server', () => {
  it('sends JSON to /api/sandbox and hands back the envelope as it came', async () => {
    fetch.mockResolvedValue(reply(200, { status: 201, data: { id: 'a' }, calls: [{ id: '1' }] }));
    const env = await api('POST', '/scenarios', { label: 'x' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/api/sandbox/scenarios');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ label: 'x' });
    expect(env).toMatchObject({ status: 201, data: { id: 'a' } });
    expect(isOk(env)).toBe(true);
  });

  it('sends no body for a request without one', async () => {
    fetch.mockResolvedValue(reply(200, { status: 200, data: {} }));
    await api('GET', '/scenarios');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('answers a 401 as a lost session, whatever the body says', async () => {
    fetch.mockResolvedValue(reply(401, { error: 'session_required' }));
    const env = await api('GET', '/scenarios');
    expect(env.status).toBe(401);
    expect(env.data.error.code).toBe('session_required');
    expect(isOk(env)).toBe(false);
  });

  it('turns an answer that is not an envelope into one', async () => {
    fetch.mockResolvedValue(reply(400, { error: 'bad_request', message: 'Enter a login.' }));
    const env = await api('POST', '/run', {});
    expect(env).toMatchObject({ status: 400, data: { error: { code: 'bad_request', message: 'Enter a login.' } }, calls: [] });
  });

  it('copes with a body that is not JSON at all', async () => {
    fetch.mockResolvedValue(reply(502, null, { json: false }));
    const env = await api('GET', '/scenarios');
    expect(env.status).toBe(502);
    expect(env.data.error.code).toBe('request_failed');
  });

  it('reports no answer as status 0, never as a thrown error', async () => {
    fetch.mockRejectedValue(new Error('Failed to fetch'));
    const env = await api('GET', '/scenarios');
    expect(env.status).toBe(0);
    expect(env.data.error.code).toBe('network_error');
    expect(isOk(env)).toBe(false);
  });

  it('counts only a 2xx as ok', () => {
    expect([199, 200, 204, 299, 300, 404, 0].map(status => isOk({ status }))).toEqual([false, true, true, true, false, false, false]);
  });
});
