import * as db from './db.js';
import type { ApiLogRow, WebhookEventRow } from './db.js';

const REDACTED_KEYS = new Set(['ssn', 'email', 'phone', 'date_of_birth', 'social_security_number']);

export function redactSensitive(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redactSensitive);
  if (body && typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key) && typeof val === 'string') {
        out[key] = val.length > 4 ? '***' + val.slice(-4) : '***';
      } else {
        out[key] = redactSensitive(val);
      }
    }
    return out;
  }
  return body;
}

export function logApiCall({ userId, method, endpoint, requestBody, responseBody, statusCode, durationMs }: {
  userId?: string | null;
  method: string;
  endpoint: string;
  requestBody?: unknown;
  responseBody?: unknown;
  statusCode?: number | null;
  durationMs?: number | null;
}): ApiLogRow {
  const redactedRequest = requestBody ? JSON.stringify(redactSensitive(requestBody)) : null;
  const redactedResponse = responseBody ? JSON.stringify(redactSensitive(responseBody)) : null;

  return db.insertApiLog({
    userId,
    method,
    endpoint,
    requestBody: redactedRequest,
    responseBody: redactedResponse,
    statusCode,
    durationMs,
  });
}

export function pushWebhookEvent({ userId, webhookId, eventType, status, payload }: {
  userId?: string | null;
  webhookId?: string | null;
  eventType?: string | null;
  status?: string | null;
  payload?: unknown;
}): WebhookEventRow {
  return db.insertWebhookEvent({ userId, webhookId, eventType, status, payload });
}
