/**
 * FILE SUMMARY: Server configuration & run mode (the only file with deployment settings)
 *
 * LOCAL DEVELOPMENT needs nothing here beyond API_CLIENT_ID and API_SECRET in
 * .env. With those set, `npm start` runs every demo against your own Truv
 * sandbox — no Configure screen, one shared webhook, zero extra config.
 *
 * Everything else below is DEPLOYMENT-only: the knobs that turn the demo into
 * the public, multi-tenant app (per-visitor keys, SSO, a public webhook
 * origin). They're collected here so they stay out of the way of local work.
 * Full guide: docs/DEPLOYMENT.md.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';

const env = process.env;

// Run mode. `localMode` keeps a single TruvClient built from your .env
// credentials and is the default for local development. Hosted (multi-tenant,
// bring-your-own-keys) mode is what deployments run; it's inferred from
// PUBLIC_BASE_URL being set. An explicit ALLOW_ENV_FALLBACK_CREDS wins either way.
const publicBaseUrl = env.PUBLIC_BASE_URL || '';
const localMode = env.ALLOW_ENV_FALLBACK_CREDS
  ? env.ALLOW_ENV_FALLBACK_CREDS === 'true'
  : !publicBaseUrl;

const creds = { clientId: env.API_CLIENT_ID, secret: env.API_SECRET };

// Fail fast with an actionable message rather than failing deep in a request.
if (localMode && (!creds.clientId || !creds.secret)) {
  console.error('Local mode needs API_CLIENT_ID and API_SECRET in .env — add your sandbox keys from https://dashboard.truv.com/app/development/keys');
  process.exit(1);
}
if (!localMode && !publicBaseUrl) {
  // Only reachable when ALLOW_ENV_FALLBACK_CREDS=false is set explicitly.
  console.error('Hosted mode needs PUBLIC_BASE_URL. See docs/DEPLOYMENT.md.');
  process.exit(1);
}
if (!localMode && !env.SESSION_COOKIE_SECRET) {
  console.warn('SESSION_COOKIE_SECRET is not set — using a random per-process value; sessions reset on restart.');
}

export const config = {
  port: env.PORT || 3000,

  // True for local dev: use the shared .env client for every request.
  localMode,
  creds,

  // The origin a Truv account reaches us at to deliver webhooks. Hosted sets
  // PUBLIC_BASE_URL; local dev can point an ngrok tunnel at it via NGROK_URL.
  publicBaseUrl,
  webhookBaseUrl: localMode ? (env.NGROK_URL || publicBaseUrl) : publicBaseUrl,

  session: {
    idleTtlMs: Number(env.SESSION_IDLE_TTL_MS) || 3_600_000,
    cookieSecret: env.SESSION_COOKIE_SECRET || randomBytes(32).toString('hex'),
  },

  // Dashboard frontend origin (key/webhook deep links) and backend origin
  // (SSO key fetch). Both default to prod.
  dashboard: {
    url: (env.DASHBOARD_URL || 'https://dashboard.truv.com').replace(/\/$/, ''),
    backendUrl: env.DASHBOARD_BACKEND_URL || 'https://dashboard-backend-prod.truv.com',
  },

  // "Sign in with Truv" via Auth0. Enabled only when domain + client id exist;
  // otherwise the SSO route returns 503 and the UI shows the paste flow.
  sso: {
    enabled: Boolean(env.VITE_AUTH0_DOMAIN && env.VITE_AUTH0_CLIENT_ID),
    domain: env.VITE_AUTH0_DOMAIN || '',
    clientId: env.VITE_AUTH0_CLIENT_ID || '',
    audience: env.VITE_AUTH0_AUDIENCE || '',
  },

  // Bridge script URL baked into the built HTML; overridable per environment.
  bridgeUrl: env.BRIDGE_URL || 'https://cdn.truv.com/bridge.js',
};
