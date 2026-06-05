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
  dashboardUrl = 'https://dashboard.truv.com',
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
        console.log('SSO: 503 sso_disabled');
        return res.status(503).json({ error: 'sso_disabled' });
      }

      const accessToken = req.body?.access_token;
      if (typeof accessToken !== 'string' || accessToken.length < 32 || accessToken.length > 4096) {
        console.log(`SSO: 400 invalid_input (token type=${typeof accessToken}, length=${accessToken?.length ?? 'n/a'})`);
        return res.status(400).json({ error: 'invalid_input' });
      }

      console.log(`SSO: fetching user_keys (token length=${accessToken.length})`);
      const result = await dashboardClient.fetchUserKeys({ accessToken, env: 'sandbox' });

      if (result.statusCode === 401 || result.statusCode === 403) {
        console.log(`SSO: 401 invalid_credentials (dashboard returned ${result.statusCode})`);
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      if (result.statusCode === 0 || result.statusCode >= 500) {
        console.log(`SSO: 502 truv_unreachable (dashboard returned ${result.statusCode}, error=${result.error || 'none'})`);
        return res.status(502).json({ error: 'truv_unreachable' });
      }
      if (result.statusCode >= 400) {
        console.log(`SSO: 502 (dashboard returned ${result.statusCode}, body preview=${JSON.stringify(result.data || {}).slice(0, 200)})`);
        return res.status(502).json({ error: 'truv_unreachable' });
      }

      // The dashboard /v2/user_keys/ response is keyed by environment
      // (sandbox/dev/prod), each with an active_keys[] array — not a flat
      // keys[]. The secret is exposed as `access_key`, the id as `client_id`.
      const env = 'sandbox';
      const activeKeys = Array.isArray(result.data?.[env]?.active_keys)
        ? result.data[env].active_keys
        : null;
      if (!activeKeys || activeKeys.length === 0) {
        console.log(`SSO: 409 no_keys_available (envs: ${result.data ? Object.keys(result.data).join(',') : 'no body'}; ${env}.active_keys=${result.data?.[env]?.active_keys?.length ?? 'n/a'})`);
        return res.status(409).json({
          error: 'no_keys_available',
          dashboard_url: `${dashboardUrl.replace(/\/$/, '')}/app/development/keys`,
        });
      }
      console.log(`SSO: dashboard returned ${activeKeys.length} ${env} key(s), using first`);

      // Use the dashboard's natural ordering. Implementation can refine if a
      // 'default' or 'primary' flag turns out to exist in the response.
      const firstKey = activeKeys[0];
      const clientId = firstKey.client_id;
      const secret = firstKey.access_key;

      if (typeof clientId !== 'string' || typeof secret !== 'string') {
        // Most likely the user lacks the CanViewKeys permission, so the
        // dashboard returns key metadata without client_id/access_key.
        console.error('sso_unexpected_key_shape', { keys_length: activeKeys.length, has_client_id: !!clientId, has_secret: !!secret });
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

  // PUT /api/session/keys — swap the credentials on an existing session in
  // place. Unregisters the old per-session webhook, validates the new keys,
  // registers a new webhook, then atomically updates the store. The session
  // id (and therefore the cookie) is preserved across the swap.
  router.put('/api/session/keys', limiter, async (req, res) => {
    try {
      if (!req.session) return res.status(401).json({ error: 'session_required' });

      const { client_id, secret } = req.body || {};
      if (!isValidCred(client_id) || !isValidCred(secret)) {
        return res.status(400).json({ error: 'invalid_input' });
      }

      // Probe the new credentials before tearing anything down. If they're
      // bad, the old session stays intact.
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

      const existing = store.get(req.session.id);
      if (!existing) return res.status(401).json({ error: 'session_required' });

      // Tear down the OLD webhook on the OLD account. Best-effort — a stuck
      // remote webhook is less bad than a stuck local session.
      if (existing.webhookId && typeof onSessionDestroyed === 'function') {
        try {
          await onSessionDestroyed({ record: { ...existing } });
        } catch (err) {
          console.error('override_teardown_failed', err.message);
        }
      }

      // Swap creds in place, then register a new webhook on the new account.
      store.updateCredentials(req.session.id, { clientId: client_id, secret, webhookId: null });

      if (typeof onSessionCreated === 'function') {
        try {
          const ok = await onSessionCreated({ id: req.session.id, client: probeClient });
          if (ok === false) {
            // New webhook registration failed. The credentials are swapped
            // but no webhook is attached. Surface a clear error so the user
            // knows webhooks won't be delivered.
            return res.status(502).json({ error: 'webhook_registration_failed' });
          }
        } catch {
          return res.status(502).json({ error: 'webhook_registration_failed' });
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('session_override_failed', err.message);
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
