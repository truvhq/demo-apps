import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const sqlite = new Database("demo.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Auto-create tables using individual statements (safe, no user input)
const statements = [
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    truv_order_id TEXT,
    demo_id TEXT NOT NULL,
    bridge_token TEXT,
    share_url TEXT,
    status TEXT DEFAULT 'created',
    created_at TEXT DEFAULT (datetime('now')),
    raw_response TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_body TEXT,
    response_body TEXT,
    status_code INTEGER,
    duration_ms INTEGER,
    timestamp TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    webhook_id TEXT,
    event_type TEXT NOT NULL,
    status TEXT,
    payload TEXT NOT NULL,
    received_at TEXT DEFAULT (datetime('now'))
  )`,
];

for (const sql of statements) {
  sqlite.prepare(sql).run();
}
