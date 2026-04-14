/**
 * FILE SUMMARY: Webhook Signature Verification
 * DATA FLOW: Truv API --> POST /api/webhooks/truv --> verifyWebhookSignature() --> accept or reject
 * INTEGRATION PATTERN: Used by both Orders and Bridge flows to secure inbound webhooks.
 *
 * Verifies that inbound webhook requests are authentically from Truv by checking the
 * HMAC-SHA256 signature in the X-Webhook-Sign header against the API secret.
 * Uses timing-safe comparison to prevent timing attacks.
 */

// Dependency: Node.js crypto module for HMAC and timing-safe comparison
import crypto from 'crypto';

// Generates the expected webhook signature by HMAC-SHA256 hashing the raw
// request body with the API secret. Returns the signature in "v1={hex}" format.
export function generateWebhookSign(body, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `v1=${hash}`;
}

// Verifies an inbound webhook signature. Compares the header value against the
// expected signature using timing-safe comparison. Returns true if valid, false otherwise.
export function verifyWebhookSignature(rawBody, secret, headerSig) {
  const expected = generateWebhookSign(rawBody, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSig || ''));
  } catch {
    return false;
  }
}
