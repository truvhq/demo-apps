/**
 * FILE SUMMARY: Session lifecycle routes for BYO API credentials
 * DATA FLOW: Frontend -> POST /api/session { client_id, secret }
 *              -> validate -> probe Truv (listWebhooks) -> store -> Set-Cookie
 *            Frontend -> DELETE /api/session
 *              -> destroy session -> Clear-Cookie
 *
 * Validation probe: an inexpensive listWebhooks call confirms the credentials
 * are valid before we store them. Bad keys surface as a clean 401 on the
 * Configure screen instead of opaque failures inside a downstream demo.
 *
 * Webhook registration for the session is handled in U4 (a follow-up to this
 * unit). This module owns body validation, the probe, and the cookie lifecycle.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { TruvClient } from '../truv.js';
import { SESSION_COOKIE_NAME, signSessionId } from '../sessions/cookie.js';

const MIN_CRED_LEN = 8;
const MAX_CRED_LEN = 256;

function isValidCred(value) {
  return typeof value === 'string'
    && value.length >= MIN_CRED_LEN
    && value.length <= MAX_CRED_LEN;
}

function cookieOptions({ ttlMs }) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlMs,
  };
}

export default function sessionRoutes({ store, cookieSecret, idleTtlMs, onSessionCreated, onSessionDestroyed, rateLimitWindowMs = 600_000, rateLimitMax = 10 }) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  router.post('/api/session', limiter, async (req, res) => {
    try {
      const { client_id, secret } = req.body || {};

      if (!isValidCred(client_id) || !isValidCred(secret)) {
        return res.status(400).json({ error: 'invalid_input' });
      }

      // Probe the credentials with a cheap read before storing.
      const probeClient = new TruvClient({ clientId: client_id, secret });
      let probe;
      try {
        probe = await probeClient.listWebhooks();
      } catch {
        return res.status(502).json({ error: 'truv_unreachable' });
      }

      if (probe.statusCode === 401 || probe.statusCode === 403) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      if (probe.statusCode >= 400) {
        return res.status(502).json({ error: 'truv_unreachable' });
      }

      const id = store.create({ clientId: client_id, secret });

      // Hook for U4 (webhook registration). If it throws or returns false,
      // roll back the session so the user sees a clear error.
      if (typeof onSessionCreated === 'function') {
        try {
          const ok = await onSessionCreated({ id, client: probeClient });
          if (ok === false) {
            store.destroy(id);
            return res.status(502).json({ error: 'webhook_registration_failed' });
          }
        } catch {
          store.destroy(id);
          return res.status(502).json({ error: 'webhook_registration_failed' });
        }
      }

      res.cookie(SESSION_COOKIE_NAME, signSessionId(id, cookieSecret), cookieOptions({ ttlMs: idleTtlMs }));
      res.json({ ok: true });
    } catch (err) {
      console.error('session_create_failed', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  router.delete('/api/session', async (req, res) => {
    const id = req.session?.id;
    if (!id) {
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return res.status(204).end();
    }

    const record = store.destroy(id);

    // Hook for U4 (webhook unregistration). Errors are logged, not surfaced —
    // the local session is gone either way and stuck remote webhooks are
    // less harmful than a UI stuck in a configured state.
    if (record && typeof onSessionDestroyed === 'function') {
      try {
        await onSessionDestroyed({ record });
      } catch (err) {
        console.error('session_teardown_failed', err.message);
      }
    }

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  router.get('/api/session/status', (req, res) => {
    res.json({ authenticated: req.session !== null });
  });

  return router;
}
