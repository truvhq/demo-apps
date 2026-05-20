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
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

let _clientPromise = null;

export function isSsoConfigured() {
  return Boolean(domain && clientId && audience);
}

function getClient() {
  if (!isSsoConfigured()) {
    throw new Error('Auth0 is not configured. Set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, and VITE_AUTH0_AUDIENCE.');
  }
  if (!_clientPromise) {
    _clientPromise = createAuth0Client({
      domain,
      clientId,
      authorizationParams: {
        audience,
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      },
      // Use refresh tokens stored in memory so getAccessTokenSilently works
      // across page reloads without bouncing through Auth0.
      useRefreshTokens: true,
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

export async function getAccessToken() {
  const client = await getClient();
  return client.getTokenSilently();
}

// Logout from Auth0 in addition to clearing the demo session. We don't
// use this on the "Update API keys" path — the brainstorm explicitly said
// not to kill the dashboard session. Exposed for future use only.
export async function fullSignOut() {
  const client = await getClient();
  await client.logout({ logoutParams: { returnTo: window.location.origin } });
}
