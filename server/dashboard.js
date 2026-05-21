/**
 * FILE SUMMARY: Dashboard backend client (server-to-server)
 * DATA FLOW: POST /api/session/sso --> DashboardClient.fetchUserKeys
 *              --> GET dashboard-backend-prod.truv.com/v2/user_keys/
 * INTEGRATION PATTERN: Used by the SSO session-creation path to fetch the
 * signed-in user's API keys from the Truv dashboard backend, so the secret
 * never enters browser memory.
 *
 * Mirrors the normalized response shape from server/truv.js so route handlers
 * can branch on statusCode uniformly. Never throws — network errors surface
 * as { statusCode: 0, data: null, error }.
 */

import fetch from 'node-fetch';

export class DashboardClient {
  constructor({ baseUrl = 'https://dashboard-backend-prod.truv.com' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async _request(method, path, { accessToken, headers = {} } = {}) {
    const url = `${this.baseUrl}${path}`;
    const start = performance.now();

    const opts = {
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...headers,
      },
    };

    let response;
    try {
      response = await fetch(url, opts);
    } catch (err) {
      const durationMs = Math.round((performance.now() - start) * 10) / 10;
      console.log(`DASHBOARD: ${method} ${url} — network error: ${err.message} (${durationMs}ms)`);
      return { statusCode: 0, data: null, error: err.message, durationMs };
    }

    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    // Log status + minimal response shape. Do NOT log the bearer token or
    // raw key values. We only log whether keys came back and how many.
    const shape = (() => {
      if (data && typeof data === 'object') {
        if (Array.isArray(data.keys)) return `keys[${data.keys.length}]`;
        if (data.raw) return `raw(${(data.raw || '').slice(0, 80)}...)`;
        return `object(keys: ${Object.keys(data).join(',')})`;
      }
      return typeof data;
    })();
    console.log(`DASHBOARD: ${method} ${url} — ${response.status} ${shape} (${durationMs}ms) [headers sent: ${Object.keys(opts.headers).filter(h => h !== 'Authorization').join(', ')}]`);
    // On non-success, dump the body so we can read the actual error message.
    // Safe in this context — the dashboard backend's 4xx/5xx error bodies
    // describe what's wrong with the request, not the user's keys.
    if (response.status >= 400) {
      console.log(`DASHBOARD: error body: ${JSON.stringify(data).slice(0, 500)}`);
    }

    return { statusCode: response.status, data, durationMs };
  }

  // Fetch the signed-in user's API keys for a given company + env.
  // Pass companyId=undefined to let the dashboard fall back to the user's default.
  async fetchUserKeys({ accessToken, companyId, env = 'sandbox' }) {
    const headers = { 'x-dashboard-key-env': env };
    if (companyId !== undefined && companyId !== null) {
      headers['x-dashboard-company-id'] = companyId;
    }
    return this._request('GET', '/v2/user_keys/', { accessToken, headers });
  }

  // Fetch the signed-in user's profile. Used to discover default company id
  // when the access token doesn't carry it as a claim.
  async fetchMe({ accessToken }) {
    return this._request('GET', '/v2/me/', { accessToken });
  }
}
