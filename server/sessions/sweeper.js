/**
 * FILE SUMMARY: Periodic eviction of stale sessions
 * DATA FLOW: setInterval -> store.sweep() -> onExpire(record) per evicted -> store.destroy
 *
 * Walks the session store on an interval, evicts records whose lastUsedAt is
 * older than idleTtlMs, and calls onExpire for each so the caller can
 * unregister the per-session webhook with Truv. Errors in onExpire never
 * stop the loop or affect other evictions.
 */

export function startSweeper({ store, intervalMs = 5 * 60_000, onExpire }) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const evicted = store.sweep();
    for (const record of evicted) {
      if (typeof onExpire !== 'function') continue;
      try {
        await onExpire(record);
      } catch (err) {
        console.error('session_sweep_expire_failed', err.message);
      }
    }
  }

  const handle = setInterval(tick, intervalMs);
  if (handle.unref) handle.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
    // Test hook: run a sweep tick immediately.
    runNow: tick,
  };
}
