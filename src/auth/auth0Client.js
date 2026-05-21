/**
 * FILE SUMMARY: Auth0 SPA wrapper for the BYO-keys SSO flow
 * DATA FLOW: ConfigureScreen "Sign in with Truv" -> signIn() -> auth.truv.com
 *            auth.truv.com redirects back with ?code -> handleCallback()
 *            getAccessToken() -> POST /api/session/sso { access_token }
 *
 * Holds a single Auth0Client instance lazily initialized from VITE_AUTH0_*
 * env vars. The access token lives in the SDK's in-memory cache; the rest of
 * the app never touches it directly.
 */

import { createAuth0Client } from '@auth0/auth0-spa-js';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
// Audience is optional. When set, we additionally request an access token for
// that API. When unset, we use the ID token as the bearer to the dashboard
// backend (which is what dashboard.truv.com itself does).
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

let _clientPromise = null;

export function isSsoConfigured() {
  return Boolean(domain && clientId);
}

function getClient() {
  if (!isSsoConfigured()) {
    throw new Error('Auth0 is not configured. Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID.');
  }
  if (!_clientPromise) {
    _clientPromise = createAuth0Client({
      domain,
      clientId,
      authorizationParams: {
        ...(audience ? { audience } : {}),
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      },
      cacheLocation: 'memory',
    });
  }
  return _clientPromise;
}

export async function signIn() {
  const client = await getClient();
  await client.loginWithRedirect();
}

export function hasCallbackParams() {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

export async function handleCallback() {
  const client = await getClient();
  await client.handleRedirectCallback();
  // Clean the URL: drop ?code and ?state so a refresh doesn't try to re-process.
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}

// Returns the raw ID token JWT. dashboard-backend accepts this as a Bearer
// (matches the request shape from dashboard.truv.com itself). If an audience
// is configured, callers can switch to client.getTokenSilently() instead.
export async function getIdToken() {
  const client = await getClient();
  const claims = await client.getIdTokenClaims();
  if (!claims?.__raw) {
    throw new Error('No ID token available — sign in again.');
  }
  return claims.__raw;
}

// Logout from Auth0 in addition to clearing the demo session. We don't
// use this on the "Update API keys" path — the brainstorm explicitly said
// not to kill the dashboard session. Exposed for future use only.
export async function fullSignOut() {
  const client = await getClient();
  await client.logout({ logoutParams: { returnTo: window.location.origin } });
}
