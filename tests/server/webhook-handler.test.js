import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import { createMockApiLogger } from '../helpers/mock-api-logger.js';
import { generateWebhookSign } from '../../server/webhooks.js';
import {
  _setTestDb,
  initDb,
  insertWebhookEvent,
  findUserByLinkInEvents,
  findOrderByUserId,
  updateOrder,
} from '../../server/db.js';

const TEST_SECRET = 'test-api-secret';

// Minimal replica of the real webhook handler in server/index.js. Mirrors the
// link_id-based resolver: task-status-updated events arrive without user_id
// but include link_id, and prior events for the same link (link-connected,
// statements-created, etc.) seed the resolution via webhook_events.
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
  findUserByLinkInEvents,
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

// ─── task-status-updated user_id resolution by link_id ──────────────────────
//
// Bug: Truv's task-status-updated webhooks for document collections arrive with
// no user_id in the payload, so the frontend polling (GET /api/users/:id/webhooks)
// could never see them. The server resolves user_id from prior webhook_events
// for the same link_id (link-connected, statements-created, etc. arrive earlier
// with both fields).

describe('POST /api/webhooks/truv — task-status-updated link_id resolution', () => {
  it('resolves user_id from a prior webhook event with the same link_id', async () => {
    // Seed: an earlier webhook for the link that did carry user_id.
    insertWebhookEvent({
      userId: 'user_resolved',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_resolved' },
    });

    const ctx = await startTestServer(dbModule);
    try {
      const res = await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_task',
        event_type: 'task-status-updated',
        status: 'done',
        link_id: 'lnk_a',
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

  it('keeps the payload user_id when present and does not look it up', async () => {
    // If both are present, the payload wins — guards against the resolver
    // clobbering an explicit user_id with a stale event.
    insertWebhookEvent({
      userId: 'user_from_seed',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_from_seed' },
    });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_task',
        event_type: 'task-status-updated',
        status: 'done',
        user_id: 'user_from_payload',
        link_id: 'lnk_a',
      });

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBe('user_from_payload');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('stores the webhook with null userId when no prior event exists for the link', async () => {
    // Cold start: a task-status-updated arrives before any seeding event.
    // The event is still persisted but with null userId — operator logs only.
    const ctx = await startTestServer(dbModule);
    try {
      const res = await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_cold',
        event_type: 'task-status-updated',
        status: 'done',
        link_id: 'lnk_unknown',
      });
      expect(res.status).toBe(200);

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBeNull();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('stores the webhook with null userId when link_id is missing entirely', async () => {
    // Without link_id there is nothing to resolve against.
    insertWebhookEvent({
      userId: 'user_a',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_a' },
    });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_nolink',
        event_type: 'task-status-updated',
        status: 'done',
      });

      const [event] = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      expect(event.userId).toBeNull();
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('keeps overlapping sessions separated by their own link_ids', async () => {
    // Two concurrent doc-collection sessions each seed their own link_id,
    // and later task-status-updated events resolve to the right user.
    // The previous "latest collection" heuristic would have collapsed them.
    insertWebhookEvent({
      userId: 'user_a',
      webhookId: 'wh_seed_a',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_a' },
    });
    insertWebhookEvent({
      userId: 'user_b',
      webhookId: 'wh_seed_b',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_b', user_id: 'user_b' },
    });

    const ctx = await startTestServer(dbModule);
    try {
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_task_a',
        event_type: 'task-status-updated',
        status: 'done',
        link_id: 'lnk_a',
      });
      await postWebhook(ctx.baseUrl, {
        webhook_id: 'wh_task_b',
        event_type: 'task-status-updated',
        status: 'done',
        link_id: 'lnk_b',
      });

      const events = ctx.apiLogger.pushWebhookEvent.mock.calls.map(args => args[0]);
      const taskA = events.find(e => e.webhookId === 'wh_task_a');
      const taskB = events.find(e => e.webhookId === 'wh_task_b');
      expect(taskA.userId).toBe('user_a');
      expect(taskB.userId).toBe('user_b');
    } finally {
      await closeServer(ctx.server);
    }
  });

  it('rejects unsigned webhooks before any resolution happens', async () => {
    insertWebhookEvent({
      userId: 'user_a',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_a' },
    });

    const ctx = await startTestServer(dbModule);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/webhooks/truv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'task-status-updated', status: 'done', link_id: 'lnk_a' }),
      });
      expect(res.status).toBe(401);
      expect(ctx.apiLogger.pushWebhookEvent).not.toHaveBeenCalled();
    } finally {
      await closeServer(ctx.server);
    }
  });
});
