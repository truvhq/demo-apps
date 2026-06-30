import { describe, it, expect, vi, beforeEach } from 'vitest';

let dashboardFetchHandler = () => Promise.resolve(jsonResponse(200, { keys: [] }));
vi.mock('node-fetch', () => ({
  default: (url, opts) => dashboardFetchHandler(url, opts),
}));

import { DashboardClient } from '../../server/dashboard.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function captureFetch() {
  const calls = [];
  dashboardFetchHandler = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve(jsonResponse(200, { keys: [{ client_id: 'cid_x', secret: 'sec_x', env: 'sandbox' }] }));
  };
  return calls;
}

describe('DashboardClient.fetchUserKeys', () => {
  let client;

  beforeEach(() => {
    dashboardFetchHandler = () => Promise.resolve(jsonResponse(200, { keys: [] }));
    client = new DashboardClient({ baseUrl: 'https://dashboard-backend-prod.truv.com' });
  });

  it('sends Authorization, company-id and env headers', async () => {
    const calls = captureFetch();
    await client.fetchUserKeys({ accessToken: 'tok_abc', companyId: 'co_xyz', env: 'sandbox' });

    expect(calls).toHaveLength(1);
    const { url, opts } = calls[0];
    expect(url).toBe('https://dashboard-backend-prod.truv.com/v2/user_keys/');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer tok_abc');
    expect(opts.headers['x-dashboard-company-id']).toBe('co_xyz');
    expect(opts.headers['x-dashboard-key-env']).toBe('sandbox');
    expect(opts.headers['Accept']).toBe('application/json');
  });

  it('omits x-dashboard-company-id when companyId is undefined', async () => {
    const calls = captureFetch();
    await client.fetchUserKeys({ accessToken: 'tok_abc', env: 'sandbox' });

    expect(calls[0].opts.headers['x-dashboard-company-id']).toBeUndefined();
    expect(calls[0].opts.headers['x-dashboard-key-env']).toBe('sandbox');
  });

  it('returns normalized {statusCode, data, durationMs} on a 200 response', async () => {
    dashboardFetchHandler = () => Promise.resolve(jsonResponse(200, { keys: [{ client_id: 'a' }] }));

    const result = await client.fetchUserKeys({ accessToken: 't', env: 'sandbox' });

    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ keys: [{ client_id: 'a' }] });
    expect(typeof result.durationMs).toBe('number');
  });

  it('returns the response as-is when keys array is empty', async () => {
    dashboardFetchHandler = () => Promise.resolve(jsonResponse(200, { keys: [] }));

    const result = await client.fetchUserKeys({ accessToken: 't', env: 'sandbox' });

    expect(result.statusCode).toBe(200);
    expect(result.data.keys).toEqual([]);
  });

  it('returns statusCode 401 without throwing on auth failure', async () => {
    dashboardFetchHandler = () => Promise.resolve(jsonResponse(401, { error: 'unauthorized' }));

    const result = await client.fetchUserKeys({ accessToken: 'bad', env: 'sandbox' });

    expect(result.statusCode).toBe(401);
    expect(result.data).toEqual({ error: 'unauthorized' });
  });

  it('returns statusCode 500 without throwing on server error', async () => {
    dashboardFetchHandler = () => Promise.resolve(jsonResponse(500, { error: 'server' }));

    const result = await client.fetchUserKeys({ accessToken: 't', env: 'sandbox' });

    expect(result.statusCode).toBe(500);
    expect(result.data).toEqual({ error: 'server' });
  });

  it('returns statusCode 0 and an error string when fetch rejects', async () => {
    dashboardFetchHandler = () => Promise.reject(new Error('network down'));

    const result = await client.fetchUserKeys({ accessToken: 't', env: 'sandbox' });

    expect(result.statusCode).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error).toContain('network down');
  });

  it('returns raw text when the response is not JSON', async () => {
    dashboardFetchHandler = () => Promise.resolve(new Response('not json', { status: 200 }));

    const result = await client.fetchUserKeys({ accessToken: 't', env: 'sandbox' });

    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ raw: 'not json' });
  });

  it('defaults env to sandbox when not provided', async () => {
    const calls = captureFetch();
    await client.fetchUserKeys({ accessToken: 't' });

    expect(calls[0].opts.headers['x-dashboard-key-env']).toBe('sandbox');
  });
});

describe('DashboardClient.fetchMe', () => {
  it('calls /v2/me with bearer auth and returns normalized response', async () => {
    const calls = [];
    dashboardFetchHandler = (url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve(jsonResponse(200, { id: 'user-1', default_company_id: 'co_default' }));
    };
    const client = new DashboardClient({ baseUrl: 'https://dashboard-backend-prod.truv.com' });

    const result = await client.fetchMe({ accessToken: 'tok' });

    expect(calls[0].url).toBe('https://dashboard-backend-prod.truv.com/v2/me/');
    expect(calls[0].opts.headers['Authorization']).toBe('Bearer tok');
    expect(result.statusCode).toBe(200);
    expect(result.data.default_company_id).toBe('co_default');
  });
});
