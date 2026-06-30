---
name: feat-sso-auto-populate-keys
description: One-click "Sign in with Truv" onboarding that authenticates via Auth0 (auth.truv.com), fetches the user's sandbox API keys from dashboard-backend-prod.truv.com, and creates a demo session — paste flow stays as the fallback.
status: active
created: 2026-05-20
type: feat
depth: standard
origin: docs/brainstorms/2026-05-20-sso-auto-populate-keys-requirements.md
---

# Sign in with Truv: auto-populate demo API keys

## Summary

Today the Configure screen on `demo.truv.com` asks every visitor to paste their `client_id` and `secret` (shipped in PR #31, currently live on `feat/byo-api-credentials`). Existing Truv customers signed into `dashboard.truv.com` shouldn't have to copy-paste keys they already own — the dashboard exposes `GET https://dashboard-backend-prod.truv.com/v2/user_keys/` behind Auth0, and we can collapse the five-step copy-paste into a single click.

This plan adds an Auth0 PKCE flow on the frontend, a server-to-server dashboard client on the backend, and a new `POST /api/session/sso` endpoint that creates a session via the same machinery `/api/session` already uses (per-session webhook, in-memory store, signed cookie). The paste form stays reachable behind a "Use a key instead" affordance, so prospects without a Truv account see no regression.

---

## Problem Frame

PR #31 already solved the multi-tenant security and session lifecycle problems. What it didn't solve is friction for the highest-intent visitor: an authenticated Truv customer who already has working keys on their dashboard. For that visitor, the paste step is pure friction. SSO turns the Configure screen into a one-click entry for them while leaving paste intact for everyone else.

---

## Requirements

Traceability to the origin brainstorm (`docs/brainstorms/2026-05-20-sso-auto-populate-keys-requirements.md`):

- **F1. Signed-in fast path** (existing Truv customer): one click → session created → industry picker.
- **F2. Fallback paste**: visitor without a Truv account uses the existing paste flow.
- **F3. SSO with no keys yet**: empty-state UI directing the user to dashboard to create a key.
- **F4. Reset / re-auth**: existing "Update API keys" semantics; demo session cleared, Auth0 session untouched.
- **AE1-AE5**: covered by the implementation units below.

---

## Key Technical Decisions

### Reuse the dashboard's Auth0 SPA client; do not provision a new one

The pasted JWT shows `aud: 6eJFq3X9A2pPdSyoTIavRUmi3fYbgS3J` (the dashboard's Auth0 SPA client). The simplest path is to add `https://demo.truv.com` and `http://localhost:5173` to that client's Allowed Callback URLs and Allowed Web Origins. Dashboard-backend already accepts tokens with this audience — no backend-side changes needed beyond CORS. Alternative (new client + dashboard-side audience config) is documented under Alternatives below.

### Backend-to-dashboard call, not frontend-to-dashboard

The brainstorm decided this: the frontend only ever holds the Auth0 access token (short-lived, limited scope). The API secret travels Auth0 → demo backend → dashboard backend → demo session store, never via the browser. Trade-off: a frontend-direct call would save one network hop and remove the need for the demo backend to coordinate CORS on dashboard-backend — but it surfaces the secret in browser memory, which is the precise thing PR #31's HttpOnly cookie design avoids.

### `@auth0/auth0-spa-js` as the SPA integration

Official Auth0 SDK, framework-agnostic (works fine with Preact), ~13 KB gzipped, handles PKCE + silent renewal + redirect callback parsing. Single small dependency, well-maintained, no Preact wrapper needed. Alternative is a hand-rolled PKCE flow (10x more code, easy to get wrong).

### Sandbox-only via SSO; production keys remain paste-only

Hard-coded `x-dashboard-key-env: sandbox` on the dashboard call. The plan does **not** add a production toggle. This is a safety property of the SSO flow that the user can't override from the UI — even though we send the header from the demo backend, the assumption is that dashboard-backend enforces it server-side. Verifying that enforcement is a planning-time call-out (see Dependencies).

### Reuse the existing session store + webhook flow

`/api/session/sso` is structurally a sibling of `/api/session`: same store, same `onSessionCreated` webhook registration, same `__Host-demo_sid` signed cookie, same TTL. The two routes differ only in how they get the `{clientId, secret}` — paste reads them from the request body, SSO reads them from a dashboard backend call.

### Auth0 access token is single-use

The backend uses the access token for exactly one call (`GET /v2/user_keys/`) and discards it. We do not store the token, refresh it, or carry it forward in the session record. The session's identity is the random `__Host-demo_sid`, not the Auth0 token.

---

## Architecture and Data Flow

```
Browser                        demo backend                   dashboard-backend-prod
  |                                |                                 |
  | -- click "Sign in with Truv"   |                                 |
  | -> Auth0 PKCE redirect ------------------> auth.truv.com         |
  | <- callback with code ---------|                                 |
  | -- exchange code for token (in browser via auth0-spa-js)         |
  |                                |                                 |
  | -- POST /api/session/sso ----->|                                 |
  | { access_token }               | rate-limit by IP                |
  |                                | (optional) decode token to get  |
  |                                |   default company id            |
  |                                | -- GET /v2/user_keys/ --------->|
  |                                |    Authorization: Bearer <tok>  |
  |                                |    x-dashboard-company-id: <id> |
  |                                |    x-dashboard-key-env: sandbox |
  |                                | <----- { keys: [...] } ---------|
  |                                | pick first sandbox key          |
  |                                | sessionStore.create(creds)      |
  |                                | onSessionCreated -> register    |
  |                                |   per-session webhook (existing)|
  | <-- 200 { ok: true }  +        |                                 |
  |     Set-Cookie __Host-demo_sid |                                 |
  | -- discard access token        |                                 |
  | -> navigate to home            |                                 |
```

*Directional sequence for review; the implementing agent treats it as context, not code to reproduce.*

---

## System-Wide Impact

| Surface | Change |
|---|---|
| `package.json` | Adds `@auth0/auth0-spa-js` (one new runtime dep). |
| `server/dashboard.js` *(new)* | Thin server-to-server client wrapping `GET /v2/user_keys/` and (if needed) `GET /v2/me`. Pattern follows `server/truv.js`. |
| `server/routes/session.js` | Adds `POST /api/session/sso` alongside the existing `POST /api/session`. Shares the same `onSessionCreated` hook and cookie helpers. |
| `server/index.js` | Wires the dashboard client into the `sessionRoutes` factory (or instantiates it per request). |
| `.env.example`, `server/index.js` env validation | New env vars: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` (frontend-visible via Vite), `DASHBOARD_BACKEND_URL` (defaults to `https://dashboard-backend-prod.truv.com`). |
| `src/components/ConfigureScreen.jsx` | Reshape: primary CTA is "Sign in with Truv", paste form collapses behind a "Use a key instead" link. Adds the empty-keys state. |
| `src/hooks/useSession.js` | New `submitSso(accessToken)` method alongside the existing `submit(clientId, secret)`. |
| `src/auth/auth0Client.js` *(new)* | Wraps `@auth0/auth0-spa-js` with the demo's config; exposes `loginWithRedirect`, `handleRedirectCallback`, `getAccessTokenSilently`. |
| `src/App.jsx` | Routes through the Auth0 callback URL before letting the existing hash router run. |
| `tests/server/lib/dashboard.test.js` *(new)* | Unit tests for the dashboard client. |
| `tests/server/routes/session.test.js` | New describe block for `POST /api/session/sso` (extends existing file rather than creating a parallel one). |

---

## Implementation Units

### U1. Backend dashboard client

**Goal:** A small, well-tested module that wraps `GET /v2/user_keys/` (and optionally `GET /v2/me`) on `dashboard-backend-prod.truv.com`, with normalized responses and explicit error shapes.

**Requirements:** F1, F3, AE1, AE3.

**Dependencies:** none.

**Files:**
- Create: `server/dashboard.js`
- Create: `tests/server/dashboard.test.js`

**Approach:**
- Class or factory `DashboardClient({ baseUrl, fetchImpl })` mirroring the `TruvClient` pattern in `server/truv.js`.
- Method `fetchUserKeys({ accessToken, companyId, env })` → returns `{ statusCode, data, durationMs }` (same normalized shape as `TruvClient._request`).
- Sends `Authorization: Bearer <accessToken>`, `x-dashboard-company-id`, `x-dashboard-key-env`, `Accept: application/json`.
- Method `fetchMe({ accessToken })` if a `/v2/me` lookup is needed for default company resolution — implementer verifies whether this endpoint exists at integration time. If a JWT custom claim provides the company id directly, this method is unused and can be dropped.
- Reuses `node-fetch` (already a dep).
- No retry logic in U1; failure modes surface to the route handler.

**Patterns to follow:**
- `server/truv.js` — same shape: `constructor({...})`, normalized `_request`, `node-fetch`.
- `server/webhook-setup.js` `unregisterWebhook` — best-effort, never throws, returns `{ ok, error }`.

**Execution note:** Implement test-first. The client is a pure I/O wrapper and is the canonical place to pin the response-shape assumption while we verify against the live endpoint.

**Test scenarios:**
- Happy path: `fetchUserKeys` with a valid token returns `{ statusCode: 200, data }`; assert headers sent include `Authorization`, `x-dashboard-company-id`, `x-dashboard-key-env`.
- 401 from dashboard: `fetchUserKeys` returns `{ statusCode: 401, data }`; client does not throw.
- 5xx from dashboard: returns `{ statusCode: 502, data }`; client does not throw.
- Network error (`fetch` rejects): returns `{ statusCode: 0, data: null, error: <message> }` or similar; client does not throw.
- Empty result: `data.keys === []`; returned verbatim to the caller — the client does not interpret empty-keys as an error.
- Header omission: omits `x-dashboard-company-id` when caller passes `undefined`, so the dashboard backend's default company applies.

**Verification:** `npm test -- dashboard` is fully green. `git grep "dashboard-backend-prod"` shows references only in `server/dashboard.js` and `.env.example`.

---

### U2. `POST /api/session/sso` route

**Goal:** A new session-creation route that takes an Auth0 access token, fetches keys via the dashboard client, and lands a session in the existing store (via the same `onSessionCreated` hook the paste route uses).

**Requirements:** F1, F3, AE1, AE3, AE4.

**Dependencies:** U1.

**Files:**
- Modify: `server/routes/session.js`
- Modify: `server/index.js` (pass dashboard client into the routes factory)
- Modify: `tests/server/routes/session.test.js` (extend, do not duplicate)

**Approach:**
- Extend the `sessionRoutes` factory signature to accept `dashboardClient`.
- New handler `POST /api/session/sso` accepts `{ access_token }` in the body. Optional `company_id` for future overrides; ignored by the auto-pick path in this plan.
- Validation: `access_token` is a non-empty string between 32 and 4096 chars; reject otherwise with `400 invalid_input`.
- Rate limit: apply the same `express-rate-limit` instance currently guarding `POST /api/session` (10 attempts / 10 min / IP, plus the daily ceiling once U7 lands in PR #31's sweeper PR). One shared limiter for both session-creation routes.
- Default company resolution: implementer picks one of (a) decode a custom claim on the JWT (deferred to implementation), (b) call `dashboardClient.fetchMe()` first. Plan does not pre-commit; whichever works first wins.
- Call `dashboardClient.fetchUserKeys({ accessToken, companyId, env: 'sandbox' })`.
- If `statusCode === 401` → return `401 invalid_credentials` (token expired/invalid).
- If `statusCode === 403` → return `401 invalid_credentials` (treat as the same user-facing error).
- If `statusCode >= 500` or network error → `502 truv_unreachable` (reuse existing copy/key).
- If `data.keys?.length === 0` → return `409 no_keys_available` with a body containing a hint URL (`https://dashboard.truv.com/app/development/keys`). The frontend uses this to render the empty-state.
- Pick the first sandbox key from `data.keys` (assumption — implementer verifies shape and picks the documented "default" key if shape supports it).
- `store.create({ clientId, secret })` → `onSessionCreated({ id, client })` (existing webhook-registration hook). If `onSessionCreated` returns false, rollback by `store.destroy(id)` and return `502 webhook_registration_failed` (matching the existing route's behavior).
- Set the existing signed cookie. Respond `200 { ok: true }`.
- Do NOT log the access token, the returned client_id, or the returned secret. Do NOT echo the access token back in any response body.

**Patterns to follow:**
- `POST /api/session` in `server/routes/session.js` — same validation → probe → store → cookie pipeline. SSO replaces "probe with `listWebhooks`" with "fetch from dashboard"; everything downstream is shared.
- `onSessionCreated` rollback semantics in the same file.

**Execution note:** Implement integration-test-first. The shared rate limiter and cookie path are the parts most likely to regress; pin them with a test that creates a session via SSO and then calls a protected route with the returned cookie.

**Test scenarios:**

Happy paths:
- `POST /api/session/sso` with a valid token and a successful dashboard call → `200 { ok: true }`, `Set-Cookie: __Host-demo_sid=…`, `store.get(sid)` returns the dashboard-supplied `{clientId, secret}`.
- Covers AE1. Followed by `POST /api/orders` (or `GET /api/session/status`) with the returned cookie → request succeeds with the right `req.truv` populated.

Edge cases:
- Missing `access_token` → `400 invalid_input`.
- `access_token` is an empty string → `400`.
- `access_token` exceeds 4096 chars → `400`.
- Dashboard returns `{ keys: [] }` → `409 no_keys_available`, no session created. Covers AE3.
- Dashboard returns multiple sandbox keys → first one is selected (deterministic). Note in the response that ordering follows the dashboard's response order; we do not re-sort.

Error/failure paths:
- Dashboard returns 401 → `401 invalid_credentials`, no session, response body never contains the access token.
- Dashboard returns 5xx → `502 truv_unreachable`, no session.
- Dashboard fetch throws (network error) → `502 truv_unreachable`, no session.
- `onSessionCreated` (per-session webhook registration on the user's Truv account) throws → `502 webhook_registration_failed`, session destroyed (rollback assertion).
- Rate-limit exceeded → `429`, `Retry-After` header set. Same limiter as paste path.
- Access token belongs to a user with no default company AND `companyId` not provided → resolver fails with a clean error (`400 no_default_company` or `502 truv_unreachable`, implementer picks based on the resolution mechanism).

Integration:
- Logging assertion: no `console.log`/`error` call during a successful SSO request contains the access token, returned client_id, or returned secret.

**Verification:** `npm test -- session` is fully green. Manual `curl` with a valid Auth0 access token returns a session cookie; subsequent `GET /api/session/status` reports `{ authenticated: true }`.

---

### U3. Frontend Auth0 wrapper and session hook integration

**Goal:** A small Auth0 client module the rest of the frontend talks to, plus a `submitSso(token)` method on `useSession` that mirrors the existing `submit(clientId, secret)`.

**Requirements:** F1, F4, AE1, AE4, AE5.

**Dependencies:** U2.

**Files:**
- Create: `src/auth/auth0Client.js`
- Modify: `src/hooks/useSession.js`
- Modify: `package.json` (add `@auth0/auth0-spa-js`)
- Create: `tests/frontend/auth0Client.test.js` *(only if a frontend test harness exists for this; otherwise mark as manual verification)*

**Approach:**
- `auth0Client.js` exports an initialized `Auth0Client` singleton built from `AUTH0_DOMAIN` (`auth.truv.com`), `AUTH0_CLIENT_ID`, and `AUTH0_AUDIENCE` env vars (read via `import.meta.env`). Vite exposes `VITE_*` vars to the client bundle; the env vars in `.env.example` are `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.
- Exposes `signIn()` (calls `loginWithRedirect`), `handleCallback()` (parses `code`/`state` from URL, exchanges for token, clears history), `getAccessToken()` (silent fetch).
- `useSession.submitSso(accessToken)` posts to `/api/session/sso` and on success calls `refresh()`. Same error-mapping as `submit()`.
- The Auth0 access token lives in the SDK's in-memory cache. We do not stash it in the hook or in any component state once SSO completes.

**Patterns to follow:**
- `src/hooks/useSession.js` `submit()` — same fetch pattern with `credentials: 'include'`, same error parsing.
- The `useSession` hook returns object pattern; do not introduce a Context provider for SSO state unless and until the frontend grows multiple consumers.

**Test scenarios:**

Happy path:
- `submitSso(token)` calls `fetch('/api/session/sso', {credentials: 'include', body: {access_token: token}})`; on `200` the hook re-runs `/api/session/status` and reports `authenticated: true`.

Edge cases:
- `submitSso` called with empty string → no fetch fires; the hook returns the same validation error shape as `submit`.

Error paths:
- 401 from `/api/session/sso` → hook returns `{ ok: false, status: 401, error: 'invalid_credentials' }`.
- 409 from `/api/session/sso` → returns `{ ok: false, status: 409, error: 'no_keys_available' }` for the empty-state UI to consume.
- 429 → same `Retry-After` mapping as `submit`.

**Verification:** From a browser dev console at a running dev server, `await window.__auth.signIn()` (if exposed for dev) round-trips through Auth0 and returns to the callback. Manual: clearing the cookie and clicking "Sign in with Truv" results in `Set-Cookie` and `GET /api/session/status` returning `authenticated: true`.

---

### U4. Configure screen restructure

**Goal:** "Sign in with Truv" is the primary action; the paste form is reachable but collapsed behind "Use a key instead". The empty-keys state is reachable from `submitSso` returning 409.

**Requirements:** F1, F2, F3, AE1, AE2, AE3.

**Dependencies:** U3.

**Files:**
- Modify: `src/components/ConfigureScreen.jsx`
- Modify: `src/App.jsx` (handle the Auth0 callback URL — see U6 for routing detail).

**Approach:**
- Layout:
  1. Logo + title ("Personalize your demo") + subtitle (existing copy).
  2. **Primary button: "Sign in with Truv"** — full-width, filled primary. Click → `auth0Client.signIn()`.
  3. Small link/button below: "Use a key instead" — toggles the existing paste form (current SecretInput components, Start demo button) into view.
  4. Secondary button row at the bottom: "Sign up to get API keys" (existing, unchanged).
- State: `mode: 'sso' | 'paste'`. Default `'sso'`. "Use a key instead" sets `'paste'`.
- The trust footer ("Kept in memory for this session…") stays for both modes.
- Empty-keys state: when `submitSso` returns `409 no_keys_available`, replace the form with a card titled "You don't have any API keys yet" + a CTA "Create your first API key" (links to `https://dashboard.truv.com/app/development/keys`) + a small "Or paste a key now" link that flips to `mode: 'paste'`.

**Patterns to follow:**
- `src/components/ConfigureScreen.jsx` existing button + input + footer composition.
- `Icons.shieldCheck`, `Icons.truvLogo` already imported.

**Test scenarios:**

Happy paths:
- Default render: "Sign in with Truv" visible, paste form hidden, "Use a key instead" affordance present.
- Click "Use a key instead" → paste form revealed (existing form, unchanged behavior). Covers AE2.
- After successful `submitSso`, app navigates past the Configure screen (gate falls away).

Edge cases:
- "Use a key instead" toggles back and forth without losing state on the paste inputs (or, if state must reset, document why and test that explicitly).

Error/failure paths:
- `submitSso` returns 409 → empty-state card renders; "Or paste a key now" toggles to paste mode. Covers AE3.
- `submitSso` returns 401 → error banner above the "Sign in with Truv" button: "Sign-in expired. Please try again." Auth0 token is re-acquired on the next click.
- `submitSso` returns 502 → "Truv is unreachable. Try again shortly" banner.

**Verification:** Manual browser smoke: clear cookie → see "Sign in with Truv" first; click it → Auth0 redirect → return to demo → industry picker visible. Toggle "Use a key instead" → existing paste flow works unchanged.

---

### U5. Auth0 callback handling in the SPA shell

**Goal:** When the browser returns from Auth0 with `?code=…&state=…` in the URL, the SPA processes the callback before the existing hash router takes over, exchanges the code for a token, and calls `submitSso`.

**Requirements:** F1, AE1.

**Dependencies:** U3, U4.

**Files:**
- Modify: `src/App.jsx`

**Approach:**
- At the top of `App()`, before `parseHash` runs, check `window.location.search` for `code` and `state`.
- If present: call `auth0Client.handleCallback()` (parses + exchanges + cleans the URL), then `getAccessToken()`, then `session.submitSso(token)`. On success, the existing `useSession` triggers a re-render that lands the user on the hash route.
- Show a small in-flight indicator during the callback handoff (busy state).
- On callback failure (invalid state, network), surface an error and route back to the Configure screen.

**Patterns to follow:**
- `src/App.jsx` existing `useState(parseHash)` + `useEffect(hashchange)` pattern. The callback handler runs once at mount; it does not subscribe to anything.

**Test scenarios:**

Happy path:
- App loads with `?code=abc&state=xyz` in the URL → callback handler runs → access token retrieved → `submitSso` succeeds → URL is cleaned (history.replaceState) → industry picker renders. Covers AE1.

Edge cases:
- App loads without `?code` → callback handler is a no-op; existing routing logic runs unchanged.

Error paths:
- `handleCallback` throws (invalid state or network) → display the Configure screen with an "Auth failed. Please sign in again." banner.
- `submitSso` returns 409 → render the empty-state UI (from U4). Covers AE3.

**Verification:** Manual: click "Sign in with Truv", complete Auth0, observe the URL transitions cleanly back to `/#` (or hash route), no `?code=...` lingers.

---

### U6. Header "Update API keys" semantics with Auth0

**Goal:** "Update API keys" in the Home header behaves unchanged from PR #31 — clears the demo session, does not touch the Auth0 session on dashboard.truv.com.

**Requirements:** F4, AE4.

**Dependencies:** U3.

**Files:**
- Modify: `src/Home.jsx` *(if any wiring change is needed; likely not)*
- Modify: `src/hooks/useSession.js` *(reset function — likely no change)*

**Approach:**
- Confirm `reset()` in `useSession` only calls `DELETE /api/session`. It does NOT call `auth0Client.logout()`. The Auth0 session stays alive on the dashboard so the user can sign back in with one click without re-authenticating against Google/SAML/etc.
- "Reset Truv credentials" / "Update API keys" copy stays as is.
- After reset, the user is sent back to the Configure screen (existing behavior). The "Sign in with Truv" button there will, on click, use the still-active Auth0 session and likely complete the round-trip without an interstitial.

**Patterns to follow:**
- Existing `useSession.reset()`.

**Test scenarios:**

Happy path:
- User in a demo clicks "Update API keys" → confirms → `DELETE /api/session` returns 204 → Configure screen renders → "Sign in with Truv" click completes without re-auth (Auth0 silent token works). Covers AE4.

Edge cases:
- After reset, immediate SSO retry succeeds without redirect. (auth0-spa-js `getAccessTokenSilently` returns the cached token.)

**Verification:** Manual: complete SSO, navigate into a demo, click "Update API keys", confirm, observe Configure screen, click "Sign in with Truv", land back in the demo with no Auth0 interstitial.

**Test expectation: minimal** — this unit mostly verifies that no behavior change was introduced. If a single regression test in `useSession.test.js` confirms `reset()` does not invoke any Auth0 logout, that's sufficient.

---

### U7. Env vars, dependencies, and dashboard team coordination

**Goal:** Document the new env vars, list the external dependencies, and capture the dashboard-team coordination as explicit work items so PR review can confirm those are unblocked before merge.

**Requirements:** dependencies / assumptions section of the origin doc.

**Dependencies:** U1-U6 conceptually, but this work runs in parallel with implementation.

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `server/index.js` (env validation — warn if `AUTH0_*` env vars missing; do not exit, since SSO is optional)

**Approach:**
- New env vars (BYO-mode-only — fallback dev mode does not need them):
  - `VITE_AUTH0_DOMAIN` (e.g., `auth.truv.com`)
  - `VITE_AUTH0_CLIENT_ID` (the dashboard's SPA client; e.g., `6eJFq3X9A2pPdSyoTIavRUmi3fYbgS3J`)
  - `VITE_AUTH0_AUDIENCE` (e.g., `https://dashboard-backend-prod.truv.com/`)
  - `DASHBOARD_BACKEND_URL` (defaults to `https://dashboard-backend-prod.truv.com`)
- README gains a brief "Sign in with Truv (BYO mode)" subsection explaining what the visitor sees and what env vars enable SSO.
- `server/index.js` validation: if any `VITE_AUTH0_*` is missing, log a warning ("Sign in with Truv will be disabled — set VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID / VITE_AUTH0_AUDIENCE to enable") and continue. The Configure screen detects the missing config (via a `meta` endpoint or build-time check) and hides the "Sign in with Truv" button, surfacing only the paste flow. This way, env-vars-not-set never breaks the app.
- External coordination, captured as work items in the PR description:
  - Auth0 team: add `https://demo.truv.com` and `http://localhost:5173` to the dashboard SPA client's Allowed Callback URLs and Allowed Web Origins.
  - Dashboard team: add `https://demo.truv.com` and `http://localhost:5173` to `dashboard-backend-prod.truv.com` CORS allowlist for `GET /v2/user_keys/` (and `/v2/me` if used).
  - Dashboard team: confirm `x-dashboard-key-env: sandbox` is server-enforced — a malicious caller sending `production` must be rejected.

**Test scenarios:**
- Boot with `VITE_AUTH0_*` env vars unset → server starts, console warns once, `/api/session/sso` returns 503 with `{ error: 'sso_disabled' }` (so the route exists but is gated by config).
- Boot with all env vars set → `POST /api/session/sso` is reachable; SSO works end-to-end.

**Verification:** `docker run -e PUBLIC_BASE_URL=... -e SESSION_COOKIE_SECRET=... -e VITE_AUTH0_DOMAIN=... truv-demo-app` starts cleanly. README quickstart can be followed by a teammate unfamiliar with the change.

---

## Scope Boundaries

### In scope

- New `server/dashboard.js` client and `POST /api/session/sso` endpoint.
- New Auth0 frontend flow via `@auth0/auth0-spa-js`.
- Configure screen restructure with paste as fallback.
- Empty-keys-state UI.
- Env vars, README, and a graceful "SSO disabled" path when Auth0 config is missing.

### Deferred to follow-up work

- Production env selection via SSO. Today SSO is sandbox-only; production keys remain paste-only.
- Multi-company picker. Default company only.
- Persistent "remember me" across redeploys (sessions are still in-memory).
- Showing the signed-in user's name/email in the demo header.
- Provisioning new API keys from inside the demo.
- A new Auth0 client provisioned specifically for the demo (we default to reuse).
- "Sign out of Truv entirely" (clear Auth0 session + demo session in one action).

### Outside this product's identity

- The demo is not a key-management surface.
- The demo is not an admin or account-management UI.

---

## Dependencies and Assumptions

External dependencies that block integration testing (but not implementation start):

- **Auth0 SPA client config:** `https://demo.truv.com` and `http://localhost:5173` added to the dashboard's Allowed Callback URLs and Allowed Web Origins. Owner: whoever administers the Truv Auth0 tenant.
- **CORS on `dashboard-backend-prod.truv.com`:** must allow `https://demo.truv.com` and `http://localhost:5173` for `GET /v2/user_keys/` (and `/v2/me` if used). Owner: dashboard backend team.
- **Server-side `x-dashboard-key-env` enforcement:** dashboard backend must reject any caller's attempt to request `production` keys via the SSO path. Verify before merging the demo PR.

Assumptions that planning has made and implementation must verify:

- `/v2/user_keys/` returns a JSON body shaped roughly `{ keys: [{client_id, secret, env, ...}] }`. The plan does not pin a property layout — U1's tests pin whatever the live shape turns out to be.
- A user's default company is either a JWT claim (e.g., `https://dashboard.truv.com/default_company_id`) or a `/v2/me` field. Implementer picks the shorter path and documents what they found.
- An Auth0 access token from auth.truv.com with the dashboard's audience is accepted by `dashboard-backend-prod.truv.com` (the original request shows this works).
- `@auth0/auth0-spa-js` works with Preact (it's framework-agnostic; expected to work; verify with a single smoke test).
- The existing per-session webhook flow in PR #31 has no SSO-specific edge case — the webhook URL pattern `/api/webhooks/truv/:sessionId` is unaffected.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dashboard backend CORS not landed in time | High (cross-team) | Blocks integration testing | Land all code, ship behind the "SSO disabled" flag, then enable env vars once dashboard team confirms. |
| Auth0 client reuse rejected by Auth0 admin (security policy) | Medium | Forces fallback to new client + dashboard-side audience config | Plan acknowledges this; alternative path is documented in Alternatives Considered below. |
| `/v2/user_keys/` response shape differs from assumption | Medium | U1 + U2 tests need updates | U1 is test-first; tests pin actual shape. Catch the difference at PR build time, not in production. |
| Access token logged accidentally | Low | Security incident (token usable until expiry) | Explicit assertion in U2 tests that `console.log` and `console.error` calls during the SSO path contain neither the access token nor the returned credentials. |
| Default company resolution path doesn't exist on dashboard backend | Medium | Blocks SSO entirely | Two-path plan: JWT claim OR `/v2/me`. If both fail, document and escalate to dashboard team for a `/v2/me` shipment. |
| User has multiple sandbox keys; "first" isn't the right one | Low | Confusion in the demo | Document the picking rule clearly ("first key returned by dashboard"); revisit if support cases surface. |
| Cookie collision with the dashboard's own cookies on the same domain | Low | Auth state confusion | `__Host-` prefix locks the cookie to its issuing host; dashboard and demo run on different subdomains. No collision possible. |
| Auth0 redirect URI ends up in browser history with `?code=` | Low | Code is one-time-use; no real harm | Use `history.replaceState` after callback (auth0-spa-js does this by default). |

---

## Alternatives Considered

### Provision a new Auth0 client for the demo (rejected as default)

Cleaner separation of concerns: demo and dashboard have their own clients, scopes, and audiences. Trade-off: dashboard backend must be configured to accept tokens with the demo's audience, which is a second config change on a service we don't own. The reuse-default is one config change in one place (Auth0); the new-client alternative is two config changes in two places (Auth0 + dashboard backend). If the Auth0 admin rejects reuse on security grounds (e.g., "demo shouldn't share scopes with the production dashboard"), this becomes the path. Plan-level switch to this alternative is well-bounded.

### Frontend calls `/v2/user_keys/` directly, then POSTs the keys to the demo backend (rejected)

Saves one network hop and removes the demo backend's dependency on dashboard backend CORS. Trade-off: the API secret transits through browser JS memory, which the PR #31 architecture was specifically designed to prevent. Rejected for security symmetry with the existing paste flow's intent (secret enters the backend session as fast as possible).

### Use a hand-rolled PKCE flow instead of `@auth0/auth0-spa-js` (rejected)

Avoids a runtime dependency. Trade-off: PKCE is easy to get subtly wrong (state validation, code verifier handling, refresh-token rotation, silent renewal). The SDK is small (~13 KB), official, and well-maintained. Carrying-cost vs. risk-of-handroll tradeoff favors the SDK.

---

## Sequencing

```
U1 (dashboard client) ─┐
                       ├─> U2 (SSO route) ─┐
                       │                   ├─> U3 (frontend Auth0 + useSession)
                       │                   │       ├─> U4 (Configure screen)
                       │                   │       └─> U5 (callback handling)
                       │                   └─> U6 (header semantics; mostly verification)
                       └────────────────── U7 (env, README, coordination) — parallel with all
```

U1 unblocks U2. U2 unblocks U3-U6. U7 runs in parallel.

---

## Verification

- Full test suite (existing 400 tests plus new) is green.
- Manual: clear cookie → "Sign in with Truv" → Auth0 round-trip → industry picker, all in one click after Auth0 returns.
- Manual: visit with no Truv account → "Use a key instead" → paste sandbox keys → demo works.
- Manual: signed-in visitor with zero keys → empty-state UI offers "Create your first API key" + "Or paste a key now".
- Manual: complete SSO → click "Update API keys" → confirm → Configure screen → "Sign in with Truv" → silent token → back in demo.
- No log line in any test or live request contains the Auth0 access token, the returned client_id, or the returned secret.

---

## Open Implementation Questions

These are intentionally deferred from this plan to implementation time. Each has a clear default in the plan; the implementer flips to the alternative if they hit it.

- Exact response shape of `/v2/user_keys/`. U1 is test-first; tests pin the actual shape.
- Default company resolution: JWT claim vs `/v2/me`. Implementer picks the path that requires the fewest dashboard-side changes.
- Whether `/v2/user_keys/` accepts a missing `x-dashboard-company-id` header and falls back to the user's default. If yes, we can skip the `/v2/me` call entirely.
- Whether `@auth0/auth0-spa-js` plays nicely with Vite's HMR. If it doesn't, the SDK is still production-correct; we just lose HMR for `auth0Client.js`.
- The exact frontend test harness — the repo currently runs `vitest` against `tests/**/*.test.js` with `environment: 'node'`. Frontend tests for `auth0Client.js` might need a DOM environment (`happy-dom` or `jsdom`); plan defers that setup decision to implementation.
