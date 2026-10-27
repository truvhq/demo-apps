import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.mock('node-fetch', () => ({ default: (...args) => fetchMock(...args) }));

const { TruvClient } = await import('../../server/truv.js');

const reply = (status, body) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)), headers: { get: () => null } });
const client = () => new TruvClient({ clientId: 'id', secret: 'secret', apiUrl: 'https://api.test/v1/' });

beforeEach(() => { fetchMock.mockReset(); vi.spyOn(console, 'log').mockImplementation(() => {}); });

describe('TruvClient.sandbox', () => {
  it('puts the path under /v1/sandbox/ and sends the API keys', async () => {
    fetchMock.mockResolvedValue(reply(200, { results: [] }));
    await client().sandbox('GET', 'scenarios/?enabled=true');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/sandbox/scenarios/?enabled=true');
    expect(opts.method).toBe('GET');
    expect(opts.headers['X-Access-Client-Id']).toBe('id');
    expect(opts.body).toBeUndefined();
  });

  it('sends a JSON body when given one', async () => {
    fetchMock.mockResolvedValue(reply(201, { id: 'a' }));
    const r = await client().sandbox('POST', 'scenarios/', { label: 'x' });
    expect(fetchMock.mock.calls[0][1].body).toBe('{"label":"x"}');
    expect(r.statusCode).toBe(201);
    expect(r.requestBody).toEqual({ label: 'x' });
  });

  it('reports a 204 as an empty body, not an error', async () => {
    fetchMock.mockResolvedValue(reply(204));
    const r = await client().sandbox('DELETE', 'scenarios/abc/');
    expect(r.statusCode).toBe(204);
    expect(r.data).toEqual({});
  });

  it('hands back the production-key refusal untouched', async () => {
    fetchMock.mockResolvedValue(reply(403, { error: { code: 'env_not_sandbox' } }));
    const r = await client().sandbox('GET', 'scenarios/');
    expect(r.statusCode).toBe(403);
    expect(r.data.error.code).toBe('env_not_sandbox');
  });
});

describe('TruvClient.createCheck', () => {
  it('signs in with the bridge token and not the API keys', async () => {
    fetchMock.mockResolvedValue(reply(201, { check_id: 'c1' }));
    await client().createCheck('tok', { login: 'goodlogin', password: 'goodpassword', productType: 'employment' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/checks/');
    expect(opts.headers['X-Bridge-Token']).toBe('tok');
    expect(opts.headers['X-Access-Secret']).toBeUndefined();
    expect(JSON.parse(opts.body)).toEqual({ employee_login: 'goodlogin', employee_password: 'goodpassword', payroll_provider_id: 'truv', product_type: 'employment' });
  });

  it('defaults to income, and leaves the shared headers alone for the next call', async () => {
    const c = client();
    fetchMock.mockResolvedValue(reply(201, {}));
    await c.createCheck('tok', { login: 'a', password: 'b' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).product_type).toBe('income');
    await c.sandbox('GET', 'documents/');
    expect(fetchMock.mock.calls[1][1].headers['X-Bridge-Token']).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers['X-Access-Secret']).toBe('secret');
  });
});
