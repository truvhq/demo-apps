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
});
