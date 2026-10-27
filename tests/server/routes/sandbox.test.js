import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import sandboxRoutes from '../../../server/routes/sandbox.js';

const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => s.close(r)))); });

const ok = (data, statusCode = 200) => ({ statusCode, data, durationMs: 3, requestBody: null });

function start(client, { session = true } = {}) {
  const app = express();
  app.use(express.json({ limit: '100mb' })); // the real server allows this much; the route enforces 10 MB for files
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

  it('gives deposit switch and PLL an employer to attach the test account to', async () => {
    const c = client();
    const base = await start(c);
    await send(base, 'POST', '/api/sandbox/run', { mode: 'widget', product: 'pll' });
    expect(c.createOrder.mock.calls[0][0].employers).toEqual([{ company_name: 'Sandbox Employer' }]);
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

describe('what is not here', () => {
  it('has no route to anything outside the sandbox tool', async () => {
    const base = await start({ sandbox: vi.fn() });
    for (const [m, p] of [['GET', '/api/sandbox/keys'], ['POST', '/api/sandbox/orders'], ['GET', '/api/sandbox/scenarios/abc/export']]) {
      const res = await fetch(base + p, { method: m });
      expect([404], `${m} ${p}`).toContain(res.status);
    }
  });
});
