import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import renewalsRefreshRoutes from '../../../server/routes/renewals-refresh.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';

const servers = [];

function start(truvResponse) {
  const orders = { orig: { id: 'orig', truv_order_id: 't-orig', user_id: 'u1', product_type: 'income' } };
  const db = {
    getOrder: (id) => orders[id],
    generateId: () => 'refresh-1',
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    recordSessionUser: vi.fn(),
    getWebhookEventsByUserId: () => [],
  };
  const truv = { createRefreshOrder: vi.fn().mockResolvedValue({ requestBody: {}, durationMs: 5, ...truvResponse }) };
  const app = express();
  app.use(express.json());
  app.use(renewalsRefreshRoutes({ truv, db, apiLogger: createMockApiLogger() }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, truv, db }));
  });
}

async function post(ctx, orderId = 'orig', body = { products: ['income'] }) {
  const res = await fetch(`${ctx.baseUrl}/api/renewals/refresh/${orderId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise(r => s.close(r))));
});

describe('POST /api/renewals/refresh/:orderId error mapping', () => {
  it('creates a refresh order and persists it', async () => {
    const ctx = await start({ statusCode: 200, data: { id: 't-refresh', user_id: 'u1', bridge_token: 'bt', share_url: 'https://x/' } });
    const { status, json } = await post(ctx);
    expect(status).toBe(200);
    expect(json).toMatchObject({ order_id: 'refresh-1', original_order_id: 'orig', bridge_token: 'bt', share_url: 'https://x/', products: ['income'] });
    expect(ctx.truv.createRefreshOrder).toHaveBeenCalledWith('t-orig', expect.objectContaining({ products: ['income'] }));
    expect(ctx.db.createOrder).toHaveBeenCalled();
  });

  it('returns 404 for an order this demo does not know', async () => {
    const ctx = await start({ statusCode: 200, data: {} });
    const { status } = await post(ctx, 'nope');
    expect(status).toBe(404);
    expect(ctx.truv.createRefreshOrder).not.toHaveBeenCalled();
  });

  it('turns Truv\'s 429 into a clear cap message with the wait in hours', async () => {
    const ctx = await start({ statusCode: 429, data: { code: 'throttled', message: 'Order refresh limit exceeded Expected available in 86306 seconds.' } });
    const { status, json } = await post(ctx);
    expect(status).toBe(429);
    expect(json.error).toBe('refresh_cap_reached');
    expect(json.message).toMatch(/3 refreshes per 24 hours/);
    expect(json.message).toMatch(/connection/);
    expect(json.message).toMatch(/about 24 hours/);
    expect(json.retry_after).toBe(86306);
  });

  it('still returns a cap message when Truv gives no wait time', async () => {
    const ctx = await start({ statusCode: 429, data: {} });
    const { status, json } = await post(ctx);
    expect(status).toBe(429);
    expect(json.message).toMatch(/reached that limit/);
    expect(json.message).not.toMatch(/about/);
  });

  it('maps "Refresh already in progress" to a 409 with its own error code', async () => {
    const ctx = await start({ statusCode: 400, data: { error: { code: 'invalid', message: 'Refresh already in progress' } } });
    const { status, json } = await post(ctx);
    expect(status).toBe(409);
    expect(json.error).toBe('refresh_in_progress');
  });

  it('maps a too-early payroll refresh to a retryable 409', async () => {
    const data = { error: { extra: { 'invalid-params': [{ field: 'employers', message: 'Can not find any employers connected to refresh the data.' }] } } };
    const ctx = await start({ statusCode: 400, data });
    const { status, json } = await post(ctx);
    expect(status).toBe(409);
    expect(json.error).toBe('no_connections_yet');
  });

  it('maps a too-early bank refresh the same way', async () => {
    const data = { error: { extra: { 'invalid-params': [{ field: 'financial_accounts', message: 'Can not find any financial accounts connected to refresh the data.' }] } } };
    const ctx = await start({ statusCode: 400, data });
    const { status, json } = await post(ctx, 'orig', { products: ['assets'] });
    expect(status).toBe(409);
    expect(json.error).toBe('no_connections_yet');
  });

  it('passes any other Truv error through without creating an order', async () => {
    const ctx = await start({ statusCode: 400, data: { error: { code: 'invalid', message: 'something else' } } });
    const { status, json } = await post(ctx);
    expect(status).toBe(400);
    expect(json.error).toBe('Failed to create refresh order');
    expect(ctx.db.createOrder).not.toHaveBeenCalled();
  });
});
