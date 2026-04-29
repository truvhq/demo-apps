import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import { createMockApiLogger } from '../helpers/mock-api-logger.js';
import { generateWebhookSign } from '../../server/webhooks.js';
import {
  _setTestDb,
  initDb,
  createDocCollection,
  findDocCollectionUserForWebhook,
  createOrder,
  findOrderByUserId,
  updateOrder,
} from '../../server/db.js';

const TEST_SECRET = 'test-api-secret';

// Minimal replica of the real webhook handler in server/index.js. Mirrors the
// task-status-updated fallback that resolves user_id from document_collections
// when the Truv payload omits it.
function buildApp({ db, apiLogger }) {
  const app = express();
  app.use(express.json({
    limit: '100mb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); },
  }));

  app.post('/api/webhooks/truv', (req, res) => {
    // HMAC guard: reject unsigned or tampered requests up front
    const sigOk = (() => {
      const sig = req.headers['x-webhook-sign'];
      if (!sig) return false;
      return generateWebhookSign(req.rawBody, TEST_SECRET) === sig;
    })();
    if (!sigOk) return res.status(401).end();

    const payload = req.body;
    let userId = payload.user_id || null;

    if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
      const order = db.findOrderByUserId(userId);
      if (order) db.updateOrder(order.id, { status: 'completed' });
    }

    // Fallback for document-collection webhooks: Truv's task-status-updated
    // payload omits user_id, so resolve it from the active collection instead.
    if (!userId && payload.event_type === 'task-status-updated') {
      userId = db.findDocCollectionUserForWebhook();
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

  return app;
}

function startTestServer(dbModule) {
  const apiLogger = createMockApiLogger();
  const app = buildApp({ db: dbModule, apiLogger });
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, apiLogger });
    });
    server.on('error', reject);
  });
}

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

async function postWebhook(baseUrl, payload) {
  const body = JSON.stringify(payload);
  return fetch(`${baseUrl}/api/webhooks/truv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-sign': generateWebhookSign(body, TEST_SECRET),
    },
    body,
  });
}

// In-memory DB shared across all tests. Cleaned between each test so state
// from one test can't leak into the next.
let memDb;
const dbModule = {
  findOrderByUserId,
  updateOrder,
  findDocCollectionUserForWebhook,
};

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
  memDb.prepare('DELETE FROM document_collections').run();
});

// ─── task-status-updated user_id fallback ───────────────────────────────────
//
// Bug: Truv's task-status-updated webhooks for document collections arrive with
// no user_id in the payload, so the frontend polling (GET /api/users/:id/webhooks)
// could never see them. The server now resolves user_id from the active
// document_collections row.

describe('POST /api/webhooks/truv — task-status-updated fallback', () => {
  it('resolves user_id from document_collections when the payload omits it', async () => {
    createDocCollection({
      collectionId: 'dc_resolve',
      userId: 'user_resolved',
      status: 'created',
    });

    const ctx = await startTestServer(dbModule);
    try {
      const res = await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_1',
        event_type: 'task-status-updated',
        status: 'done',
        // user_id intentionally omitted
      });
      expect(res.status).toBe(200);

      const events = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user_resolved');
      expect(events[0].eventType).toBe('task-status-updated');
      expect(events[0].status).toBe('done');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('keeps the payload user_id when present and does not fall back to the DB', async () => {
    // If both are present, the payload wins. This guards against a regression
    // where the fallback clobbers an explicit user_id.
    createDocCollection({
      collectionId: 'dc_bg',
      userId: 'user_from_db',
      status: 'created',
    });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_2',
        event_type: 'task-status-updated',
        status: 'done',
        user_id: 'user_from_payload',
      });

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBe('user_from_payload');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('stores the webhook with null userId when no active collection exists', async () => {
    // Previously this caused the event to be effectively invisible. It should
    // still be persisted so it appears in operator logs, just with null userId.
    const ctx = await startTestServer(dbModule);
    try {
      const res = await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_3',
        event_type: 'task-status-updated',
        status: 'done',
      });
      expect(res.status).toBe(200);

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBeNull();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('does not use the fallback for non task-status-updated events', async () => {
    // link-connected and other event types must not fall through to the DB lookup.
    createDocCollection({
      collectionId: 'dc_noleak',
      userId: 'user_doc',
      status: 'created',
    });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_4',
        event_type: 'link-connected',
        status: null,
      });

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBeNull();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('picks the most recent active collection when two overlap', async () => {
    // Known single-session limitation. Pin the behavior so any future fix
    // (correlating by collection_id in the payload) is a deliberate change.
    createDocCollection({ collectionId: 'dc_first', userId: 'user_first', status: 'created' });
    memDb.prepare(
      "UPDATE document_collections SET created_at = datetime('now', '-10 seconds') WHERE id = 'dc_first'",
    ).run();
    createDocCollection({ collectionId: 'dc_second', userId: 'user_second', status: 'finalizing' });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_5',
        event_type: 'task-status-updated',
        status: 'done',
      });

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBe('user_second');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('rejects unsigned webhooks before any DB lookup happens', async () => {
    createDocCollection({
      collectionId: 'dc_sig',
      userId: 'user_sig',
      status: 'created',
    });

    const ctx = await startTestServer(dbModule);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'task-status-updated', status: 'done' }),
      });
      expect(res.status).toBe(401);
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();
    } finally {
      await closeServer(ctx.server);
    }
  });
});
