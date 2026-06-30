import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionStore } from '../../../server/sessions/store.js';
import { startSweeper } from '../../../server/sessions/sweeper.js';

describe('startSweeper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('evicts expired sessions on each tick and calls onExpire with the record', async () => {
    const store = createSessionStore({ idleTtlMs: 1_000 });
    const sid = store.create({ clientId: 'c', secret: 's' });
    store.setWebhookId(sid, 'wh_to_remove');

    const onExpire = vi.fn();
    const sweeper = startSweeper({ store, intervalMs: 100, onExpire });

    // Advance past TTL so the next tick evicts.
    vi.advanceTimersByTime(1_001);
    await sweeper.runNow();

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire.mock.calls[0][0]).toMatchObject({ id: sid, webhookId: 'wh_to_remove' });
    expect(store.get(sid)).toBeUndefined();

    sweeper.stop();
  });

  it('leaves fresh sessions untouched', async () => {
    const store = createSessionStore({ idleTtlMs: 10_000 });
    const sid = store.create({ clientId: 'c', secret: 's' });
    const onExpire = vi.fn();
    const sweeper = startSweeper({ store, intervalMs: 100, onExpire });

    vi.advanceTimersByTime(500);
    await sweeper.runNow();

    expect(onExpire).not.toHaveBeenCalled();
    expect(store.get(sid)).toBeDefined();
    sweeper.stop();
  });

  it('keeps processing remaining evictions when one onExpire throws', async () => {
    const store = createSessionStore({ idleTtlMs: 1_000 });
    const a = store.create({ clientId: 'a', secret: 'a' });
    const b = store.create({ clientId: 'b', secret: 'b' });
    const c = store.create({ clientId: 'c', secret: 'c' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const onExpire = vi.fn(({ id }) => {
      if (id === b) throw new Error('boom');
    });
    const sweeper = startSweeper({ store, intervalMs: 100, onExpire });

    vi.advanceTimersByTime(1_001);
    await sweeper.runNow();

    expect(onExpire).toHaveBeenCalledTimes(3);
    expect(store.get(a)).toBeUndefined();
    expect(store.get(b)).toBeUndefined();
    expect(store.get(c)).toBeUndefined();
    sweeper.stop();
  });

  it('stop() prevents further ticks', async () => {
    const store = createSessionStore({ idleTtlMs: 1_000 });
    const onExpire = vi.fn();
    const sweeper = startSweeper({ store, intervalMs: 100, onExpire });
    sweeper.stop();
    store.create({ clientId: 'c', secret: 's' });
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
