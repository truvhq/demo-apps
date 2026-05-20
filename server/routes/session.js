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

export default function sessionRoutes({
  store,
  cookieSecret,
  idleTtlMs,
  onSessionCreated,
  onSessionDestroyed,
  dashboardClient,
  ssoEnabled = true,
  rateLimitWindowMs = 600_000,
  rateLimitMax = 10,
}) {
  const router = Router();

  // Shared rate limiter — paste and SSO both hit the same per-IP budget so a
  // visitor can't bypass the limit by toggling between the two entry points.
  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  async function createSession(req, res, { clientId, secret, probeClient }) {
    const id = store.create({ clientId, secret });

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
  }

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

      return createSession(req, res, { clientId: client_id, secret, probeClient });
    } catch (err) {
      console.error('session_create_failed', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/session/sso — auto-populate keys via Auth0 + dashboard backend.
  // Body: { access_token: string }. Picks the first key from the user's default
  // company at sandbox env.
  router.post('/api/session/sso', limiter, async (req, res) => {
    try {
      if (!ssoEnabled || !dashboardClient) {
        return res.status(503).json({ error: 'sso_disabled' });
      }

      const accessToken = req.body?.access_token;
      if (typeof accessToken !== 'string' || accessToken.length < 32 || accessToken.length > 4096) {
        return res.status(400).json({ error: 'invalid_input' });
      }

      const result = await dashboardClient.fetchUserKeys({ accessToken, env: 'sandbox' });

      if (result.statusCode === 401 || result.statusCode === 403) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      if (result.statusCode === 0 || result.statusCode >= 500) {
        return res.status(502).json({ error: 'truv_unreachable' });
      }
      if (result.statusCode >= 400) {
        return res.status(502).json({ error: 'truv_unreachable' });
      }

      const keys = Array.isArray(result.data?.keys) ? result.data.keys : null;
      if (!keys || keys.length === 0) {
        return res.status(409).json({
          error: 'no_keys_available',
          dashboard_url: 'https://dashboard.truv.com/app/development/keys',
        });
      }

      // Use the dashboard's natural ordering. Implementation can refine if a
      // 'default' or 'primary' flag turns out to exist in the response.
      const firstKey = keys[0];
      const clientId = firstKey.client_id || firstKey.clientId;
      const secret = firstKey.secret || firstKey.access_secret;

      if (typeof clientId !== 'string' || typeof secret !== 'string') {
        console.error('sso_unexpected_key_shape', { keys_length: keys.length, has_client_id: !!clientId, has_secret: !!secret });
        return res.status(502).json({ error: 'truv_unreachable' });
      }

      // Build a Truv client now so the per-session webhook callback can use it
      // without re-creating one downstream.
      const probeClient = new TruvClient({ clientId, secret });
      return createSession(req, res, { clientId, secret, probeClient });
    } catch (err) {
      console.error('session_sso_failed', err.message);
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
