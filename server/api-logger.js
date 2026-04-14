/**
 * FILE SUMMARY: API Call Logger with PII Redaction
 * DATA FLOW: Express route handlers --> logApiCall() / pushWebhookEvent() --> db.insert*()
 * INTEGRATION PATTERN: Used by both Orders and Bridge flows to log all Truv API interactions.
 *
 * Redacts sensitive fields (SSN, email, phone, date of birth) before persisting
 * API call logs and webhook events to the SQLite database. The frontend polls
 * these logs to display real-time API activity in the demo panel.
 */

// Dependency: database module for persisting log entries
import * as db from './db.js';

// Set of JSON keys whose values should be redacted before storage.
// Values are masked to show only the last 4 characters (or fully masked if shorter).
const REDACTED_KEYS = new Set(['ssn', 'email', 'phone', 'date_of_birth', 'social_security_number']);

// Recursively walks a JSON structure and masks values for any key in REDACTED_KEYS.
// Arrays and nested objects are traversed. Primitive non-matching values pass through.
export function redactSensitive(body) {
  if (Array.isArray(body)) return body.map(redactSensitive);
  if (body && typeof body === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(body)) {
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

// Logs a Truv API call to the database after redacting PII from both request and response.
// Called by route handlers after each Truv API interaction.
export function logApiCall({ userId, sessionId, method, endpoint, requestBody, responseBody, statusCode, durationMs }) {
  const redactedRequest = requestBody ? JSON.stringify(redactSensitive(requestBody)) : null;
  const redactedResponse = responseBody ? JSON.stringify(redactSensitive(responseBody)) : null;

  return db.insertApiLog({
    userId,
    sessionId,
    method,
    endpoint,
    requestBody: redactedRequest,
    responseBody: redactedResponse,
    statusCode,
    durationMs,
  });
}

// Stores an inbound webhook event in the database. No redaction is needed here
// because webhook payloads from Truv do not contain raw PII.
export function pushWebhookEvent({ userId, webhookId, eventType, status, payload }) {
  return db.insertWebhookEvent({ userId, webhookId, eventType, status, payload });
}
