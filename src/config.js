/**
 * FILE SUMMARY: Frontend runtime configuration
 * DATA FLOW: server/index.js injects window.__DEMO_CONFIG__ into the served HTML
 *            at request time -> this module reads it -> components import the URLs
 * INTEGRATION PATTERN: Mirrors the runtime BRIDGE_URL override. Values are set by
 * the operator's env and injected into the built HTML, so one build can target
 * any environment without a rebuild.
 *
 * Local dev (Vite dev server) has no injection, so everything falls back to prod.
 */

// The dashboard frontend origin the "Get/Sign up for API keys" and "webhook
// config" links point at. Overridable per-environment via the DASHBOARD_URL
// server env var; defaults to prod.
const DASHBOARD_BASE = (
  (typeof window !== 'undefined' && window.__DEMO_CONFIG__?.dashboardUrl)
  || 'https://dashboard.truv.com'
).replace(/\/$/, '');

export const DASHBOARD_URL = DASHBOARD_BASE;
export const DASHBOARD_KEYS_URL = `${DASHBOARD_BASE}/app/development/keys`;
export const DASHBOARD_WEBHOOKS_URL = `${DASHBOARD_BASE}/app/development/webhooks`;
