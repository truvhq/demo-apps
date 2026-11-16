/**
 * FILE SUMMARY: In-memory registry for `order-batch-completed` webhook events.
 *
 * DATA FLOW:
 *   Truv API --> POST /api/webhooks/truv(/:sessionId) --> processWebhookPayload (index.js)
 *     --> recordBatchEvent(batch_id, payload)              [writer]
 *   Frontend --> GET /api/batch/jobs/:id --> batch-orders route
 *     --> getBatchEvent(batch_id) for each chunk           [reader]
 *
 * Why a standalone module instead of the webhook_events table: the
 * `order-batch-completed` payload carries a `batch_id` but NO `user_id` or
 * `link_id`, so it can't be stored against a user and served by the per-user
 * webhook polling path the other demos use. The Batch Orders runner keeps its
 * jobs in memory anyway (like Coverage Analysis), so a small in-memory map keyed
 * by batch_id is the natural fit. Entries are swept on a TTL so a long-running
 * server doesn't accumulate them.
 */

const TTL_MS = 60 * 60_000;            // keep an event for an hour after it arrives
const SWEEP_INTERVAL_MS = 10 * 60_000;

// batch_id -> { payload, received_at }
const events = new Map();

// Record an inbound order-batch-completed webhook, keyed by its batch_id.
// Later arrivals for the same batch_id overwrite earlier ones (the payload is
// terminal, so there is only ever one meaningful event per batch).
export function recordBatchEvent(batchId, payload) {
  if (!batchId) return;
  events.set(String(batchId), { payload, received_at: Date.now() });
}

// Look up the recorded webhook event for a batch_id, or null if none has arrived.
export function getBatchEvent(batchId) {
  const hit = events.get(String(batchId));
  return hit ? hit.payload : null;
}

// Background sweep: drop events older than the TTL. Unref'd so it never keeps
// the process alive on its own.
const sweep = setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of events) {
    if (entry.received_at < cutoff) events.delete(id);
  }
}, SWEEP_INTERVAL_MS);
sweep.unref?.();

// Exposed for tests.
export function _clear() { events.clear(); }
