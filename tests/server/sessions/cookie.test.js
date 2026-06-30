import { describe, it, expect } from 'vitest';
import { signSessionId, verifySessionCookie, SESSION_COOKIE_NAME } from '../../../server/sessions/cookie.js';

const SECRET = 'cookie-test-secret-abcdef0123456789';

describe('cookie helpers', () => {
  describe('SESSION_COOKIE_NAME', () => {
    it('uses the __Host- prefix so the cookie is locked to the issuing host', () => {
      expect(SESSION_COOKIE_NAME.startsWith('__Host-')).toBe(true);
    });
  });

  describe('signSessionId + verifySessionCookie round-trip', () => {
    it('verifies a value produced with the same secret', () => {
      const signed = signSessionId('sid_abc123', SECRET);
      expect(verifySessionCookie(signed, SECRET)).toBe('sid_abc123');
    });

    it('returns the original id for any well-formed signed value', () => {
      const id = 'B'.repeat(43); // base64url of 32 bytes is ~43 chars
      const signed = signSessionId(id, SECRET);
      expect(verifySessionCookie(signed, SECRET)).toBe(id);
    });
  });

  describe('tamper detection', () => {
    it('returns null if any character of the id segment is changed', () => {
      const signed = signSessionId('sid_abc', SECRET);
      const [id, sig] = signed.split('.');
      const tampered = `${id.slice(0, -1)}Z.${sig}`;
      expect(verifySessionCookie(tampered, SECRET)).toBeNull();
    });

    it('returns null if any character of the signature segment is changed', () => {
      const signed = signSessionId('sid_abc', SECRET);
      const [id, sig] = signed.split('.');
      const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
      expect(verifySessionCookie(`${id}.${flipped}`, SECRET)).toBeNull();
    });

    it('returns null when verified with a different secret', () => {
      const signed = signSessionId('sid_abc', SECRET);
      expect(verifySessionCookie(signed, 'different-secret')).toBeNull();
    });
  });

  describe('malformed input', () => {
    it('returns null for an empty cookie value', () => {
      expect(verifySessionCookie('', SECRET)).toBeNull();
    });

    it('returns null for null', () => {
      expect(verifySessionCookie(null, SECRET)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(verifySessionCookie(undefined, SECRET)).toBeNull();
    });

    it('returns null for a value missing the dot separator', () => {
      expect(verifySessionCookie('not-a-signed-value', SECRET)).toBeNull();
    });

    it('returns null for a value with an empty id segment', () => {
      expect(verifySessionCookie('.abc', SECRET)).toBeNull();
    });

    it('returns null for a value with an empty signature segment', () => {
      expect(verifySessionCookie('abc.', SECRET)).toBeNull();
    });
  });

  describe('signature shape', () => {
    it('produces a value of the form `<id>.<hex>`', () => {
      const signed = signSessionId('id_xyz', SECRET);
      expect(signed.split('.')).toHaveLength(2);
      const [id, sig] = signed.split('.');
      expect(id).toBe('id_xyz');
      expect(sig).toMatch(/^[a-f0-9]+$/);
      expect(sig.length).toBe(64); // sha256 hex
    });
  });
});
