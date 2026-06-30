/**
 * Isolation tests for the per-session webhook receiver. Each session's webhook
 * must verify signatures using *that* session's secret only — a webhook signed
 * with session A's secret must be rejected at session B's URL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';
import { generateWebhookSign, verifyWebhookSignature } from '../../../server/webhooks.js';
import { createSessionStore } from '../../../server/sessions/store.js';
import {
  _setTestDb,
  initDb,
  insertWebhookEvent,
  findUserByLinkInEvents,
  findOrderByUserId,
  updateOrder,
  createOrder,
  getOrder,
} from '../../../server/db.js';

/**
 * Mini test app that mirrors the per-session webhook routing in server/index.js.
 */
function buildApp({ store, db, apiLogger }) {
  const app = express();
  app.use(express.json({
    limit: '100mb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); },
  }));

  app.post('/api/webhooks/truv/:sessionId', (req, res) => {
    const session = store.get(req.params.sessionId);
    if (!session) return res.status(404).end();

    const sigOk = verifyWebhookSignature(req.rawBody, session.secret, req.headers['x-webhook-sign']);
    if (!sigOk) return res.status(401).end();

    const payload = req.body;
    let userId = payload.user_id || null;
    const linkId = payload.link_id || null;

    if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
      const order = db.findOrderByUserId(userId);
      if (order) db.updateOrder(order.id, { status: 'completed' });
    }
    if (!userId && linkId) userId = db.findUserByLinkInEvents(linkId);

    apiLogger.pushWebhookEvent({
      userId,
      webhookId: payload.webhook_id,
      eventType: payload.event_type,
      status: payload.status,
      payload,
    });
    res.status(200).end();
  });

  return app;
}

function startTestServer(store) {
  const apiLogger = createMockApiLogger();
  const db = { findOrderByUserId, updateOrder, findUserByLinkInEvents };
  const app = buildApp({ store, db, apiLogger });
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, apiLogger });
    });
    server.on('error', reject);
  });
}

const closeServer = (server) => new Promise(r => server.close(r));

async function postWebhook(baseUrl, sessionId, signingSecret, payload) {
  const body = JSON.stringify(payload);
  return fetch(`${baseUrl}/api/webhooks/truv/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-sign': generateWebhookSign(body, signingSecret),
    },
    body,
  });
}

let memDb;
beforeAll(() => {
  memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');
  _setTestDb(memDb);
  initDb();
});
afterAll(() => memDb.close());
beforeEach(() => {
  memDb.prepare('DELETE FROM orders').run();
  memDb.prepare('DELETE FROM api_logs').run();
  memDb.prepare('DELETE FROM webhook_events').run();
});

describe('POST /api/webhooks/truv/:sessionId — happy path', () => {
  it('verifies with the session secret and stores the event', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sid = store.create({ clientId: 'cidA', secret: 'sec_session_A' });

    const ctx = await startTestServer(store);
    try {
      const res = await postWebhook(ctx.baseUrl, sid, 'sec_session_A', {
        event_type: 'task-status-updated',
        status: 'done',
        user_id: 'user_1',
        webhook_id: 'wh_evt_1',
      });
      expect(res.status).toBe(200);
      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBe('user_1');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('order-status-updated:completed marks the order as completed', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sid = store.create({ clientId: 'cidA', secret: 'sec_session_A' });
    createOrder({ orderId: 'ord_session', userId: 'user_X', status: 'pending' });

    const ctx = await startTestServer(store);
    try {
      const res = await postWebhook(ctx.baseUrl, sid, 'sec_session_A', {
        event_type: 'order-status-updated',
        status: 'completed',
        user_id: 'user_X',
      });
      expect(res.status).toBe(200);
      expect(getOrder('ord_session').status).toBe('completed');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('resolves user_id from link_id via prior events', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sid = store.create({ clientId: 'cidA', secret: 'sec_session_A' });
    insertWebhookEvent({
      userId: 'user_link',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_z', user_id: 'user_link' },
    });

    const ctx = await startTestServer(store);
    try {
      await postWebhook(ctx.baseUrl, sid, 'sec_session_A', {
        event_type: 'task-status-updated',
        status: 'done',
        link_id: 'lnk_z',
      });
      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBe('user_link');
    } finally {
      await closeServer(ctx.server);
    }
  });
});

describe('POST /api/webhooks/truv/:sessionId — isolation and rejection', () => {
  it('returns 404 for an unknown session id and does not consult the store for verification', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const ctx = await startTestServer(store);
    try {
      const res = await postWebhook(ctx.baseUrl, 'unknown-sid', 'any-secret', {
        event_type: 'task-status-updated',
      });
      expect(res.status).toBe(404);
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('rejects a signature signed with a different sessions secret', async () => {
    // CRITICAL: a webhook signed by session A's secret must never be accepted
    // at session B's URL. This is the multi-tenant isolation guarantee.
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sidA = store.create({ clientId: 'cidA', secret: 'sec_A' });
    const sidB = store.create({ clientId: 'cidB', secret: 'sec_B' });

    const ctx = await startTestServer(store);
    try {
      const res = await postWebhook(ctx.baseUrl, sidB, 'sec_A', {
        event_type: 'task-status-updated',
        status: 'done',
        user_id: 'user_1',
      });
      expect(res.status).toBe(401);
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();

      // Sanity: the same payload signed correctly for B does succeed
      const res2 = await postWebhook(ctx.baseUrl, sidB, 'sec_B', {
        event_type: 'task-status-updated',
        status: 'done',
        user_id: 'user_1',
      });
      expect(res2.status).toBe(200);
      expect(ctx.apiLogger.pushWebhookEvent).toHaveBeenCalledOnce();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('rejects a request with no signature header', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sid = store.create({ clientId: 'c', secret: 's' });
    const ctx = await startTestServer(store);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/webhooks/truv/${sid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 't' }),
      });
      expect(res.status).toBe(401);
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('returns 404 once a session is destroyed even if the signature would have been valid', async () => {
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sid = store.create({ clientId: 'c', secret: 'sec_gone' });
    store.destroy(sid);

    const ctx = await startTestServer(store);
    try {
      const res = await postWebhook(ctx.baseUrl, sid, 'sec_gone', { event_type: 't' });
      expect(res.status).toBe(404);
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('keeps two concurrent sessions separated end-to-end', async () => {
    // Two customers, two webhooks. Each session sees only its own event.
    const store = createSessionStore({ idleTtlMs: 60_000 });
    const sidA = store.create({ clientId: 'cidA', secret: 'sec_A' });
    const sidB = store.create({ clientId: 'cidB', secret: 'sec_B' });

    const ctx = await startTestServer(store);
    try {
      await postWebhook(ctx.baseUrl, sidA, 'sec_A', {
        event_type: 'task-status-updated', status: 'done', user_id: 'user_A', webhook_id: 'wh_A',
      });
      await postWebhook(ctx.baseUrl, sidB, 'sec_B', {
        event_type: 'task-status-updated', status: 'done', user_id: 'user_B', webhook_id: 'wh_B',
      });

      const events = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(events).toHaveLength(2);
      const a = events.find(e => e.webhookId === 'wh_A');
      const b = events.find(e => e.webhookId === 'wh_B');
      expect(a.userId).toBe('user_A');
      expect(b.userId).toBe('user_B');
    } finally {
      await closeServer(ctx.server);
    }
  });
});
