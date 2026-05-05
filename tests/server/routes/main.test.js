import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';
import { verifyWebhookSignature, generateWebhookSign } from '../../../server/webhooks.js';
import {
  _setTestDb,
  initDb,
  createOrder,
  findOrderByUserId,
  getOrder,
  getWebhookEventsByUserId,
  insertWebhookEvent,
  insertApiLog,
  getApiLogsByUserId,
} from '../../../server/db.js';

const TEST_SECRET = 'test-api-secret';

/**
 * Build a mini Express app that replicates the inline routes from server/index.js,
 * wired to the provided mock dependencies. This avoids importing the full
 * server/index.js which connects to the real DB and calls process.exit.
 */
function buildApp({ truv, apiLogger, db }) {
  const app = express();

  // Mirror the body parser from index.js: capture rawBody for HMAC verification.
  app.use(express.json({
    limit: '100mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  }));

  // --- Company search ---
  app.get('/api/companies', async (req, res) => {
    try {
      const query = req.query.q;
      if (!query) return res.json([]);
      const result = await truv.searchCompanies(query, req.query.product_type);
      apiLogger.logApiCall({
        sessionId: req.query.session_id,
        method: 'GET',
        endpoint: `/v1/company-mappings-search/?query=${query}`,
        responseBody: result.data,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
      });
      res.json(result.data || []);
    } catch (err) {
      res.json([]);
    }
  });

  // --- Provider search ---
  app.get('/api/providers', async (req, res) => {
    try {
      const query = req.query.q;
      if (!query) return res.json([]);
      const result = await truv.searchProviders(query, req.query.product_type, req.query.data_source);
      apiLogger.logApiCall({
        sessionId: req.query.session_id,
        method: 'GET',
        endpoint: `/v1/providers/?query=${query}`,
        responseBody: result.data,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
      });
      const data = result.data?.results || result.data || [];
      res.json(Array.isArray(data) ? data : []);
    } catch (err) {
      res.json([]);
    }
  });

  // --- Webhook receiver ---
  app.post('/api/webhooks/truv', (req, res) => {
    const sigMatch = verifyWebhookSignature(req.rawBody, TEST_SECRET, req.headers['x-webhook-sign']);
    if (!sigMatch) return res.status(401).end();

    const payload = req.body;
    const userId = payload.user_id || null;

    if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
      const order = db.findOrderByUserId(userId);
      if (order) db.updateOrder(order.id, { status: 'completed' });
    }

    apiLogger.pushWebhookEvent({
      userId,
      webhookId: payload.webhook_id,
      eventType: payload.event_type,
      status: payload.status,
      payload,
    });
    res.status(200).end();
  });

  // --- Polling endpoints ---
  app.get('/api/users/:userId/webhooks', (req, res) => {
    res.json(db.getWebhookEventsByUserId(req.params.userId));
  });

  app.get('/api/users/:userId/logs', (req, res) => {
    res.json(db.getApiLogsByUserId(req.params.userId, req.query.session_id));
  });

  return app;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function startTestServer({ truvOverrides = {}, dbModule } = {}) {
  const truv = createMockTruv(truvOverrides);
  const apiLogger = createMockApiLogger();
  const app = buildApp({ truv, apiLogger, db: dbModule });

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, truv, apiLogger });
    });
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

/**
 * Sign a JSON body with the test secret, matching the HMAC approach in webhooks.js.
 */
function signBody(bodyStr) {
  return generateWebhookSign(bodyStr, TEST_SECRET);
}

// ---------------------------------------------------------------------------
// In-memory DB for integration-style polling tests
// ---------------------------------------------------------------------------

let memDb;

beforeAll(() => {
  memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');
  _setTestDb(memDb);
  initDb();
});

afterAll(() => {
  memDb.close();
});

beforeEach(() => {
  memDb.prepare('DELETE FROM orders').run();
  memDb.prepare('DELETE FROM api_logs').run();
  memDb.prepare('DELETE FROM webhook_events').run();
});

// The db module reference used by the test server (real functions from db.js,
// backed by the in-memory DB we swapped in).
const dbModule = {
  findOrderByUserId,
  updateOrder: (await import('../../../server/db.js')).updateOrder,
  getWebhookEventsByUserId,
  getApiLogsByUserId,
};

// ===========================================================================
// GET /api/companies
// ===========================================================================

describe('GET /api/companies', () => {
  describe('happy path: query returns results', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        truvOverrides: {
          searchCompanies: {
            statusCode: 200,
            data: [
              { id: 'c1', name: 'Acme Corp' },
              { id: 'c2', name: 'Acme Inc' },
            ],
            durationMs: 15,
          },
        },
        dbModule,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns the matching companies array', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/api/companies?q=Acme&session_id=sess_1&product_type=income`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
        { id: 'c1', name: 'Acme Corp' },
        { id: 'c2', name: 'Acme Inc' },
      ]);
    });

    it('calls truv.searchCompanies with the query and product_type', () => {
      expect(ctx.truv.searchCompanies).toHaveBeenCalledWith('Acme', 'income');
    });

    it('logs the API call with session_id', () => {
      const call = ctx.apiLogger.logApiCall.mock.calls.find(
        ([arg]) => arg.endpoint.includes('company-mappings-search'),
      );
      expect(call).toBeDefined();
      expect(call[0].sessionId).toBe('sess_1');
      expect(call[0].method).toBe('GET');
      expect(call[0].statusCode).toBe(200);
      expect(call[0].durationMs).toBe(15);
    });
  });

  describe('edge case: empty query returns []', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns an empty array when q is missing', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/companies`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('does not call truv.searchCompanies', () => {
      expect(ctx.truv.searchCompanies).not.toHaveBeenCalled();
    });
  });

  describe('error path: searchCompanies throws', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        truvOverrides: {
          searchCompanies: vi.fn().mockRejectedValue(new Error('network error')),
        },
        dbModule,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns [] on error', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/companies?q=Fail`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });
});

// ===========================================================================
// GET /api/providers
// ===========================================================================

describe('GET /api/providers', () => {
  describe('happy path: query with data_source returns results', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        truvOverrides: {
          searchProviders: {
            statusCode: 200,
            data: {
              results: [
                { id: 'p1', name: 'Chase' },
                { id: 'p2', name: 'Chase Online' },
              ],
            },
            durationMs: 20,
          },
        },
        dbModule,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns the results array from data.results', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/api/providers?q=Chase&product_type=income&data_source=payroll&session_id=sess_p`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
        { id: 'p1', name: 'Chase' },
        { id: 'p2', name: 'Chase Online' },
      ]);
    });

    it('calls truv.searchProviders with query, product_type, and data_source', () => {
      expect(ctx.truv.searchProviders).toHaveBeenCalledWith('Chase', 'income', 'payroll');
    });

    it('logs the API call with session_id', () => {
      const call = ctx.apiLogger.logApiCall.mock.calls.find(
        ([arg]) => arg.endpoint.includes('providers'),
      );
      expect(call).toBeDefined();
      expect(call[0].sessionId).toBe('sess_p');
      expect(call[0].method).toBe('GET');
      expect(call[0].statusCode).toBe(200);
    });
  });

  describe('response without results wrapper (plain array)', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        truvOverrides: {
          searchProviders: {
            statusCode: 200,
            data: [{ id: 'p3', name: 'Wells Fargo' }],
            durationMs: 5,
          },
        },
        dbModule,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns the data array directly when there is no results wrapper', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/providers?q=Wells`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: 'p3', name: 'Wells Fargo' }]);
    });
  });

  describe('empty query returns []', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns an empty array when q is missing', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/providers`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('does not call truv.searchProviders', () => {
      expect(ctx.truv.searchProviders).not.toHaveBeenCalled();
    });
  });

  describe('error path: searchProviders throws', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        truvOverrides: {
          searchProviders: vi.fn().mockRejectedValue(new Error('boom')),
        },
        dbModule,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns [] on error', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/providers?q=Fail`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });
});

// ===========================================================================
// POST /api/webhooks/truv
// ===========================================================================

describe('POST /api/webhooks/truv', () => {
  describe('happy path: valid HMAC stores webhook event', () => {
    let ctx;
    let res;
    const webhookPayload = {
      event_type: 'task-status-updated',
      status: 'completed',
      user_id: 'user_wh_1',
      webhook_id: 'wh_abc',
    };
    const bodyStr = JSON.stringify(webhookPayload);

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
      res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Sign': signBody(bodyStr),
        },
        body: bodyStr,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns 200', () => {
      expect(res.status).toBe(200);
    });

    it('calls apiLogger.pushWebhookEvent with correct fields', () => {
      expect(ctx.apiLogger.pushWebhookEvent).toHaveBeenCalledWith({
        userId: 'user_wh_1',
        webhookId: 'wh_abc',
        eventType: 'task-status-updated',
        status: 'completed',
        payload: webhookPayload,
      });
    });
  });

  describe('happy path: order-status-updated:completed updates order status', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('marks the order as completed', async () => {
      // Seed the order inside the test so it survives the beforeEach cleanup.
      createOrder({ orderId: 'ord_wh_test', userId: 'user_wh_2', status: 'pending' });

      const webhookPayload = {
        event_type: 'order-status-updated',
        status: 'completed',
        user_id: 'user_wh_2',
        webhook_id: 'wh_order',
      };
      const bodyStr = JSON.stringify(webhookPayload);

      const res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Sign': signBody(bodyStr),
        },
        body: bodyStr,
      });

      expect(res.status).toBe(200);

      const order = getOrder('ord_wh_test');
      expect(order.status).toBe('completed');
    });
  });

  describe('error path: invalid HMAC returns 401', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
      const bodyStr = JSON.stringify({ event_type: 'test', user_id: 'u1' });

      res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Sign': 'v1=invalidsignature000000000000000000000000000000000000000000000000',
        },
        body: bodyStr,
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns 401', () => {
      expect(res.status).toBe(401);
    });

    it('does not call apiLogger.pushWebhookEvent', () => {
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('error path: missing signature header returns 401', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({ dbModule });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns 401 when X-Webhook-Sign is absent', async () => {
      const bodyStr = JSON.stringify({ event_type: 'test' });
      const res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });
      expect(res.status).toBe(401);
    });
  });
});

// ===========================================================================
// GET /api/users/:id/webhooks
// ===========================================================================

describe('GET /api/users/:id/webhooks', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await startTestServer({ dbModule });
  });

  afterAll(async () => {
    await closeServer(ctx.server);
  });

  it('returns webhook events for the given user', async () => {
    // Seed webhook events into the in-memory DB
    insertWebhookEvent({ userId: 'poll_user_1', webhookId: 'wh_1', eventType: 'task-status-updated', status: 'done', payload: { a: 1 } });
    insertWebhookEvent({ userId: 'poll_user_1', webhookId: 'wh_2', eventType: 'order-status-updated', status: 'completed', payload: { b: 2 } });
    // Different user; should not appear
    insertWebhookEvent({ userId: 'other_user', webhookId: 'wh_3', eventType: 'test', status: 'ok', payload: null });

    const res = await fetch(`${ctx.baseUrl}/api/users/poll_user_1/webhooks`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].webhook_id).toBe('wh_1');
    expect(body[1].webhook_id).toBe('wh_2');
  });

  it('returns an empty array for a user with no webhook events', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/users/no_such_user/webhooks`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ===========================================================================
// GET /api/users/:id/logs
// ===========================================================================

describe('GET /api/users/:id/logs', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await startTestServer({ dbModule });
  });

  afterAll(async () => {
    await closeServer(ctx.server);
  });

  it('returns API logs for the given user', async () => {
    insertApiLog({ userId: 'log_user_1', sessionId: 'sess_a', method: 'POST', endpoint: '/v1/orders/' });
    insertApiLog({ userId: 'log_user_1', sessionId: 'sess_a', method: 'GET', endpoint: '/v1/orders/123' });
    // Different user
    insertApiLog({ userId: 'someone_else', sessionId: 'sess_b', method: 'GET', endpoint: '/v1/other' });

    const res = await fetch(`${ctx.baseUrl}/api/users/log_user_1/logs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].endpoint).toBe('/v1/orders/');
    expect(body[1].endpoint).toBe('/v1/orders/123');
  });

  it('includes session-scoped (pre-order) logs when session_id is provided', async () => {
    insertApiLog({ userId: 'log_user_2', sessionId: 'sess_c', method: 'POST', endpoint: '/v1/orders/' });
    // Session-scoped log (no userId) that belongs to the same session
    insertApiLog({ userId: null, sessionId: 'sess_c', method: 'GET', endpoint: '/v1/company-mappings-search/' });

    const res = await fetch(`${ctx.baseUrl}/api/users/log_user_2/logs?session_id=sess_c`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    const endpoints = body.map((l) => l.endpoint);
    expect(endpoints).toContain('/v1/orders/');
    expect(endpoints).toContain('/v1/company-mappings-search/');
  });

  it('returns an empty array for a user with no logs', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/users/no_logs_user/logs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
