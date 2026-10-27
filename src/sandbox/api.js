/**
 * FILE SUMMARY: The page's one way to talk to the server. Every answer has the same fields,
 * { status, data, calls }, including failures, so callers never branch on thrown errors.
 *   status  the HTTP status Truv answered with (0 if nothing came back)
 *   data    Truv's body
 *   calls   every Truv request the server made for this one, for the Dev panel
 */
import { API_BASE } from '../components/hooks.js';

export const isOk = (env) => env.status >= 200 && env.status < 300;

export async function api(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}/api/sandbox${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = {};
    try { json = await res.json(); } catch { /* an empty or non-JSON answer */ }
    if (res.status === 401) return { status: 401, data: { error: { code: 'session_required' } }, calls: [] };
    if (typeof json.status === 'number') return { calls: [], ...json };
    return { status: res.status, data: { error: { code: json.error || 'request_failed', message: json.message || '' } }, calls: [] };
  } catch (e) {
    return { status: 0, data: { error: { code: 'network_error', message: e.message } }, calls: [] };
  }
}
