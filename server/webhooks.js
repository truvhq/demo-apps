// Webhooks: HMAC-SHA256 signature verification
//
// Verifies inbound webhook requests using the X-Webhook-Sign header.
// Uses timing-safe comparison to prevent timing attacks.
// See: https://docs.truv.com/docs/webhooks

import crypto from 'crypto';

export function generateWebhookSign(body, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `v1=${hash}`;
}

export function verifyWebhookSignature(rawBody, secret, headerSig) {
  const expected = generateWebhookSign(rawBody, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSig || ''));
  } catch {
    return false;
  }
}
