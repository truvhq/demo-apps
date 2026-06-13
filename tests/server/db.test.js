import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  _setTestDb,
  initDb,
  generateId,
  createOrder,
  getOrder,
  updateOrder,
  findOrderByUserId,
  getOrdersByDemoId,
  getAllOrders,
  insertApiLog,
  getApiLogsByUserId,
  insertWebhookEvent,
  getWebhookEventsByUserId,
  upsertReport,
  getReport,
  createDocCollection,
  getDocCollection,
  updateDocCollection,
  findUserByLinkInEvents,
} from '../../server/db.js';

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
  // Clean all tables between tests for isolation
  memDb.prepare('DELETE FROM orders').run();
  memDb.prepare('DELETE FROM api_logs').run();
  memDb.prepare('DELETE FROM webhook_events').run();
  memDb.prepare('DELETE FROM reports').run();
  memDb.prepare('DELETE FROM document_collections').run();
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------
describe('generateId', () => {
  it('returns a 12-character hex string', () => {
    const id = generateId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('produces unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Orders CRUD
// ---------------------------------------------------------------------------
describe('orders', () => {
  it('createOrder + getOrder round-trips all fields', () => {
    const params = {
      orderId: 'ord_001',
      truvOrderId: 'truv_abc',
      userId: 'user_1',
      demoId: 'demo_income',
      bridgeToken: 'bt_xyz',
      shareUrl: 'https://example.com/share',
      status: 'pending',
      rawResponse: { foo: 'bar' },
    };

    const created = createOrder(params);
    expect(created.id).toBe('ord_001');
    expect(created.truv_order_id).toBe('truv_abc');
    expect(created.user_id).toBe('user_1');
    expect(created.demo_id).toBe('demo_income');
    expect(created.bridge_token).toBe('bt_xyz');
    expect(created.share_url).toBe('https://example.com/share');
    expect(created.status).toBe('pending');
    expect(JSON.parse(created.raw_response)).toEqual({ foo: 'bar' });
    expect(created.created_at).toBeTruthy();

    const fetched = getOrder('ord_001');
    expect(fetched).toEqual(created);
  });

  it('createOrder uses default status "created" when omitted', () => {
    const created = createOrder({ orderId: 'ord_def' });
    expect(created.status).toBe('created');
  });

  it('getOrder returns null for non-existent id', () => {
    expect(getOrder('does_not_exist')).toBeNull();
  });

  it('updateOrder changes status, and getOrder reflects update', () => {
    createOrder({ orderId: 'ord_upd', status: 'created' });
    updateOrder('ord_upd', { status: 'completed' });

    const fetched = getOrder('ord_upd');
    expect(fetched.status).toBe('completed');
  });

  it('updateOrder serializes object values to JSON', () => {
    createOrder({ orderId: 'ord_json' });
    updateOrder('ord_json', { raw_response: { result: 42 } });

    const fetched = getOrder('ord_json');
    expect(JSON.parse(fetched.raw_response)).toEqual({ result: 42 });
  });

  it('updateOrder ignores disallowed columns', () => {
    createOrder({ orderId: 'ord_no', userId: 'u1' });
    // user_id is not in the allowlist, so this should be a no-op
    updateOrder('ord_no', { user_id: 'u2' });

    const fetched = getOrder('ord_no');
    expect(fetched.user_id).toBe('u1');
  });

  it('updateOrder with only disallowed keys does nothing (returns undefined)', () => {
    createOrder({ orderId: 'ord_noop' });
    const result = updateOrder('ord_noop', { id: 'hacked' });
    expect(result).toBeUndefined();
  });

  it('findOrderByUserId returns most recent order', () => {
    // Insert two orders for the same user with different created_at values
    memDb.prepare(
      "INSERT INTO orders (id, user_id, status, created_at) VALUES (?, ?, ?, ?)"
    ).run('ord_old', 'user_find', 'old', '2024-01-01 00:00:00');
    memDb.prepare(
      "INSERT INTO orders (id, user_id, status, created_at) VALUES (?, ?, ?, ?)"
    ).run('ord_new', 'user_find', 'new', '2024-06-01 00:00:00');

    const found = findOrderByUserId('user_find');
    expect(found.id).toBe('ord_new');
    expect(found.status).toBe('new');
  });

  it('findOrderByUserId returns null when user has no orders', () => {
    expect(findOrderByUserId('ghost_user')).toBeNull();
  });

  it('getOrdersByDemoId filters by demo_id', () => {
    createOrder({ orderId: 'od1', demoId: 'demo_a' });
    createOrder({ orderId: 'od2', demoId: 'demo_a' });
    createOrder({ orderId: 'od3', demoId: 'demo_b' });

    const results = getOrdersByDemoId('demo_a');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual(['od1', 'od2']);
  });

  it('getOrdersByDemoId returns empty array when no match', () => {
    expect(getOrdersByDemoId('nonexistent_demo')).toEqual([]);
  });

  it('getAllOrders returns every order', () => {
    createOrder({ orderId: 'all1' });
    createOrder({ orderId: 'all2' });
    createOrder({ orderId: 'all3' });

    expect(getAllOrders()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// API Logs
// ---------------------------------------------------------------------------
describe('api logs', () => {
  it('insertApiLog + getApiLogsByUserId round-trips', () => {
    const log = insertApiLog({
      userId: 'u_log',
      sessionId: 'sess_1',
      method: 'POST',
      endpoint: '/api/orders',
      requestBody: '{"a":1}',
      responseBody: '{"b":2}',
      statusCode: 200,
      durationMs: 42.5,
    });

    expect(log.user_id).toBe('u_log');
    expect(log.session_id).toBe('sess_1');
    expect(log.method).toBe('POST');
    expect(log.endpoint).toBe('/api/orders');
    expect(log.request_body).toBe('{"a":1}');
    expect(log.response_body).toBe('{"b":2}');
    expect(log.status_code).toBe(200);
    expect(log.duration_ms).toBe(42.5);

    const logs = getApiLogsByUserId('u_log');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(log);
  });

  it('getApiLogsByUserId with sessionId returns user logs + session-only logs', () => {
    // User-scoped log (has userId)
    insertApiLog({ userId: 'u_combo', sessionId: 'sess_x', method: 'GET', endpoint: '/a' });
    // Session-scoped log (no userId, same session)
    insertApiLog({ userId: null, sessionId: 'sess_x', method: 'GET', endpoint: '/b' });
    // Unrelated log (different user, different session)
    insertApiLog({ userId: 'other', sessionId: 'sess_y', method: 'GET', endpoint: '/c' });
    // Session-scoped log with a different session (should not be returned)
    insertApiLog({ userId: null, sessionId: 'sess_y', method: 'GET', endpoint: '/d' });

    const results = getApiLogsByUserId('u_combo', 'sess_x');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.endpoint).sort()).toEqual(['/a', '/b']);
  });

  it('getApiLogsByUserId without sessionId returns only user-scoped logs', () => {
    insertApiLog({ userId: 'u_only', sessionId: 'sess_z', method: 'GET', endpoint: '/x' });
    insertApiLog({ userId: null, sessionId: 'sess_z', method: 'GET', endpoint: '/y' });

    const results = getApiLogsByUserId('u_only');
    expect(results).toHaveLength(1);
    expect(results[0].endpoint).toBe('/x');
  });

  it('getApiLogsByUserId returns logs ordered by id ASC', () => {
    insertApiLog({ userId: 'u_ord', method: 'GET', endpoint: '/first' });
    insertApiLog({ userId: 'u_ord', method: 'GET', endpoint: '/second' });
    insertApiLog({ userId: 'u_ord', method: 'GET', endpoint: '/third' });

    const results = getApiLogsByUserId('u_ord');
    expect(results.map(r => r.endpoint)).toEqual(['/first', '/second', '/third']);
  });
});

// ---------------------------------------------------------------------------
// Webhook Events
// ---------------------------------------------------------------------------
describe('webhook events', () => {
  it('insertWebhookEvent + getWebhookEventsByUserId round-trips', () => {
    const evt = insertWebhookEvent({
      userId: 'u_wh',
      webhookId: 'wh_123',
      eventType: 'task-status-updated',
      status: 'done',
      payload: { key: 'val' },
    });

    expect(evt.user_id).toBe('u_wh');
    expect(evt.webhook_id).toBe('wh_123');
    expect(evt.event_type).toBe('task-status-updated');
    expect(evt.status).toBe('done');
    expect(JSON.parse(evt.payload)).toEqual({ key: 'val' });
    expect(evt.received_at).toBeTruthy();

    const events = getWebhookEventsByUserId('u_wh');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(evt);
  });

  it('getWebhookEventsByUserId returns empty array for unknown user', () => {
    expect(getWebhookEventsByUserId('nobody')).toEqual([]);
  });

  it('getWebhookEventsByUserId returns events ordered by id ASC', () => {
    insertWebhookEvent({ userId: 'u_wh_ord', eventType: 'first' });
    insertWebhookEvent({ userId: 'u_wh_ord', eventType: 'second' });

    const events = getWebhookEventsByUserId('u_wh_ord');
    expect(events[0].event_type).toBe('first');
    expect(events[1].event_type).toBe('second');
  });

  // --- Dedup of redelivered webhooks (IMP-180) ---
  // Truv re-delivers events on retry and when stale duplicate subscriptions point
  // at the same tunnel URL. The same delivery must only ever produce one row.

  it('inserting the same webhook payload twice results in one row', () => {
    const params = {
      userId: 'u_dup',
      webhookId: 'wh_dup',
      eventType: 'task-status-updated',
      status: 'done',
      payload: { link_id: 'lnk_dup', task_id: 'task_1' },
    };

    const first = insertWebhookEvent(params);
    const second = insertWebhookEvent(params);

    // The duplicate insert is ignored and the original row is returned
    expect(second.id).toBe(first.id);
    expect(second).toEqual(first);
    expect(getWebhookEventsByUserId('u_dup')).toHaveLength(1);
  });

  it('redelivery dedupes even when user_id resolution differs between attempts', () => {
    // First delivery arrives before user_id can be resolved from link_id; the
    // retry arrives after resolution. Identity excludes user_id, so still one row.
    const base = { webhookId: 'wh_res', eventType: 'task-status-updated', status: 'done', payload: { link_id: 'lnk_res' } };
    const first = insertWebhookEvent({ ...base, userId: null });
    const second = insertWebhookEvent({ ...base, userId: 'u_resolved_later' });

    expect(second.id).toBe(first.id);
    const count = memDb.prepare("SELECT COUNT(*) as cnt FROM webhook_events WHERE webhook_id = 'wh_res'").get();
    expect(count.cnt).toBe(1);
  });

  it('different payloads create separate rows', () => {
    insertWebhookEvent({ userId: 'u_diff', webhookId: 'wh_d', eventType: 'task-status-updated', status: 'done', payload: { task_id: 'task_1' } });
    insertWebhookEvent({ userId: 'u_diff', webhookId: 'wh_d', eventType: 'task-status-updated', status: 'done', payload: { task_id: 'task_2' } });

    expect(getWebhookEventsByUserId('u_diff')).toHaveLength(2);
  });

  it('events with null payload still insert, deduped on the remaining fields', () => {
    // No payload: identity falls back to the {webhook_id, event_type, status} tuple
    const first = insertWebhookEvent({ userId: 'u_np', webhookId: 'wh_np', eventType: 'link-connected', status: 'ok', payload: null });
    const dupe = insertWebhookEvent({ userId: 'u_np', webhookId: 'wh_np', eventType: 'link-connected', status: 'ok', payload: null });
    insertWebhookEvent({ userId: 'u_np', webhookId: 'wh_np', eventType: 'link-deleted', status: 'ok', payload: null });

    expect(first.id).toBeTruthy();
    expect(dupe.id).toBe(first.id);
    expect(getWebhookEventsByUserId('u_np')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// initDb migration: webhook_events dedup (IMP-180)
//
// A database created before the payload_hash column existed may already contain
// duplicate rows from redelivered webhooks. initDb must backfill hashes, delete
// the duplicates (keeping the earliest row), and create the unique index — all
// without throwing.
// ---------------------------------------------------------------------------
describe('initDb webhook_events dedup migration', () => {
  it('dedupes pre-existing duplicate rows on initDb without throwing', () => {
    // Build a legacy database: webhook_events without payload_hash, with dupes
    const legacyDb = new Database(':memory:');
    legacyDb.exec(`
      CREATE TABLE webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        webhook_id TEXT,
        event_type TEXT,
        status TEXT,
        payload TEXT,
        received_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const insert = legacyDb.prepare(
      'INSERT INTO webhook_events (user_id, webhook_id, event_type, status, payload) VALUES (?, ?, ?, ?, ?)'
    );
    // Same delivery stored twice (the IMP-180 symptom), plus a distinct event
    insert.run('u_mig', 'wh_mig', 'task-status-updated', 'done', JSON.stringify({ task_id: 't1' }));
    insert.run('u_mig', 'wh_mig', 'task-status-updated', 'done', JSON.stringify({ task_id: 't1' }));
    insert.run('u_mig', 'wh_mig', 'task-status-updated', 'done', JSON.stringify({ task_id: 't2' }));
    // Legacy row with NULL payload, also duplicated
    insert.run('u_mig', 'wh_mig', 'link-connected', 'ok', null);
    insert.run('u_mig', 'wh_mig', 'link-connected', 'ok', null);

    _setTestDb(legacyDb);
    try {
      expect(() => initDb()).not.toThrow();

      // Duplicates removed, earliest row kept per identity
      const rows = legacyDb.prepare('SELECT * FROM webhook_events ORDER BY id ASC').all();
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.id)).toEqual([1, 3, 4]);
      // Backfilled hashes are present on every surviving row
      expect(rows.every(r => typeof r.payload_hash === 'string' && r.payload_hash.length === 64)).toBe(true);

      // The unique index now blocks re-inserting the same delivery
      const again = insertWebhookEvent({ userId: 'u_mig', webhookId: 'wh_mig', eventType: 'task-status-updated', status: 'done', payload: { task_id: 't1' } });
      expect(again.id).toBe(1);
      expect(legacyDb.prepare('SELECT COUNT(*) as cnt FROM webhook_events').get().cnt).toBe(3);

      // initDb is idempotent: running it again over the migrated DB is safe
      expect(() => initDb()).not.toThrow();
    } finally {
      // Restore the shared in-memory DB for the remaining test files/suites
      _setTestDb(memDb);
      legacyDb.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Reports (upsert)
// ---------------------------------------------------------------------------
describe('reports', () => {
  it('upsertReport inserts a new report', () => {
    const report = upsertReport({
      orderId: 'rpt_ord',
      reportType: 'income',
      truvReportId: 'truv_rpt_1',
      status: 'completed',
      response: { income: 50000 },
    });

    expect(report.order_id).toBe('rpt_ord');
    expect(report.report_type).toBe('income');
    expect(report.truv_report_id).toBe('truv_rpt_1');
    expect(report.status).toBe('completed');
    expect(JSON.parse(report.response)).toEqual({ income: 50000 });
  });

  it('upsertReport updates on conflict (same order_id + report_type)', () => {
    upsertReport({
      orderId: 'rpt_dup',
      reportType: 'employment',
      truvReportId: 'rpt_v1',
      status: 'pending',
      response: null,
    });

    const updated = upsertReport({
      orderId: 'rpt_dup',
      reportType: 'employment',
      truvReportId: 'rpt_v2',
      status: 'completed',
      response: { employer: 'Acme' },
    });

    expect(updated.truv_report_id).toBe('rpt_v2');
    expect(updated.status).toBe('completed');
    expect(JSON.parse(updated.response)).toEqual({ employer: 'Acme' });

    // Confirm only one row exists
    const count = memDb.prepare(
      "SELECT COUNT(*) as cnt FROM reports WHERE order_id = 'rpt_dup' AND report_type = 'employment'"
    ).get();
    expect(count.cnt).toBe(1);
  });

  it('upsertReport preserves existing values via COALESCE when new values are null', () => {
    upsertReport({
      orderId: 'rpt_coal',
      reportType: 'income',
      truvReportId: 'original_id',
      status: 'completed',
      response: { data: 1 },
    });

    // Upsert with nulls for optional fields.
    // Note: status defaults to 'pending' when null/undefined is passed (status || 'pending'),
    // so COALESCE sees 'pending' (non-null) and uses it instead of preserving 'completed'.
    // Only truvReportId and response truly receive NULL and get preserved via COALESCE.
    const result = upsertReport({
      orderId: 'rpt_coal',
      reportType: 'income',
      truvReportId: null,
      status: null,
      response: null,
    });

    expect(result.truv_report_id).toBe('original_id');
    // status becomes 'pending' because null falls through to the default
    expect(result.status).toBe('pending');
    expect(JSON.parse(result.response)).toEqual({ data: 1 });
  });

  it('upsertReport defaults status to "pending" when not provided', () => {
    const report = upsertReport({ orderId: 'rpt_pend', reportType: 'income' });
    expect(report.status).toBe('pending');
  });

  it('getReport returns null for non-existent report', () => {
    expect(getReport('no_such_order', 'income')).toBeNull();
  });

  it('getReport fetches by order_id and report_type', () => {
    upsertReport({ orderId: 'rpt_get', reportType: 'income', status: 'done' });
    upsertReport({ orderId: 'rpt_get', reportType: 'employment', status: 'pending' });

    const income = getReport('rpt_get', 'income');
    expect(income.status).toBe('done');

    const employment = getReport('rpt_get', 'employment');
    expect(employment.status).toBe('pending');
  });

  it('upsertReport handles string response (not just objects)', () => {
    const report = upsertReport({
      orderId: 'rpt_str',
      reportType: 'income',
      response: '{"already":"serialized"}',
    });
    expect(report.response).toBe('{"already":"serialized"}');
  });
});

// ---------------------------------------------------------------------------
// Document Collections
// ---------------------------------------------------------------------------
describe('document collections', () => {
  it('createDocCollection + getDocCollection round-trips all fields', () => {
    const created = createDocCollection({
      collectionId: 'dc_001',
      truvCollectionId: 'truv_dc_1',
      demoId: 'demo_docs',
      status: 'processing',
      rawResponse: { pages: 3 },
    });

    expect(created.id).toBe('dc_001');
    expect(created.truv_collection_id).toBe('truv_dc_1');
    expect(created.demo_id).toBe('demo_docs');
    expect(created.status).toBe('processing');
    expect(JSON.parse(created.raw_response)).toEqual({ pages: 3 });
    expect(created.created_at).toBeTruthy();

    const fetched = getDocCollection('dc_001');
    expect(fetched).toEqual(created);
  });

  it('createDocCollection defaults status to "created"', () => {
    const created = createDocCollection({ collectionId: 'dc_def' });
    expect(created.status).toBe('created');
  });

  it('getDocCollection returns null for non-existent id', () => {
    expect(getDocCollection('dc_missing')).toBeNull();
  });

  it('updateDocCollection updates allowed fields', () => {
    createDocCollection({ collectionId: 'dc_upd', status: 'created' });
    updateDocCollection('dc_upd', { status: 'completed', raw_response: { done: true } });

    const fetched = getDocCollection('dc_upd');
    expect(fetched.status).toBe('completed');
    expect(JSON.parse(fetched.raw_response)).toEqual({ done: true });
  });

  it('updateDocCollection ignores disallowed columns', () => {
    createDocCollection({ collectionId: 'dc_no', demoId: 'original' });
    updateDocCollection('dc_no', { demo_id: 'hacked' });

    const fetched = getDocCollection('dc_no');
    expect(fetched.demo_id).toBe('original');
  });

  it('updateDocCollection with only disallowed keys does nothing', () => {
    createDocCollection({ collectionId: 'dc_noop' });
    const result = updateDocCollection('dc_noop', { id: 'nope' });
    expect(result).toBeUndefined();
  });

  it('createDocCollection persists userId and round-trips it via getDocCollection', () => {
    // Covers the new user_id column added so task-status-updated webhooks without
    // user_id in the payload can be attributed to the correct user.
    const created = createDocCollection({
      collectionId: 'dc_user',
      userId: 'user_attributed',
      demoId: 'documents',
    });
    expect(created.user_id).toBe('user_attributed');
    expect(getDocCollection('dc_user').user_id).toBe('user_attributed');
  });

  it('createDocCollection persists null user_id when userId is omitted', () => {
    const created = createDocCollection({ collectionId: 'dc_nouser' });
    expect(created.user_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findUserByLinkInEvents
//
// Webhook resolver: Truv's task-status-updated payloads omit user_id but include
// link_id. Earlier event types (link-connected, statements-created, etc.) carry
// both, so the lookup uses prior webhook_events for the same link_id as a
// natural side-effect of normal ingestion — no separate mapping table needed.
// ---------------------------------------------------------------------------
describe('findUserByLinkInEvents', () => {
  it('returns null when no webhook events exist', () => {
    expect(findUserByLinkInEvents('lnk_a')).toBeNull();
  });

  it('returns null for falsy linkId without throwing', () => {
    expect(findUserByLinkInEvents(null)).toBeNull();
    expect(findUserByLinkInEvents('')).toBeNull();
    expect(findUserByLinkInEvents(undefined)).toBeNull();
  });

  it('finds user_id from a prior event whose payload carries the same link_id', () => {
    insertWebhookEvent({
      userId: 'user_a',
      webhookId: 'wh_seed',
      eventType: 'link-connected',
      payload: { link_id: 'lnk_a', user_id: 'user_a' },
    });
    expect(findUserByLinkInEvents('lnk_a')).toBe('user_a');
  });

  it('keeps unrelated links separated', () => {
    insertWebhookEvent({ userId: 'user_a', webhookId: 'wh_a', eventType: 'link-connected', payload: { link_id: 'lnk_a' } });
    insertWebhookEvent({ userId: 'user_b', webhookId: 'wh_b', eventType: 'link-connected', payload: { link_id: 'lnk_b' } });
    expect(findUserByLinkInEvents('lnk_a')).toBe('user_a');
    expect(findUserByLinkInEvents('lnk_b')).toBe('user_b');
  });

  it('ignores events with NULL user_id even if link_id matches', () => {
    // A previously-stored task-status-updated that itself failed to resolve
    // must not seed the lookup back into itself.
    insertWebhookEvent({ userId: null, webhookId: 'wh_orphan', eventType: 'task-status-updated', payload: { link_id: 'lnk_orphan' } });
    expect(findUserByLinkInEvents('lnk_orphan')).toBeNull();
  });

  it('returns the most recent matching event when several exist', () => {
    // The same link could have been associated with different users across re-runs;
    // pick the most recent so resolution tracks the active session.
    insertWebhookEvent({ userId: 'user_old', webhookId: 'wh_old', eventType: 'link-connected', payload: { link_id: 'lnk_x' } });
    memDb.prepare(
      "UPDATE webhook_events SET received_at = datetime('now', '-10 seconds') WHERE webhook_id = 'wh_old'",
    ).run();
    insertWebhookEvent({ userId: 'user_new', webhookId: 'wh_new', eventType: 'link-connected', payload: { link_id: 'lnk_x' } });

    expect(findUserByLinkInEvents('lnk_x')).toBe('user_new');
  });

  it('does not match events whose payload has a different link_id', () => {
    insertWebhookEvent({ userId: 'user_a', webhookId: 'wh_a', eventType: 'link-connected', payload: { link_id: 'lnk_a' } });
    expect(findUserByLinkInEvents('lnk_other')).toBeNull();
  });
});
