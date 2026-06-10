/**
 * FILE SUMMARY: HMAC-signed session cookie helpers
 * DATA FLOW: POST /api/session -> signSessionId(id, secret) -> Set-Cookie
 *            request -> middleware -> verifySessionCookie(cookie, secret) -> id
 * INTEGRATION PATTERN: Used by the session middleware and the session routes
 * to bind a session id to a signature that proves it was issued by this server.
 *
 * Format: `<id>.<hex-sha256>` where the signature is HMAC-SHA256 of the id
 * with the configured cookie secret. The verifier uses timing-safe comparison.
 */

import crypto from 'crypto';

// Use the __Host- prefix so the cookie is bound to the issuing host: path=/,
// no Domain, and Secure are required by the browser, which prevents subdomain
// or path scoping mistakes.
export const SESSION_COOKIE_NAME = '__Host-demo_sid';

function hmacHex(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function signSessionId(id, secret) {
  return `${id}.${hmacHex(id, secret)}`;
}

export function verifySessionCookie(value, secret) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmacHex(id, secret);
  if (sig.length !== expected.length) return null;
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? id : null;
  } catch {
    return null;
  }
}
