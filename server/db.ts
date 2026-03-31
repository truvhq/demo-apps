import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'quickstart.db');

export interface OrderRow {
  id: string;
  truv_order_id: string | null;
  user_id: string | null;
  demo_id: string | null;
  bridge_token: string | null;
  share_url: string | null;
  status: string;
  raw_response: string | null;
  created_at: string;
  product_type: string | null;
}

export interface ApiLogRow {
  id: number;
  user_id: string | null;
  method: string;
  endpoint: string;
  url?: string;
  request_body: string | null;
  response_body: string | null;
  status_code: number | null;
  duration_ms: number | null;
  timestamp: string;
}

export interface WebhookEventRow {
  id: number;
  user_id: string | null;
  webhook_id: string | null;
  event_type: string | null;
  status: string | null;
  payload: string | null;
  received_at: string;
}

export interface ReportRow {
  id: number;
  order_id: string;
  report_type: string;
  truv_report_id: string | null;
  status: string;
  response: string | null;
  created_at: string;
}

export interface DocCollectionRow {
  id: string;
  truv_collection_id: string | null;
  demo_id: string | null;
  status: string;
  raw_response: string | null;
  created_at: string;
}

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// SQLite DDL exec — not child_process.exec
export function initDb(): void {
  const conn = getDb();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      truv_order_id TEXT,
      user_id TEXT,
      demo_id TEXT,
      bridge_token TEXT,
      share_url TEXT,
      status TEXT DEFAULT 'created',
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_body TEXT,
      response_body TEXT,
      status_code INTEGER,
      duration_ms REAL,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      webhook_id TEXT,
      event_type TEXT,
      status TEXT,
      payload TEXT,
      received_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      truv_report_id TEXT,
      status TEXT DEFAULT 'pending',
      response TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_order_type ON reports(order_id, report_type);
    CREATE INDEX IF NOT EXISTS idx_reports_order_id ON reports(order_id);

    CREATE TABLE IF NOT EXISTS document_collections (
      id TEXT PRIMARY KEY,
      truv_collection_id TEXT,
      demo_id TEXT,
      status TEXT DEFAULT 'created',
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_events_user_id ON webhook_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  `);

  // Migrate: add columns to existing tables if missing
  try { conn.exec('ALTER TABLE webhook_events ADD COLUMN user_id TEXT'); } catch {}
  try { conn.exec('ALTER TABLE api_logs ADD COLUMN user_id TEXT'); } catch {}
  try { conn.exec('ALTER TABLE orders ADD COLUMN product_type TEXT'); } catch {}
}

export function generateId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

// --- Orders ---

export function createOrder({ orderId, truvOrderId, userId, demoId, bridgeToken, shareUrl, status = 'created', rawResponse }: {
  orderId: string;
  truvOrderId?: string | null;
  userId?: string | null;
  demoId?: string | null;
  bridgeToken?: string | null;
  shareUrl?: string | null;
  status?: string;
  rawResponse?: unknown;
}): OrderRow {
  const conn = getDb();
  conn.prepare(
    'INSERT INTO orders (id, truv_order_id, user_id, demo_id, bridge_token, share_url, status, raw_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(orderId, truvOrderId ?? null, userId ?? null, demoId ?? null, bridgeToken ?? null, shareUrl ?? null, status, rawResponse ? JSON.stringify(rawResponse) : null);
  return conn.prepare<[string], OrderRow>('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
}

export function getOrder(orderId: string): OrderRow | null {
  return getDb().prepare<[string], OrderRow>('SELECT * FROM orders WHERE id = ?').get(orderId) ?? null;
}

type OrderUpdateFields = {
  status?: string;
  raw_response?: unknown;
  bridge_token?: string | null;
  share_url?: string | null;
  product_type?: string | null;
};

const ORDER_ALLOWED_COLS = new Set<keyof OrderUpdateFields>(['status', 'raw_response', 'bridge_token', 'share_url', 'product_type']);

export function updateOrder(orderId: string, fields: OrderUpdateFields): void {
  const keys = (Object.keys(fields) as Array<keyof OrderUpdateFields>).filter(k => ORDER_ALLOWED_COLS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals: unknown[] = keys.map(k => {
    const v = fields[k];
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
  });
  vals.push(orderId);
  getDb().prepare(`UPDATE orders SET ${sets} WHERE id = ?`).run(...vals);
}

export function findOrderByUserId(userId: string): OrderRow | null {
  return getDb().prepare<[string], OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) ?? null;
}

export function getOrdersByDemoId(demoId: string): OrderRow[] {
  return getDb().prepare<[string], OrderRow>('SELECT * FROM orders WHERE demo_id = ? ORDER BY created_at DESC').all(demoId);
}

export function getAllOrders(): OrderRow[] {
  return getDb().prepare<[], OrderRow>('SELECT * FROM orders ORDER BY created_at DESC').all();
}

// --- API Logs ---

export function insertApiLog({ userId, method, endpoint, requestBody, responseBody, statusCode, durationMs }: {
  userId?: string | null;
  method: string;
  endpoint: string;
  requestBody?: string | null;
  responseBody?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
}): ApiLogRow {
  const conn = getDb();
  const info = conn.prepare(
    'INSERT INTO api_logs (user_id, method, endpoint, request_body, response_body, status_code, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId ?? null, method, endpoint, requestBody ?? null, responseBody ?? null, statusCode ?? null, durationMs ?? null);
  return conn.prepare<[number | bigint], ApiLogRow>('SELECT * FROM api_logs WHERE id = ?').get(info.lastInsertRowid) as ApiLogRow;
}

export function getApiLogsByUserId(userId: string): ApiLogRow[] {
  return getDb().prepare<[string], ApiLogRow>('SELECT * FROM api_logs WHERE user_id = ? ORDER BY id ASC').all(userId);
}

// --- Webhook Events ---

export function insertWebhookEvent({ userId, webhookId, eventType, status, payload }: {
  userId?: string | null;
  webhookId?: string | null;
  eventType?: string | null;
  status?: string | null;
  payload?: unknown;
}): WebhookEventRow {
  const conn = getDb();
  const info = conn.prepare(
    'INSERT INTO webhook_events (user_id, webhook_id, event_type, status, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(userId ?? null, webhookId ?? null, eventType ?? null, status ?? null, payload ? JSON.stringify(payload) : null);
  return conn.prepare<[number | bigint], WebhookEventRow>('SELECT * FROM webhook_events WHERE id = ?').get(info.lastInsertRowid) as WebhookEventRow;
}

export function getWebhookEventsByUserId(userId: string): WebhookEventRow[] {
  return getDb().prepare<[string], WebhookEventRow>('SELECT * FROM webhook_events WHERE user_id = ? ORDER BY id ASC').all(userId);
}

// --- Reports ---

export function upsertReport({ orderId, reportType, truvReportId, status, response }: {
  orderId: string;
  reportType: string;
  truvReportId?: string | null;
  status?: string | null;
  response?: unknown;
}): ReportRow {
  const conn = getDb();
  const responseStr = response ? (typeof response === 'object' ? JSON.stringify(response) : String(response)) : null;
  conn.prepare(
    `INSERT INTO reports (order_id, report_type, truv_report_id, status, response)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(order_id, report_type) DO UPDATE SET
       truv_report_id = COALESCE(excluded.truv_report_id, truv_report_id),
       status = COALESCE(excluded.status, status),
       response = COALESCE(excluded.response, response)`
  ).run(orderId, reportType, truvReportId ?? null, status ?? 'pending', responseStr);
  return conn.prepare<[string, string], ReportRow>('SELECT * FROM reports WHERE order_id = ? AND report_type = ?').get(orderId, reportType) as ReportRow;
}

export function getReport(orderId: string, reportType: string): ReportRow | null {
  return getDb().prepare<[string, string], ReportRow>('SELECT * FROM reports WHERE order_id = ? AND report_type = ?').get(orderId, reportType) ?? null;
}

// --- Document Collections ---

export function createDocCollection({ collectionId, truvCollectionId, demoId, status = 'created', rawResponse }: {
  collectionId: string;
  truvCollectionId?: string | null;
  demoId?: string | null;
  status?: string;
  rawResponse?: unknown;
}): DocCollectionRow {
  const conn = getDb();
  conn.prepare(
    'INSERT INTO document_collections (id, truv_collection_id, demo_id, status, raw_response) VALUES (?, ?, ?, ?, ?)'
  ).run(collectionId, truvCollectionId ?? null, demoId ?? null, status, rawResponse ? JSON.stringify(rawResponse) : null);
  return conn.prepare<[string], DocCollectionRow>('SELECT * FROM document_collections WHERE id = ?').get(collectionId) as DocCollectionRow;
}

export function getDocCollection(collectionId: string): DocCollectionRow | null {
  return getDb().prepare<[string], DocCollectionRow>('SELECT * FROM document_collections WHERE id = ?').get(collectionId) ?? null;
}

type DocCollectionUpdateFields = {
  status?: string;
  raw_response?: unknown;
};

const DOC_COLLECTION_ALLOWED_COLS = new Set<keyof DocCollectionUpdateFields>(['status', 'raw_response']);

export function updateDocCollection(collectionId: string, fields: DocCollectionUpdateFields): void {
  const keys = (Object.keys(fields) as Array<keyof DocCollectionUpdateFields>).filter(k => DOC_COLLECTION_ALLOWED_COLS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals: unknown[] = keys.map(k => {
    const v = fields[k];
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
  });
  vals.push(collectionId);
  getDb().prepare(`UPDATE document_collections SET ${sets} WHERE id = ?`).run(...vals);
}
