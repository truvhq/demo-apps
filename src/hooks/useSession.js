/**
 * FILE SUMMARY: Frontend session state hook
 * DATA FLOW: GET /api/session/status -> useSession({authenticated, loading})
 *            POST /api/session  -> server stores creds, sets cookie, hook re-fetches
 *            DELETE /api/session -> server clears cookie, hook re-fetches
 *
 * The browser never holds raw credentials in JS — only the HttpOnly cookie that
 * the server set. This hook exposes just the boolean and lets the UI decide
 * whether to render the Configure gate or the demos.
 */
import { useEffect, useState, useCallback } from 'preact/hooks';

export function useSession() {
  const [state, setState] = useState({ authenticated: false, loading: true });

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/session/status', { credentials: 'include' });
      const data = await res.json();
      setState({ authenticated: !!data.authenticated, loading: false });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }, []);

  const submit = useCallback(async (clientId, secret) => {
    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret }),
    });
    if (res.ok) {
      await refresh();
      return { ok: true };
    }
    let body = {};
    try { body = await res.json(); } catch {}
    const retryAfter = res.headers.get('Retry-After');
    return { ok: false, status: res.status, error: body.error, retryAfter };
  }, [refresh]);

  // SSO: posts the Auth0 access token to the backend, which fetches keys
  // from dashboard-backend-prod.truv.com and creates a session. The access
  // token never goes anywhere else from this hook's perspective.
  const submitSso = useCallback(async (accessToken) => {
    if (typeof accessToken !== 'string' || accessToken.length < 32) {
      return { ok: false, status: 400, error: 'invalid_input' };
    }
    const res = await fetch('/api/session/sso', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (res.ok) {
      await refresh();
      return { ok: true };
    }
    let body = {};
    try { body = await res.json(); } catch {}
    const retryAfter = res.headers.get('Retry-After');
    return { ok: false, status: res.status, error: body.error, retryAfter, ...body };
  }, [refresh]);

  const reset = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
    await refresh();
  }, [refresh]);

  // Override: swap the keys on the current session without losing it.
  // Used after SSO so the visitor can manually replace the auto-picked
  // keys without going through a full reset + reconfigure.
  const override = useCallback(async (clientId, secret) => {
    const res = await fetch('/api/session/keys', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret }),
    });
    if (res.ok) {
      return { ok: true };
    }
    let body = {};
    try { body = await res.json(); } catch {}
    const retryAfter = res.headers.get('Retry-After');
    return { ok: false, status: res.status, error: body.error, retryAfter };
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, submit, submitSso, reset, override, refresh };
}
