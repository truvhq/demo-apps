import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createSessionStore } from '../../../server/sessions/store.js';

describe('createSessionStore', () => {
  let store;

  beforeEach(() => {
    store = createSessionStore({ idleTtlMs: 60_000 });
  });

  describe('create + get', () => {
    it('returns a session id that resolves to the stored credentials', () => {
      const id = store.create({ clientId: 'cid_1', secret: 'sec_1' });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(20);

      const record = store.get(id);
      expect(record).toMatchObject({ id, clientId: 'cid_1', secret: 'sec_1' });
      expect(record.createdAt).toBeTypeOf('number');
      expect(record.lastUsedAt).toBeTypeOf('number');
      expect(record.webhookId).toBeNull();
    });

    it('produces distinct opaque ids for separate sessions', () => {
      const id1 = store.create({ clientId: 'a', secret: 'a' });
      const id2 = store.create({ clientId: 'b', secret: 'b' });
      expect(id1).not.toBe(id2);
    });

    it('two concurrent sessions cannot read each others credentials', () => {
      const id1 = store.create({ clientId: 'cid_A', secret: 'sec_A' });
      const id2 = store.create({ clientId: 'cid_B', secret: 'sec_B' });
      expect(store.get(id1).secret).toBe('sec_A');
      expect(store.get(id2).secret).toBe('sec_B');
    });

    it('get returns undefined for unknown ids', () => {
      expect(store.get('nope')).toBeUndefined();
    });
  });

  describe('touch', () => {
    it('updates lastUsedAt without changing createdAt', async () => {
      const id = store.create({ clientId: 'c', secret: 's' });
      const before = store.get(id);
      await new Promise(r => setTimeout(r, 5));
      store.touch(id);
      const after = store.get(id);
      expect(after.lastUsedAt).toBeGreaterThanOrEqual(before.lastUsedAt);
      expect(after.createdAt).toBe(before.createdAt);
    });

    it('is a no-op for unknown ids', () => {
      expect(() => store.touch('missing')).not.toThrow();
    });
  });

  describe('setWebhookId', () => {
    it('stores the webhookId on the session record', () => {
      const id = store.create({ clientId: 'c', secret: 's' });
      store.setWebhookId(id, 'wh_123');
      expect(store.get(id).webhookId).toBe('wh_123');
    });

    it('is a no-op for unknown ids', () => {
      expect(() => store.setWebhookId('missing', 'wh_1')).not.toThrow();
    });
  });

  describe('updateCredentials', () => {
    it('swaps clientId, secret, and webhookId on an existing session', () => {
      const id = store.create({ clientId: 'old_c', secret: 'old_s' });
      store.setWebhookId(id, 'wh_old');

      const updated = store.updateCredentials(id, { clientId: 'new_c', secret: 'new_s', webhookId: null });

      expect(updated.clientId).toBe('new_c');
      expect(updated.secret).toBe('new_s');
      expect(updated.webhookId).toBeNull();
      expect(store.get(id).clientId).toBe('new_c');
    });

    it('preserves the session id across the update', () => {
      const id = store.create({ clientId: 'a', secret: 'b' });
      store.updateCredentials(id, { clientId: 'c', secret: 'd', webhookId: null });
      expect(store.get(id).id).toBe(id);
    });

    it('refreshes lastUsedAt', async () => {
      const id = store.create({ clientId: 'a', secret: 'b' });
      const before = store.get(id).lastUsedAt;
      await new Promise(r => setTimeout(r, 5));
      store.updateCredentials(id, { clientId: 'c', secret: 'd', webhookId: null });
      expect(store.get(id).lastUsedAt).toBeGreaterThan(before);
    });

    it('returns undefined for unknown ids', () => {
      expect(store.updateCredentials('missing', { clientId: 'x', secret: 'y' })).toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('removes the session so get returns undefined', () => {
      const id = store.create({ clientId: 'c', secret: 's' });
      store.destroy(id);
      expect(store.get(id)).toBeUndefined();
    });

    it('returns the destroyed record so callers can clean up webhooks', () => {
      const id = store.create({ clientId: 'c', secret: 's' });
      store.setWebhookId(id, 'wh_99');
      const removed = store.destroy(id);
      expect(removed).toMatchObject({ id, webhookId: 'wh_99' });
    });

    it('returns undefined for unknown ids', () => {
      expect(store.destroy('missing')).toBeUndefined();
    });
  });

  describe('TTL eviction', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('get returns undefined once a record is older than idleTtlMs from lastUsedAt', () => {
      const ttl = 1000;
      const s = createSessionStore({ idleTtlMs: ttl });
      const id = s.create({ clientId: 'c', secret: 'x' });
      vi.advanceTimersByTime(ttl + 1);
      expect(s.get(id)).toBeUndefined();
    });

    it('touch extends the lifetime', () => {
      const ttl = 1000;
      const s = createSessionStore({ idleTtlMs: ttl });
      const id = s.create({ clientId: 'c', secret: 'x' });
      vi.advanceTimersByTime(500);
      s.touch(id);
      vi.advanceTimersByTime(800); // 800 since touch < ttl
      expect(s.get(id)).toBeDefined();
    });

    it('sweep returns the evicted sessions and removes them', () => {
      const ttl = 1000;
      const s = createSessionStore({ idleTtlMs: ttl });
      const stale = s.create({ clientId: 'c1', secret: 'x' });
      vi.advanceTimersByTime(ttl + 1);
      const fresh = s.create({ clientId: 'c2', secret: 'y' });
      const evicted = s.sweep();
      expect(evicted.map(e => e.id)).toEqual([stale]);
      expect(s.get(stale)).toBeUndefined();
      expect(s.get(fresh)).toBeDefined();
    });
  });

  describe('credential hygiene', () => {
    it('does not include credentials when records are inspected for logging', () => {
      const id = store.create({ clientId: 'cid_log', secret: 'sec_log' });
      // Public surface for diagnostics: all() returns metadata without secrets.
      // The full record is only obtainable via get(id) by code that already knows the id.
      const meta = store.all().find(r => r.id === id);
      expect(meta).toBeDefined();
      expect(meta.secret).toBeUndefined();
      expect(meta.clientId).toBeUndefined();
      expect(meta.id).toBe(id);
    });
  });
});
