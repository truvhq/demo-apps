/**
 * FILE SUMMARY: In-memory session credential store
 * DATA FLOW: POST /api/session -> createSessionStore.create() -> Map<sid, record>
 *            request -> middleware -> store.get(sid) -> TruvClient(creds)
 * INTEGRATION PATTERN: Backs the BYO-API-credentials flow. Secrets live only in
 * process memory and never reach disk, logs, or the database.
 *
 * The store interface is intentionally small (create/get/touch/setWebhookId/
 * destroy/sweep/all) so a Redis or KV adapter can drop in later without
 * touching call sites.
 */

import { randomBytes } from 'crypto';

// Build a new opaque session id. 32 bytes of entropy, base64url-encoded (no padding).
function newSessionId() {
  return randomBytes(32).toString('base64url');
}

/**
 * Create an in-memory session store.
 *
 * @param {object} opts
 * @param {number} opts.idleTtlMs  Sessions older than this since lastUsedAt are evicted.
 * @returns {{
 *   create:        ({clientId, secret}) => string,
 *   get:           (id) => SessionRecord | undefined,
 *   touch:         (id) => void,
 *   setWebhookId:  (id, webhookId) => void,
 *   destroy:       (id) => SessionRecord | undefined,
 *   sweep:         () => SessionRecord[],
 *   all:           () => Array<{id, createdAt, lastUsedAt, hasWebhook}>,
 * }}
 */
export function createSessionStore({ idleTtlMs }) {
  const records = new Map();

  function isExpired(record, now) {
    return now - record.lastUsedAt > idleTtlMs;
  }

  return {
    create({ clientId, secret }) {
      const id = newSessionId();
      const now = Date.now();
      records.set(id, {
        id,
        clientId,
        secret,
        webhookId: null,
        createdAt: now,
        lastUsedAt: now,
      });
      return id;
    },

    get(id) {
      const record = records.get(id);
      if (!record) return undefined;
      if (isExpired(record, Date.now())) {
        records.delete(id);
        return undefined;
      }
      return record;
    },

    touch(id) {
      const record = records.get(id);
      if (!record) return;
      record.lastUsedAt = Date.now();
    },

    setWebhookId(id, webhookId) {
      const record = records.get(id);
      if (!record) return;
      record.webhookId = webhookId;
    },

    destroy(id) {
      const record = records.get(id);
      if (!record) return undefined;
      records.delete(id);
      return record;
    },

    sweep() {
      const now = Date.now();
      const evicted = [];
      for (const [id, record] of records) {
        if (isExpired(record, now)) {
          evicted.push(record);
          records.delete(id);
        }
      }
      return evicted;
    },

    // Returns metadata only — no credentials. Used by sweepers and diagnostics.
    all() {
      return Array.from(records.values(), r => ({
        id: r.id,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        hasWebhook: r.webhookId !== null,
      }));
    },
  };
}
