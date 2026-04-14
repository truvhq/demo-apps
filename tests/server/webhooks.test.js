import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyWebhookSignature, generateWebhookSign } from '../../server/webhooks.js';

describe('verifyWebhookSignature', () => {
  const secret = 'test-webhook-secret-key';
  const body = '{"event_type":"task-status-updated","status":"completed"}';

  // Compute a known-valid signature for the test body and secret
  const validSignature = `v1=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  it('returns true for a valid HMAC-SHA256 signature', () => {
    expect(verifyWebhookSignature(body, secret, validSignature)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const tamperedBody = '{"event_type":"task-status-updated","status":"failed"}';
    expect(verifyWebhookSignature(tamperedBody, secret, validSignature)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const wrongSecret = 'wrong-secret';
    expect(verifyWebhookSignature(body, wrongSecret, validSignature)).toBe(false);
  });

  it('returns false for an empty signature header', () => {
    expect(verifyWebhookSignature(body, secret, '')).toBe(false);
  });

  it('returns false for a null signature header', () => {
    expect(verifyWebhookSignature(body, secret, null)).toBe(false);
  });

  it('returns false for an undefined signature header', () => {
    expect(verifyWebhookSignature(body, secret, undefined)).toBe(false);
  });

  it('returns false for a signature with wrong prefix', () => {
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const wrongPrefix = `v2=${hash}`;
    expect(verifyWebhookSignature(body, secret, wrongPrefix)).toBe(false);
  });

  it('returns false for a completely invalid signature string', () => {
    expect(verifyWebhookSignature(body, secret, 'not-a-real-signature')).toBe(false);
  });
});

describe('generateWebhookSign', () => {
  it('produces a v1= prefixed HMAC-SHA256 hex digest', () => {
    const secret = 'my-secret';
    const body = '{"test":true}';
    const result = generateWebhookSign(body, secret);

    expect(result.startsWith('v1=')).toBe(true);

    // Verify the hash portion matches a direct crypto computation
    const expectedHash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(result).toBe(`v1=${expectedHash}`);
  });

  it('produces different signatures for different bodies', () => {
    const secret = 'same-secret';
    const sig1 = generateWebhookSign('body-1', secret);
    const sig2 = generateWebhookSign('body-2', secret);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const body = 'same-body';
    const sig1 = generateWebhookSign(body, 'secret-1');
    const sig2 = generateWebhookSign(body, 'secret-2');
    expect(sig1).not.toBe(sig2);
  });
});
