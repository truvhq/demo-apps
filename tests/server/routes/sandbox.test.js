import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import sandboxRoutes from '../../../server/routes/sandbox.js';

const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => s.close(r)))); });

const ok = (data, statusCode = 200) => ({ statusCode, data, durationMs: 3, requestBody: null });

function start(client, { session = true } = {}) {
  const app = express();
  // The real server allows this much and keeps the raw text (the webhook routes need it); the routes enforce their own limits.
  app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); } }));
  if (session) app.use((req, _res, next) => { req.truv = client; next(); });
  app.use(sandboxRoutes({ truv: null }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
async function send(base, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { http: res.status, json: await res.json() };
}

describe('sign-in', () => {
  it('answers 401 when there is no session and no shared client', async () => {
    const base = await start(null, { session: false });
    expect((await send(base, 'GET', '/api/sandbox/scenarios')).http).toBe(401);
    expect((await send(base, 'POST', '/api/sandbox/scenarios', {})).http).toBe(401);
    expect((await send(base, 'POST', '/api/sandbox/run', { login: 'a', password: 'b' })).http).toBe(401);
  });
});

describe('listing scenarios, the odd cases', () => {
  it('ignores a filter given twice or as a list, rather than passing mush upstream', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ results: [], next: null }));
    const base = await start({ sandbox });
    await send(base, 'GET', '/api/sandbox/scenarios?data_source=a&data_source=b&product[x]=y');
    expect(sandbox.mock.calls[0][1]).toBe('scenarios/');
  });
});

describe('listing scenarios', () => {
  it('follows the cursor to the end and traces every page', async () => {
    const sandbox = vi.fn()
      .mockResolvedValueOnce(ok({ results: [{ id: 'a' }, { id: 'b' }], next: 'https://prod.truv.com/v1/sandbox/scenarios/?cursor=PAGE2' }))
      .mockResolvedValueOnce(ok({ results: [{ id: 'c' }], next: null }));
    const base = await start({ sandbox });
    const { json } = await send(base, 'GET', '/api/sandbox/scenarios?data_source=payroll');
    expect(json.data.results.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(json.data.truncated).toBe(false);
    expect(sandbox.mock.calls[0]).toEqual(['GET', 'scenarios/?data_source=payroll']);
    expect(sandbox.mock.calls[1][1]).toBe('scenarios/?data_source=payroll&cursor=PAGE2');
    expect(json.calls).toHaveLength(2);
    expect(json.calls[1]).toMatchObject({ method: 'GET', status_code: 200 });
    expect(json.calls[1].endpoint).toBe('/v1/sandbox/scenarios/?data_source=payroll&cursor=PAGE2');
  });

  it('stops and reports the error when a page fails', async () => {
    const sandbox = vi.fn().mockResolvedValueOnce(ok({ error: { code: 'env_not_sandbox', message: 'prod key' } }, 403));
    const base = await start({ sandbox });
    const { json } = await send(base, 'GET', '/api/sandbox/scenarios');
    expect(json.status).toBe(403);
    expect(json.data.error.code).toBe('env_not_sandbox');
    expect(json.calls).toHaveLength(1);
  });

  it('passes only the filters it knows', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ results: [], next: null }));
    const base = await start({ sandbox });
    await send(base, 'GET', '/api/sandbox/scenarios?enabled=true&product=income&evil=1');
    expect(sandbox.mock.calls[0][1]).toBe('scenarios/?enabled=true&product=income');
  });

  it('gives up after the page cap and says it did', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ results: [{ id: 'x' }], next: 'https://prod.truv.com/v1/sandbox/scenarios/?cursor=MORE' }));
    const base = await start({ sandbox });
    const { json } = await send(base, 'GET', '/api/sandbox/scenarios');
    expect(json.data.truncated).toBe(true);
    expect(sandbox.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

describe('creating, changing and deleting', () => {
  it('sends the scenario as it was given and returns Truv\'s answer with the trace', async () => {
    const sandbox = vi.fn().mockResolvedValue({ ...ok({ id: 'new1', label: 'A' }, 201), requestBody: { label: 'A' } });
    const base = await start({ sandbox });
    const body = { data_source: 'payroll', label: 'A', username: 'qa.a' };
    const { json } = await send(base, 'POST', '/api/sandbox/scenarios', body);
    expect(sandbox).toHaveBeenCalledWith('POST', 'scenarios/', body);
    expect(json).toMatchObject({ status: 201, data: { id: 'new1' } });
    expect(json.calls[0]).toMatchObject({ method: 'POST', endpoint: '/v1/sandbox/scenarios/', status_code: 201, request_body: body });
  });

  it('hands Truv\'s refusal back so the page can show it field by field', async () => {
    const refusal = { error: { code: 'incorrect_parameters', extra: { 'invalid-params': [{ field: 'behavior_status', message: 'bad' }] } } };
    const base = await start({ sandbox: vi.fn().mockResolvedValue(ok(refusal, 400)) });
    const { json } = await send(base, 'POST', '/api/sandbox/scenarios', { label: 'x' });
    expect(json.status).toBe(400);
    expect(json.data.error.extra['invalid-params'][0].field).toBe('behavior_status');
  });

  it('updates and deletes by id, and reports a 204 as a 204', async () => {
    const sandbox = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'abc', enabled: false }))
      .mockResolvedValueOnce({ statusCode: 204, data: {}, durationMs: 2, requestBody: null });
    const base = await start({ sandbox });
    const patched = await send(base, 'PATCH', '/api/sandbox/scenarios/abc', { enabled: false });
    expect(sandbox.mock.calls[0]).toEqual(['PATCH', 'scenarios/abc/', { enabled: false }]);
    expect(patched.json.status).toBe(200);
    const deleted = await send(base, 'DELETE', '/api/sandbox/scenarios/abc');
    expect(sandbox.mock.calls[1]).toEqual(['DELETE', 'scenarios/abc/']);
    expect(deleted.json.status).toBe(204);
    expect(deleted.json.calls[0].response_body).toBeNull();
  });

  it('does not let an id turn into a different path', async () => {
    const sandbox = vi.fn();
    const base = await start({ sandbox });
    for (const bad of ['..%2Fdocuments', 'a%2Fb', 'a b', 'x'.repeat(65), 'a%3Fb']) {
      expect((await send(base, 'DELETE', `/api/sandbox/scenarios/${bad}`)).http, bad).toBe(400);
      expect((await send(base, 'PATCH', `/api/sandbox/scenarios/${bad}`, { enabled: true })).http, bad).toBe(400);
      expect((await send(base, 'DELETE', `/api/sandbox/documents/${bad}`)).http, bad).toBe(400);
    }
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('refuses a body that is not an object', async () => {
    const sandbox = vi.fn();
    const base = await start({ sandbox });
    expect((await send(base, 'POST', '/api/sandbox/scenarios', [1, 2])).http).toBe(400);
    expect((await send(base, 'PATCH', '/api/sandbox/scenarios/abc', [])).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/resolve', [])).http).toBe(400);
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('resolves a login without running it', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ scenario: { id: 's1' }, matched_on: ['username'], tier: 'client' }));
    const base = await start({ sandbox });
    const { json } = await send(base, 'POST', '/api/sandbox/resolve', { data_source: 'payroll', username: 'qa.a' });
    expect(sandbox).toHaveBeenCalledWith('POST', 'scenarios/resolve/', { data_source: 'payroll', username: 'qa.a' });
    expect(json.data.matched_on).toEqual(['username']);
  });
});

describe('the PDF library', () => {
  it('uploads a file and keeps its bytes out of the trace', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ id: 'doc1' }, 201));
    const base = await start({ sandbox });
    const content = Buffer.alloc(30 * 1024, 1).toString('base64');
    const { json } = await send(base, 'POST', '/api/sandbox/documents', { filename: 'a.pdf', content });
    expect(sandbox).toHaveBeenCalledWith('POST', 'documents/', { filename: 'a.pdf', content });
    expect(json.calls[0].request_body.filename).toBe('a.pdf');
    expect(json.calls[0].request_body.content).toMatch(/^\[30 KB, base64\]$/);
    expect(JSON.stringify(json.calls)).not.toContain(content.slice(0, 40));
  });

  it('asks for a name and a file, and stops a file over 10 MB', async () => {
    const sandbox = vi.fn();
    const base = await start({ sandbox });
    expect((await send(base, 'POST', '/api/sandbox/documents', { content: 'abc' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/documents', { filename: 'a.pdf' })).http).toBe(400);
    const big = 'A'.repeat(Math.ceil((10 * 1024 * 1024 + 10) / 0.75));
    expect((await send(base, 'POST', '/api/sandbox/documents', { filename: 'a.pdf', content: big })).http).toBe(400);
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('counts the limit in decoded bytes: exactly 10 MB goes through, one byte more does not', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ id: 'd1' }, 201));
    const base = await start({ sandbox });
    const b64 = (bytes) => Buffer.alloc(bytes, 1).toString('base64');
    const exactly = 10 * 1024 * 1024;
    expect((await send(base, 'POST', '/api/sandbox/documents', { filename: 'a.pdf', content: b64(exactly) })).json.status).toBe(201);
    expect((await send(base, 'POST', '/api/sandbox/documents', { filename: 'a.pdf', content: b64(exactly + 1) })).http).toBe(400);
    expect(sandbox).toHaveBeenCalledTimes(1);
  });

  it('stops when the same cursor comes round again, and says when it ran out of pages', async () => {
    const loop = vi.fn().mockResolvedValue(ok({ results: [{ id: 'x' }], next: 'https://prod.truv.com/v1/sandbox/documents/?cursor=SAME' }));
    const base = await start({ sandbox: loop });
    const { json } = await send(base, 'GET', '/api/sandbox/documents');
    expect(loop).toHaveBeenCalledTimes(2);
    expect(json.data.results).toHaveLength(2);
    expect(json.data.truncated).toBe(true);
    const endless = vi.fn().mockImplementation(async () => ok({ results: [], next: `https://prod.truv.com/v1/sandbox/documents/?cursor=${Math.random()}` }));
    const again = await start({ sandbox: endless });
    expect((await send(again, 'GET', '/api/sandbox/documents')).json.data.truncated).toBe(true);
  });

  it('lists, renames and deletes, and passes on a file-in-use refusal', async () => {
    const sandbox = vi.fn()
      .mockResolvedValueOnce(ok({ results: [{ id: 'd1' }], next: null }))
      .mockResolvedValueOnce(ok({ id: 'd1', uploaded_file: { filename: 'b.pdf' } }))
      .mockResolvedValueOnce(ok({ error: { code: 'resource_in_use' } }, 409));
    const base = await start({ sandbox });
    expect((await send(base, 'GET', '/api/sandbox/documents')).json.data.results).toHaveLength(1);
    expect((await send(base, 'PATCH', '/api/sandbox/documents/d1', { filename: 'b.pdf' })).json.status).toBe(200);
    const del = await send(base, 'DELETE', '/api/sandbox/documents/d1');
    expect(del.json.status).toBe(409);
    expect(del.json.data.error.code).toBe('resource_in_use');
  });
});

describe('trying a login', () => {
  function client(overrides = {}) {
    return {
      sandbox: vi.fn().mockResolvedValue(ok({ results: [] })),
      createOrder: vi.fn().mockResolvedValue({ ...ok({ id: 'o1', user_id: 'u1', bridge_token: 'order-bt', employers: [{ bridge_token: 'bt1' }] }, 201), requestBody: { order_number: 'x', products: ['income'] } }),
      createCheck: vi.fn().mockResolvedValue(ok({ check_id: 'c1', task_id: 't1', status: 'new' }, 201)),
      getUserTasks: vi.fn().mockResolvedValue(ok([{ status: 'done' }])),
      getOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', employers: [] })),
      ...overrides,
    };
  }

  it('creates an order, signs in with the order\'s token and returns what to read it back with', async () => {
    const c = client();
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run', { mode: 'headless', login: 'qa.a', password: 'pw', product: 'income' });
    expect(json).toMatchObject({ status: 201, data: { order_id: 'o1', user_id: 'u1', check_id: 'c1' } });
    expect(c.createCheck).toHaveBeenCalledWith('bt1', { login: 'qa.a', password: 'pw', productType: 'income' });
    expect(c.createOrder.mock.calls[0][0]).toMatchObject({ product_type: 'income' });
    expect(c.createOrder.mock.calls[0][0]).not.toHaveProperty('employers');
    expect(json.calls.map(x => `${x.method} ${x.endpoint}`)).toEqual(['GET /v1/sandbox/scenarios/', 'POST /v1/orders/', 'POST /v1/checks/']);
  });

  it('refuses a production key before it creates an order', async () => {
    const c = client({ sandbox: vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403)) });
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'income' });
    expect(json.status).toBe(403);
    expect(json.data.error.code).toBe('env_not_sandbox');
    expect(c.createOrder).not.toHaveBeenCalled();
    expect(c.createCheck).not.toHaveBeenCalled();
  });

  it('checks the key once, then trusts it for a while', async () => {
    const c = client();
    const base = await start(c);
    await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'income' });
    const second = await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'income' });
    expect(c.sandbox).toHaveBeenCalledTimes(1);
    expect(second.json.calls.map(x => x.endpoint)).toEqual(['/v1/orders/']);
  });

  it('never puts the password in the trace', async () => {
    const base = await start(client());
    const { json } = await send(base, 'POST', '/api/sandbox/run', { login: 'qa.a', password: 'super-secret-pw' });
    expect(JSON.stringify(json)).not.toContain('super-secret-pw');
    expect(json.calls.find(x => x.endpoint === '/v1/checks/').request_body).toMatchObject({ employee_login: 'qa.a', employee_password: '***' });
  });

  it('opens Bridge instead: creates the order and returns its token without signing in', async () => {
    const c = client();
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'assets' });
    expect(json).toMatchObject({ status: 201, data: { order_id: 'o1', user_id: 'u1', bridge_token: 'order-bt' } });
    expect(c.createCheck).not.toHaveBeenCalled();
    expect(c.createOrder.mock.calls[0][0]).toMatchObject({ product_type: 'assets' });
  });

  it('leaves out deposit switch and paycheck-linked loans, which the public sector does not use', async () => {
    const c = client();
    const base = await start(c);
    for (const product of ['deposit_switch', 'pll']) {
      expect((await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product })).http).toBe(400);
    }
    expect(c.createOrder).not.toHaveBeenCalled();
  });

  it('stops where it failed and says so', async () => {
    const noOrder = client({ createOrder: vi.fn().mockResolvedValue(ok({ error: { code: 'x' } }, 400)) });
    let r = await send(await start(noOrder), 'POST', '/api/sandbox/run', { login: 'a', password: 'b' });
    expect(r.json.status).toBe(400);
    expect(noOrder.createCheck).not.toHaveBeenCalled();

    const noToken = client({ createOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', user_id: 'u1', employers: [{}] }, 201)) });
    r = await send(await start(noToken), 'POST', '/api/sandbox/run', { login: 'a', password: 'b' });
    expect(r.json.status).toBe(502);
    expect(r.json.data.error.code).toBe('no_bridge_token');

    const noWidgetToken = client({ createOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', user_id: 'u1' }, 201)) });
    r = await send(await start(noWidgetToken), 'POST', '/api/sandbox/run', { mode: 'widget' });
    expect(r.json.data.error.code).toBe('no_bridge_token');

    const badCheck = client({ createCheck: vi.fn().mockResolvedValue(ok({ detail: 'nope' }, 400)) });
    r = await send(await start(badCheck), 'POST', '/api/sandbox/run', { login: 'a', password: 'b' });
    expect(r.json).toMatchObject({ status: 400, order_id: 'o1', user_id: 'u1' });
  });

  it('checks what it was asked for', async () => {
    const c = client();
    const base = await start(c);
    expect((await send(base, 'POST', '/api/sandbox/run', { password: 'x' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run', { login: 'x' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run', { login: 'x', password: 'y', product: 'assets' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run', { mode: 'both', login: 'x', password: 'y' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'admin' })).http).toBe(400);
    expect(c.createOrder).not.toHaveBeenCalled();
  });

  it('reads where a run stands from the tasks and the order', async () => {
    const c = client({ getUserTasks: vi.fn().mockResolvedValue(ok({ results: [{ status: 'parse' }] })) });
    const base = await start(c);
    const { json } = await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    expect(json.data.tasks).toEqual([{ status: 'parse' }]);
    expect(json.data.order).toEqual({ id: 'o1', employers: [] });
    expect(c.getUserTasks).toHaveBeenCalledWith('u1');
    expect(json.calls.map(x => x.endpoint)).toEqual(['/v1/sandbox/scenarios/', '/v1/tasks/?user_id=u1', '/v1/orders/o1/']);
  });

  it('will not read a run on a production key', async () => {
    const c = client({ sandbox: vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403)) });
    const base = await start(c);
    const { json } = await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    expect(json.status).toBe(403);
    expect(c.getUserTasks).not.toHaveBeenCalled();
    expect(c.getOrder).not.toHaveBeenCalled();
  });

  it('wants a password to sign in with, and ignores a user id given as a list', async () => {
    const c = client();
    const base = await start(c);
    expect((await send(base, 'POST', '/api/sandbox/run', { mode: 'headless', product: 'income', login: 'a', password: '' })).http).toBe(400);
    expect(c.createOrder).not.toHaveBeenCalled();
    expect((await send(base, 'GET', '/api/sandbox/run/o1?user_id[]=u1')).http).toBe(400);
  });

  it('refuses a run lookup with bad ids, and reports an order it cannot read', async () => {
    const c = client({ getOrder: vi.fn().mockResolvedValue(ok({ detail: 'x' }, 404)) });
    const base = await start(c);
    expect((await send(base, 'GET', '/api/sandbox/run/o1?user_id=..')).http).toBe(400);
    expect((await send(base, 'GET', '/api/sandbox/run/o1')).http).toBe(400);
    const { json } = await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    expect(json.data.order).toBeNull();
    expect(json.data.order_status).toBe(404);
  });
});

describe('reading one scenario and who the page is signed in as', () => {
  it('reads a scenario by id and refuses an id that is not one', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ id: 's1', updated_at: '2026-10-01T00:00:00Z' }));
    const base = await start({ sandbox });
    const { json } = await send(base, 'GET', '/api/sandbox/scenarios/s1');
    expect(sandbox).toHaveBeenCalledWith('GET', 'scenarios/s1/');
    expect(json).toMatchObject({ status: 200, data: { id: 's1' } });
    expect(json.calls[0]).toMatchObject({ method: 'GET', endpoint: '/v1/sandbox/scenarios/s1/' });
    expect((await send(base, 'GET', '/api/sandbox/scenarios/a.b')).http).toBe(400);
  });

  it('hands back Truv\'s answer when the scenario is gone', async () => {
    const base = await start({ sandbox: vi.fn().mockResolvedValue(ok({ detail: 'Not found.' }, 404)) });
    expect((await send(base, 'GET', '/api/sandbox/scenarios/s1')).json.status).toBe(404);
  });

  it('says it is a sandbox key and shows only the end of the client id', async () => {
    const base = await start({ sandbox: vi.fn().mockResolvedValue(ok({ results: [] })), clientId: 'abcd1234wxyz', secret: 'sh-secret' });
    const { json } = await send(base, 'GET', '/api/sandbox/whoami');
    expect(json.data).toEqual({ environment: 'sandbox', key_hint: '\u2026wxyz' });
    expect(JSON.stringify(json)).not.toContain('sh-secret');
    expect(JSON.stringify(json)).not.toContain('abcd1234');
  });

  it('refuses a production key and a missing session', async () => {
    const base = await start({ sandbox: vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403)), clientId: 'prod-key-0001', secret: 's' });
    expect((await send(base, 'GET', '/api/sandbox/whoami')).json.status).toBe(403);
    const none = await start(null, { session: false });
    expect((await send(none, 'GET', '/api/sandbox/whoami')).http).toBe(401);
    expect((await send(none, 'GET', '/api/sandbox/scenarios/s1')).http).toBe(401);
  });
});

describe('trying several logins in one order', () => {
  function client(overrides = {}) {
    return {
      clientId: 'cid-0001', secret: 's',
      sandbox: vi.fn().mockResolvedValue(ok({ results: [] })),
      createOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', user_id: 'u1', employers: [{ bridge_token: 'bt3', company_name: 'Sandbox login 3' }, { bridge_token: 'bt1', company_name: 'Sandbox login 1' }, { bridge_token: 'bt2', company_name: 'Sandbox login 2' }] }, 201)),
      createCheck: vi.fn().mockImplementation(async (token) => ok({ check_id: `c-${token}`, task_id: `t-${token}` }, 201)),
      ...overrides,
    };
  }
  const post = (base, body) => send(base, 'POST', '/api/sandbox/run', { mode: 'headless', product: 'income', ...body });

  it('makes one employer per login and signs in to the first only', async () => {
    const c = client();
    const base = await start(c);
    const { json } = await post(base, { logins: [{ login: 'a', password: 'pa' }, { login: 'b', password: 'pb' }] });
    expect(c.createOrder.mock.calls[0][0].employers).toHaveLength(2);
    expect(c.createCheck.mock.calls.map(x => [x[0], x[1].login, x[1].password])).toEqual([['bt1', 'a', 'pa']]);
    expect(json.status).toBe(201);
    expect(json.data).toMatchObject({ order_id: 'o1', user_id: 'u1', check_id: 'c-bt1', task_id: 't-bt1' });
    expect(json.data.employers.map(e => e.login)).toEqual(['a', 'b']);
    expect(json.calls.filter(x => x.endpoint === '/v1/checks/')).toHaveLength(1);
    expect(JSON.stringify(json)).not.toContain('"pa"');
  });

  it('lets logins replace login and password, and keeps a single login as it was', async () => {
    const c = client();
    const base = await start(c);
    await post(base, { login: 'ignored', password: 'x', logins: [{ login: 'only', password: 'p' }] });
    expect(c.createCheck.mock.calls[0][1].login).toBe('only');
    expect(c.createOrder.mock.calls[0][0]).not.toHaveProperty('employers');
    const one = client({ createOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', user_id: 'u1', employers: [{ bridge_token: 'bt1', company_name: 'Acme' }] }, 201)) });
    const { json } = await post(await start(one), { login: 'solo', password: 'p' });
    expect(json.data.employers).toEqual([{ company_name: 'Acme', login: 'solo' }]);
  });

  it('checks the list before it creates anything', async () => {
    const c = client();
    const base = await start(c);
    const l = (n) => ({ login: `u${n}`, password: 'p' });
    for (const logins of [[], 'a', [l(1), l(2), l(3), l(4)], [l(1), { login: 'x', password: '' }], [{ login: '', password: 'p' }], [l(1), l(1)], [null]]) {
      expect((await post(base, { logins })).http).toBe(400);
    }
    expect((await send(base, 'POST', '/api/sandbox/run', { mode: 'headless', product: 'assets', logins: [l(1)] })).http).toBe(400);
    expect(c.createOrder).not.toHaveBeenCalled();
  });

  it('reports a failure of the first check along with the order that was made', async () => {
    const createCheck = vi.fn().mockResolvedValueOnce(ok({ error: { message: 'no' } }, 400));
    const c = client({ createCheck });
    const base = await start(c);
    const { json } = await post(base, { logins: [{ login: 'a', password: 'p' }, { login: 'b', password: 'p' }, { login: 'c', password: 'p' }] });
    expect(json.status).toBe(400);
    expect(json.order_id).toBe('o1');
    expect(json.employers).toHaveLength(3);
    expect(createCheck).toHaveBeenCalledTimes(1);
  });

  it('reports a missing token for any employer, and still signs nothing in', async () => {
    const c = client({ createOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', user_id: 'u1', employers: [{ bridge_token: 'bt1', company_name: 'Sandbox login 1' }] }, 201)) });
    const base = await start(c);
    const { json } = await post(base, { logins: [{ login: 'a', password: 'p' }, { login: 'b', password: 'p' }] });
    expect(json.status).toBe(502);
    expect(c.createCheck).not.toHaveBeenCalled();
  });

  it('remembers the user for this session when a database is given', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.truv = client(); req.session = { id: 'sess1' }; next(); });
    const db = { recordSessionUser: vi.fn() };
    app.use(sandboxRoutes({ truv: null, db }));
    const server = http.createServer(app);
    servers.push(server);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    await send(`http://127.0.0.1:${server.address().port}`, 'POST', '/api/sandbox/run', { login: 'a', password: 'p' });
    expect(db.recordSessionUser).toHaveBeenCalledWith('sess1', 'u1');
  });
});

describe('signing in to the next login of an order', () => {
  function client(overrides = {}) {
    return {
      sandbox: vi.fn().mockResolvedValue(ok({ results: [] })),
      getOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', employers: [{ bridge_token: 'bt2', company_name: 'Sandbox login 3' }, { bridge_token: 'bt0', company_name: 'Sandbox login 1' }, { bridge_token: 'bt1', company_name: 'Sandbox login 2' }] })),
      createCheck: vi.fn().mockResolvedValue(ok({ check_id: 'c2', task_id: 't2' }, 201)),
      ...overrides,
    };
  }
  const body = (extra = {}) => ({ user_id: 'u1', index: 1, login: 'b', password: 'pb', product: 'income', ...extra });

  it('uses that employer\'s token and keeps the password out of the trace', async () => {
    const c = client();
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run/o1/check', body({ index: 2 }));
    expect(c.createCheck).toHaveBeenCalledWith('bt2', { login: 'b', password: 'pb', productType: 'income' });
    expect(json).toMatchObject({ status: 201, data: { order_id: 'o1', user_id: 'u1', index: 2, check_id: 'c2', task_id: 't2' } });
    expect(json.calls.find(x => x.endpoint === '/v1/checks/').request_body).toMatchObject({ employee_password: '***' });
    expect(JSON.stringify(json)).not.toContain('"pb"');
  });

  it('checks its input before it asks Truv anything', async () => {
    const c = client();
    const base = await start(c);
    for (const bad of [{ index: 0 }, { index: 3 }, { index: '1' }, { index: 1.5 }, { login: '' }, { password: '' }, { user_id: '..' }, { product: 'assets' }, { product: undefined }]) {
      expect((await send(base, 'POST', '/api/sandbox/run/o1/check', body(bad))).http).toBe(400);
    }
    expect((await send(base, 'POST', '/api/sandbox/run/..x/check', body())).http).toBe(400);
    expect(c.getOrder).not.toHaveBeenCalled();
    expect(c.createCheck).not.toHaveBeenCalled();
  });

  it('says so when the order has no such login, or cannot be read', async () => {
    const c = client({ getOrder: vi.fn().mockResolvedValue(ok({ id: 'o1', employers: [{ bridge_token: 'bt0', company_name: 'Sandbox login 1' }] })) });
    const base = await start(c);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/check', body())).http).toBe(400);
    const gone = client({ getOrder: vi.fn().mockResolvedValue(ok({ detail: 'Not found.' }, 404)) });
    expect((await send(await start(gone), 'POST', '/api/sandbox/run/o1/check', body())).json.status).toBe(404);
    expect(c.createCheck).not.toHaveBeenCalled();
  });

  it('passes on Truv\'s refusal while the earlier task is still running', async () => {
    const c = client({ createCheck: vi.fn().mockResolvedValue(ok({ error: { code: 'task_exists', message: 'Connection is already in progress' } }, 409)) });
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run/o1/check', body());
    expect(json.status).toBe(409);
    expect(json.data.error.code).toBe('task_exists');
  });

  it('will not run on a production key', async () => {
    const c = client({ sandbox: vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403)) });
    const base = await start(c);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/check', body())).json.status).toBe(403);
    expect(c.createCheck).not.toHaveBeenCalled();
  });
});

describe('refreshing a run', () => {
  function client(overrides = {}) {
    return {
      sandbox: vi.fn().mockResolvedValue(ok({ results: [] })),
      createRefreshOrder: vi.fn().mockResolvedValue(ok({ id: 'o2', user_id: 'u1' }, 201)),
      ...overrides,
    };
  }

  it('asks Truv for a refresh of the one product and returns the new order id', async () => {
    const c = client();
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run/o1/refresh', { user_id: 'u1', product: 'income' });
    expect(c.createRefreshOrder).toHaveBeenCalledWith('o1', { products: ['income'] });
    expect(json).toMatchObject({ status: 201, data: { order_id: 'o2', user_id: 'u1', product: 'income' } });
    expect(json.calls.map(x => `${x.method} ${x.endpoint}`)).toEqual(['GET /v1/sandbox/scenarios/', 'POST /v1/orders/o1/']);
  });

  it('passes Truv\'s refusal on, such as an order that never finished in Bridge', async () => {
    const c = client({ createRefreshOrder: vi.fn().mockResolvedValue(ok({ error: { code: 'not_refreshable', message: 'No completed connections' } }, 400)) });
    const base = await start(c);
    const { json } = await send(base, 'POST', '/api/sandbox/run/o1/refresh', { user_id: 'u1', product: 'employment' });
    expect(json.status).toBe(400);
    expect(json.data.error.message).toBe('No completed connections');
  });

  it('checks its input and the key before it asks Truv', async () => {
    const c = client();
    const base = await start(c);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/refresh', { product: 'income' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/refresh', { user_id: ['u1'], product: 'income' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/refresh', { user_id: 'u1', product: 'assets' })).http).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/run/o1/refresh', { user_id: '..', product: 'income' })).http).toBe(400);
    expect(c.createRefreshOrder).not.toHaveBeenCalled();
    const prod = client({ sandbox: vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403)) });
    const pbase = await start(prod);
    expect((await send(pbase, 'POST', '/api/sandbox/run/o1/refresh', { user_id: 'u1', product: 'income' })).json.status).toBe(403);
    expect(prod.createRefreshOrder).not.toHaveBeenCalled();
  });

  it('puts the user id on a run read, so a refresh order can be followed the same way', async () => {
    const c = { sandbox: vi.fn().mockResolvedValue(ok({ results: [] })), getUserTasks: vi.fn().mockResolvedValue(ok([])), getOrder: vi.fn().mockResolvedValue(ok({ id: 'o2' })) };
    const base = await start(c);
    const { json } = await send(base, 'GET', '/api/sandbox/run/o2?user_id=u1');
    expect(json.data).toMatchObject({ user_id: 'u1', order: { id: 'o2' } });
  });
});

describe('hosted mode: a new client for every request', () => {
  // The session middleware builds a client from the visitor's keys on each request.
  function perRequest(keys, sandbox) {
    const app = express();
    app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); } }));
    app.use((req, _res, next) => { req.truv = { clientId: keys.id, secret: keys.secret, sandbox, getUserTasks: vi.fn().mockResolvedValue(ok([])), getOrder: vi.fn().mockResolvedValue(ok({ id: 'o1' })) }; next(); });
    app.use(sandboxRoutes({ truv: null }));
    return new Promise((resolve) => {
      const server = http.createServer(app);
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
  }

  it('checks the key once for the same keys, even though each request has its own client', async () => {
    const sandbox = vi.fn().mockResolvedValue(ok({ results: [{ id: 'a', username: 'secret-login', password: 'secret-pw' }] }));
    const base = await perRequest({ id: 'cid', secret: 'sec' }, sandbox);
    const first = await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    expect(sandbox).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first.json.calls)).not.toContain('secret-pw');
  });

  it('checks again for different keys, and does not remember a refusal', async () => {
    const refuse = vi.fn().mockResolvedValue(ok({ error: { code: 'env_not_sandbox' } }, 403));
    const base = await perRequest({ id: 'prod', secret: 'x' }, refuse);
    await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    await send(base, 'GET', '/api/sandbox/run/o1?user_id=u1');
    expect(refuse).toHaveBeenCalledTimes(2);
  });
});

describe('request bodies and error text', () => {
  it('turns away an empty body, such as one sent with the wrong content type, before it reaches Truv', async () => {
    const sandbox = vi.fn();
    const base = await start({ sandbox });
    const res = await fetch(`${base}/api/sandbox/scenarios`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'label=x' });
    expect(res.status).toBe(400);
    expect((await send(base, 'POST', '/api/sandbox/scenarios', {})).http).toBe(400);
    expect((await send(base, 'PATCH', '/api/sandbox/scenarios/abc', {})).http).toBe(400);
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('refuses a scenario body over 1 MB', async () => {
    const sandbox = vi.fn();
    const base = await start({ sandbox });
    const { http: code, json } = await send(base, 'POST', '/api/sandbox/scenarios', { label: 'x', pad: 'A'.repeat(1_600_000) });
    expect(code).toBe(400);
    expect(json.message).toMatch(/1 MB/);
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('keeps upstream addresses and system text out of what the page is told', async () => {
    const down = { statusCode: 502, data: { error: 'network_error', message: 'connect ECONNREFUSED https://prod.truv.com/v1/sandbox/scenarios/' }, durationMs: 1, requestBody: null };
    const base = await start({ sandbox: vi.fn().mockResolvedValue(down) });
    const { json } = await send(base, 'POST', '/api/sandbox/resolve', { username: 'a' });
    expect(JSON.stringify(json)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(json)).not.toContain('prod.truv.com');
    const broke = await start({ sandbox: vi.fn().mockRejectedValue(new Error('boom at /Users/someone/file.js')) });
    const r = await send(broke, 'GET', '/api/sandbox/scenarios');
    expect(r.http).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('/Users/');
  });
});

describe('what is not here', () => {
  it('has no route to anything outside the sandbox tool', async () => {
    const base = await start({ sandbox: vi.fn() });
    for (const [m, p] of [['GET', '/api/sandbox/keys'], ['POST', '/api/sandbox/orders'], ['GET', '/api/sandbox/scenarios/abc/export']]) {
      const res = await fetch(base + p, { method: m });
      expect([404], `${m} ${p}`).toContain(res.status);
    }
  });
});
