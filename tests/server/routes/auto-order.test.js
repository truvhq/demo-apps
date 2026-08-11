import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import * as db from '../../../server/db.js';
import autoOrderRoutes from '../../../server/routes/auto-order.js';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';

let memDb;
let apiLogger;

function request(baseUrl, method, path, body) {
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

async function startServer(routerOpts) {
  const app = express();
  app.use(express.json());
  app.use(autoOrderRoutes(routerOpts));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const addr = server.address();
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

beforeAll(() => {
  memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');
  db._setTestDb(memDb);
  db.initDb();
});

afterAll(() => {
  memDb.close();
});

beforeEach(() => {
  memDb.prepare('DELETE FROM orders').run();
  memDb.prepare('DELETE FROM api_logs').run();
  apiLogger = createMockApiLogger();
});

describe('POST /api/auto-order', () => {
  it('is not registered when no truv client is configured', async () => {
    const { server, baseUrl } = await startServer({ truv: null, db, apiLogger });
    try {
      const { status } = await request(baseUrl, 'POST', '/api/auto-order', {});
      expect(status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('creates an order with the fixed client and returns the same shape as /api/orders', async () => {
    const truv = createMockTruv({
      createOrder: {
        data: {
          id: 'truv-order-auto',
          user_id: 'truv-user-auto',
          bridge_token: 'bt_auto',
          share_url: 'https://share.truv.com/auto',
          status: 'created',
        },
        requestBody: { product_type: 'income' },
      },
    });
    const { server, baseUrl } = await startServer({ truv, db, apiLogger });

    try {
      const { status, body } = await request(baseUrl, 'POST', '/api/auto-order', {
        first_name: 'Auto', last_name: 'Order', product_type: 'income',
      });

      expect(status).toBe(200);
      expect(body.truv_order_id).toBe('truv-order-auto');
      expect(body.user_id).toBe('truv-user-auto');
      expect(body.bridge_token).toBe('bt_auto');
      expect(body.order_id).toBeTruthy();

      const dbOrder = db.getOrder(body.order_id);
      expect(dbOrder).not.toBeNull();
      expect(dbOrder.truv_order_id).toBe('truv-order-auto');

      expect(truv.createOrder).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns the Truv error status when order creation fails', async () => {
    const truv = createMockTruv({
      createOrder: { statusCode: 422, data: { error: 'Invalid SSN format' } },
    });
    const { server, baseUrl } = await startServer({ truv, db, apiLogger });

    try {
      const { status, body } = await request(baseUrl, 'POST', '/api/auto-order', { ssn: 'not-valid' });
      expect(status).toBe(422);
      expect(body.error).toBe('Truv API error');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('rate limits by IP once the configured max is exceeded', async () => {
    const truv = createMockTruv({
      createOrder: { data: { id: 't1', user_id: 'u1', bridge_token: 'bt', status: 'created' } },
    });
    const { server, baseUrl } = await startServer({ truv, db, apiLogger, rateLimitMax: 2, rateLimitWindowMs: 60_000 });

    try {
      const first = await request(baseUrl, 'POST', '/api/auto-order', {});
      const second = await request(baseUrl, 'POST', '/api/auto-order', {});
      const third = await request(baseUrl, 'POST', '/api/auto-order', {});

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.body.error).toBe('rate_limited');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
