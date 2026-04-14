import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import * as db from '../../../server/db.js';
import ordersRoutes from '../../../server/routes/orders.js';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let memDb;
let truv;
let apiLogger;
let app;
let server;
let baseUrl;

/**
 * Make an HTTP request to the test server.
 * Returns { status, body } where body is the parsed JSON response.
 */
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // In-memory DB
  memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');
  db._setTestDb(memDb);
  db.initDb();

  // Mocks (will be reset per test via beforeEach)
  truv = createMockTruv();
  apiLogger = createMockApiLogger();

  // Express app with the orders router
  app = express();
  app.use(express.json());
  app.use(ordersRoutes({ truv, db, apiLogger }));

  // Start a real HTTP server on an ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  memDb.close();
});

beforeEach(() => {
  // Clean DB tables
  memDb.prepare('DELETE FROM orders').run();
  memDb.prepare('DELETE FROM api_logs').run();

  // Reset mock call history (but keep the default resolved values)
  Object.values(truv).forEach((fn) => fn.mockClear());
  apiLogger.logApiCall.mockClear();
  apiLogger.pushWebhookEvent.mockClear();
});

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------
describe('POST /api/orders', () => {
  it('creates an order with income product + employer and returns expected fields', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: {
        id: 'truv-order-abc',
        user_id: 'truv-user-123',
        bridge_token: 'bt_tok',
        share_url: 'https://share.truv.com/abc',
        status: 'created',
      },
      durationMs: 15,
      requestBody: { first_name: 'Jane' },
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      product_type: 'income',
      employer: { name: 'Acme Corp' },
      demo_id: 'pos-tasks',
    });

    expect(status).toBe(200);
    expect(body.truv_order_id).toBe('truv-order-abc');
    expect(body.user_id).toBe('truv-user-123');
    expect(body.bridge_token).toBe('bt_tok');
    expect(body.order_id).toBeTruthy();
    expect(body.status).toBe('created');

    // Verify the order was persisted in the DB
    const dbOrder = db.getOrder(body.order_id);
    expect(dbOrder).not.toBeNull();
    expect(dbOrder.truv_order_id).toBe('truv-order-abc');
    expect(dbOrder.user_id).toBe('truv-user-123');
    expect(dbOrder.demo_id).toBe('pos-tasks');
    expect(dbOrder.bridge_token).toBe('bt_tok');
    expect(dbOrder.share_url).toBe('https://share.truv.com/abc');
  });

  it('creates an order with assets product (no employer)', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: {
        id: 'truv-order-assets',
        user_id: 'truv-user-456',
        bridge_token: 'bt_assets',
        status: 'created',
      },
      durationMs: 20,
      requestBody: { product_type: 'assets' },
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Bob',
      last_name: 'Smith',
      product_type: 'assets',
      products: ['assets'],
      financial_institutions: [{ name: 'Chase Bank' }],
      demo_id: 'default',
    });

    expect(status).toBe(200);
    expect(body.truv_order_id).toBe('truv-order-assets');
    expect(body.user_id).toBe('truv-user-456');

    // Verify product_type was stored
    const dbOrder = db.getOrder(body.order_id);
    expect(dbOrder).not.toBeNull();
    expect(dbOrder.product_type).toBe('assets');
  });

  it('passes external_user_id to Truv when provided', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: {
        id: 'truv-order-ext',
        user_id: 'truv-user-ext',
        bridge_token: 'bt_ext',
        status: 'created',
      },
      durationMs: 10,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Alice',
      last_name: 'W',
      external_user_id: 'ext-user-99',
      product_type: 'income',
    });

    expect(status).toBe(200);
    expect(body.user_id).toBe('truv-user-ext');

    // Confirm the external_user_id was included in the Truv call
    const callArgs = truv.createOrder.mock.calls[0][0];
    expect(callArgs.external_user_id).toBe('ext-user-99');
  });

  it('returns error status when Truv API responds with an error', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 422,
      data: { error: 'Invalid SSN format' },
      durationMs: 5,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Bad',
      last_name: 'Data',
      ssn: 'not-valid',
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Truv API error');
    expect(body.details).toEqual({ error: 'Invalid SSN format' });

    // No order should be saved in the DB
    const allOrders = db.getAllOrders();
    expect(allOrders).toHaveLength(0);
  });

  it('logs the API call with correct userId and endpoint', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: {
        id: 'truv-order-log',
        user_id: 'truv-user-log',
        bridge_token: 'bt_log',
        status: 'created',
      },
      durationMs: 30,
      requestBody: { first_name: 'Logger' },
    });

    await request('POST', '/api/orders', {
      first_name: 'Logger',
      last_name: 'Test',
    });

    expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'truv-user-log',
        method: 'POST',
        endpoint: '/v1/orders/',
        requestBody: { first_name: 'Logger' },
        statusCode: 200,
        durationMs: 30,
      })
    );
  });

  it('defaults product_type to "income" when omitted', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: { id: 'truv-default-pt', user_id: 'u-def', bridge_token: 'bt', status: 'created' },
      durationMs: 5,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Default',
    });

    expect(status).toBe(200);

    // product_type should be stored as 'income' in the DB
    const dbOrder = db.getOrder(body.order_id);
    expect(dbOrder.product_type).toBe('income');
  });

  it('stores comma-joined products when products array is provided', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: { id: 'truv-multi', user_id: 'u-multi', bridge_token: 'bt', status: 'created' },
      durationMs: 5,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Multi',
      products: ['income', 'employment'],
    });

    expect(status).toBe(200);
    const dbOrder = db.getOrder(body.order_id);
    expect(dbOrder.product_type).toBe('income,employment');
  });

  it('returns company_mapping_id when provided', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: { id: 'truv-cmi', user_id: 'u-cmi', bridge_token: 'bt', status: 'created' },
      durationMs: 5,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'Mapping',
      company_mapping_id: 'cmi-12345',
    });

    expect(status).toBe(200);
    expect(body.company_mapping_id).toBe('cmi-12345');
  });

  it('returns company_mapping_id as null when not provided', async () => {
    truv.createOrder.mockResolvedValue({
      statusCode: 200,
      data: { id: 'truv-no-cmi', user_id: 'u-no-cmi', bridge_token: 'bt', status: 'created' },
      durationMs: 5,
      requestBody: {},
    });

    const { status, body } = await request('POST', '/api/orders', {
      first_name: 'NoMapping',
    });

    expect(status).toBe(200);
    expect(body.company_mapping_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders
// ---------------------------------------------------------------------------
describe('GET /api/orders', () => {
  it('returns all orders', async () => {
    // Seed two orders directly in the DB
    db.createOrder({ orderId: 'list-1', truvOrderId: 't1', userId: 'u1', demoId: 'demo-a', status: 'created', rawResponse: { x: 1 } });
    db.createOrder({ orderId: 'list-2', truvOrderId: 't2', userId: 'u2', demoId: 'demo-b', status: 'completed', rawResponse: { x: 2 } });

    const { status, body } = await request('GET', '/api/orders');

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    // Orders are returned newest first (ORDER BY created_at DESC)
    const ids = body.map((o) => o.order_id);
    expect(ids).toContain('list-1');
    expect(ids).toContain('list-2');

    // Each entry has the expected shape
    const first = body.find((o) => o.order_id === 'list-1');
    expect(first.truv_order_id).toBe('t1');
    expect(first.user_id).toBe('u1');
    expect(first.demo_id).toBe('demo-a');
    expect(first.status).toBe('created');
    expect(first.raw_response).toEqual({ x: 1 });
  });

  it('filters by demo_id when query param is provided', async () => {
    db.createOrder({ orderId: 'f1', demoId: 'pos-tasks', status: 'created' });
    db.createOrder({ orderId: 'f2', demoId: 'pos-tasks', status: 'created' });
    db.createOrder({ orderId: 'f3', demoId: 'other-demo', status: 'created' });

    const { status, body } = await request('GET', '/api/orders?demo_id=pos-tasks');

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    body.forEach((o) => expect(o.demo_id).toBe('pos-tasks'));
  });

  it('returns empty array when no orders exist', async () => {
    const { status, body } = await request('GET', '/api/orders');

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id/info
// ---------------------------------------------------------------------------
describe('GET /api/orders/:id/info', () => {
  it('returns DB-only data without making a Truv API call', async () => {
    db.createOrder({
      orderId: 'info-1',
      truvOrderId: 'truv-info-1',
      userId: 'u-info',
      bridgeToken: 'bt-info',
      status: 'completed',
    });
    db.updateOrder('info-1', { product_type: 'income' });

    const { status, body } = await request('GET', '/api/orders/info-1/info');

    expect(status).toBe(200);
    expect(body.order_id).toBe('info-1');
    expect(body.truv_order_id).toBe('truv-info-1');
    expect(body.user_id).toBe('u-info');
    expect(body.bridge_token).toBe('bt-info');
    expect(body.status).toBe('completed');
    expect(body.product_type).toBe('income');

    // No Truv API call should have been made
    expect(truv.getOrder).not.toHaveBeenCalled();
  });

  it('returns 404 for non-existent order', async () => {
    const { status, body } = await request('GET', '/api/orders/nonexistent/info');

    expect(status).toBe(404);
    expect(body.error).toBe('Order not found');
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id
// ---------------------------------------------------------------------------
describe('GET /api/orders/:id', () => {
  it('fetches from Truv and updates DB status', async () => {
    db.createOrder({
      orderId: 'detail-1',
      truvOrderId: 'truv-detail-1',
      userId: 'u-detail',
      bridgeToken: 'bt-detail',
      status: 'created',
    });

    truv.getOrder.mockResolvedValue({
      statusCode: 200,
      data: {
        status: 'completed',
        results: [{ income: 50000 }],
      },
      durationMs: 25,
    });

    const { status, body } = await request('GET', '/api/orders/detail-1');

    expect(status).toBe(200);
    expect(body.order_id).toBe('detail-1');
    expect(body.truv_order_id).toBe('truv-detail-1');
    expect(body.user_id).toBe('u-detail');
    expect(body.status).toBe('completed');
    expect(body.raw_response).toEqual({ status: 'completed', results: [{ income: 50000 }] });

    // Verify the Truv getOrder call was made with the truv_order_id
    expect(truv.getOrder).toHaveBeenCalledWith('truv-detail-1');

    // Verify status was updated in the DB
    const dbOrder = db.getOrder('detail-1');
    expect(dbOrder.status).toBe('completed');

    // Verify API call was logged
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-detail',
        method: 'GET',
        endpoint: '/v1/orders/truv-detail-1/',
      })
    );
  });

  it('returns 404 for non-existent order', async () => {
    const { status, body } = await request('GET', '/api/orders/does-not-exist');

    expect(status).toBe(404);
    expect(body.error).toBe('Order not found');

    // No Truv call should be made
    expect(truv.getOrder).not.toHaveBeenCalled();
  });

  it('returns Truv error when getOrder fails', async () => {
    db.createOrder({
      orderId: 'err-1',
      truvOrderId: 'truv-err-1',
      userId: 'u-err',
      status: 'created',
    });

    truv.getOrder.mockResolvedValue({
      statusCode: 500,
      data: { error: 'Internal Truv error' },
      durationMs: 10,
    });

    const { status, body } = await request('GET', '/api/orders/err-1');

    expect(status).toBe(500);
    expect(body.error).toBe('Truv API error');
    expect(body.details).toEqual({ error: 'Internal Truv error' });
  });

  it('handles order without truv_order_id (returns DB data only)', async () => {
    db.createOrder({
      orderId: 'no-truv-id',
      userId: 'u-no-truv',
      status: 'created',
      rawResponse: { initial: true },
    });

    const { status, body } = await request('GET', '/api/orders/no-truv-id');

    expect(status).toBe(200);
    expect(body.order_id).toBe('no-truv-id');
    expect(body.status).toBe('created');
    expect(body.raw_response).toEqual({ initial: true });

    // No Truv call because truv_order_id is null
    expect(truv.getOrder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/:id/refresh
// ---------------------------------------------------------------------------
describe('POST /api/orders/:id/refresh', () => {
  it('refreshes order data from Truv', async () => {
    db.createOrder({
      orderId: 'refresh-1',
      truvOrderId: 'truv-refresh-1',
      userId: 'u-refresh',
      status: 'created',
    });

    truv.refreshOrder.mockResolvedValue({
      statusCode: 200,
      data: { status: 'refreshed', id: 'truv-refresh-1' },
      durationMs: 18,
    });

    const { status, body } = await request('POST', '/api/orders/refresh-1/refresh');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'refreshed', id: 'truv-refresh-1' });

    // Verify the Truv refreshOrder call
    expect(truv.refreshOrder).toHaveBeenCalledWith('truv-refresh-1');

    // Verify API call was logged
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-refresh',
        method: 'POST',
        endpoint: '/v1/orders/truv-refresh-1/refresh/',
      })
    );
  });

  it('returns 404 for non-existent order', async () => {
    const { status, body } = await request('POST', '/api/orders/ghost/refresh');

    expect(status).toBe(404);
    expect(body.error).toBe('Order not found');
  });

  it('returns 400 when order has no truv_order_id', async () => {
    db.createOrder({
      orderId: 'no-truv-refresh',
      status: 'created',
    });

    const { status, body } = await request('POST', '/api/orders/no-truv-refresh/refresh');

    expect(status).toBe(400);
    expect(body.error).toBe('No Truv order ID');
  });
});
