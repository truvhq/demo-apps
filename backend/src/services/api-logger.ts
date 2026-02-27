import { EventEmitter } from "events";
import { db } from "../db/index.js";
import { apiLogs } from "../db/schema.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const REDACTED_KEYS = new Set(["ssn", "email", "phone", "date_of_birth"]);

function redactSensitive(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redactSensitive);
  if (body && typeof body === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key) && typeof val === "string") {
        redacted[key] = val.length > 4 ? "***" + val.slice(-4) : "***";
      } else {
        redacted[key] = redactSensitive(val);
      }
    }
    return redacted;
  }
  return body;
}

export async function logApiCall(opts: {
  method: string;
  endpoint: string;
  requestBody?: Record<string, unknown> | null;
  responseBody?: Record<string, unknown> | null;
  statusCode?: number | null;
  durationMs?: number | null;
  orderId?: string | null;
}) {
  const now = new Date().toISOString();
  const safeRequestBody = opts.requestBody ? redactSensitive(opts.requestBody) as Record<string, unknown> : null;
  const result = db
    .insert(apiLogs)
    .values({
      orderId: opts.orderId ?? null,
      method: opts.method,
      endpoint: opts.endpoint,
      requestBody: safeRequestBody ? JSON.stringify(safeRequestBody) : null,
      responseBody: opts.responseBody ? JSON.stringify(opts.responseBody) : null,
      statusCode: opts.statusCode ?? null,
      durationMs: opts.durationMs ?? null,
      timestamp: now,
    })
    .returning()
    .get();

  const logEntry = {
    id: result.id,
    order_id: result.orderId,
    method: result.method,
    endpoint: result.endpoint,
    request_body: safeRequestBody,
    response_body: opts.responseBody ?? null,
    status_code: result.statusCode,
    duration_ms: result.durationMs,
    timestamp: result.timestamp,
  };

  const event = { type: "api_call", data: logEntry };

  if (opts.orderId) {
    emitter.emit(`order:${opts.orderId}`, event);
  }
  emitter.emit("global", event);

  return logEntry;
}

export function pushWebhookEvent(
  orderId: string | null,
  eventData: Record<string, unknown>
) {
  const event = { type: "webhook", data: eventData };

  if (orderId) {
    emitter.emit(`order:${orderId}`, event);
  }
  emitter.emit("global", event);
}

export function subscribe(
  orderId: string | null,
  callback: (event: { type: string; data: unknown }) => void
): () => void {
  const handler = (event: { type: string; data: unknown }) => callback(event);

  if (orderId) {
    emitter.on(`order:${orderId}`, handler);
    return () => {
      emitter.off(`order:${orderId}`, handler);
    };
  }

  emitter.on("global", handler);
  return () => {
    emitter.off("global", handler);
  };
}
