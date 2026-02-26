import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  truvOrderId: text("truv_order_id"),
  demoId: text("demo_id").notNull(),
  bridgeToken: text("bridge_token"),
  shareUrl: text("share_url"),
  status: text("status").default("created"),
  createdAt: text("created_at").default(new Date().toISOString()),
  rawResponse: text("raw_response"),
});

export const apiLogs = sqliteTable("api_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id"),
  method: text("method").notNull(),
  endpoint: text("endpoint").notNull(),
  requestBody: text("request_body"),
  responseBody: text("response_body"),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  timestamp: text("timestamp").default(new Date().toISOString()),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id"),
  webhookId: text("webhook_id"),
  eventType: text("event_type").notNull(),
  status: text("status"),
  payload: text("payload").notNull(),
  receivedAt: text("received_at").default(new Date().toISOString()),
});
