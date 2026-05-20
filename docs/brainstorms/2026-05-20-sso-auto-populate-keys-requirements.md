---
name: sso-auto-populate-keys
description: Replace the paste-keys onboarding for signed-in Truv users with a one-click "Sign in with Truv" flow that auto-fetches their sandbox keys from dashboard-backend-prod.truv.com and drops them into the existing demo session.
status: ready-for-planning
created: 2026-05-20
type: feature
tier: standard
---

# Sign in with Truv: auto-populate demo API keys

## Problem Frame

The demo currently asks every visitor to paste their `client_id` and `secret` into a Configure screen (PR #31, shipped on `feat/byo-api-credentials`). Existing Truv customers who are already authenticated against `dashboard.truv.com` have to:

1. Open `https://dashboard.truv.com/app/development/keys` in another tab
2. Copy the client ID
3. Copy the secret (revealing it on the dashboard)
4. Paste both into `demo.truv.com`
5. Wait for the validation probe

That's five steps for someone the system already knows about. The dashboard backend exposes the user's keys behind Auth0 (`GET https://dashboard-backend-prod.truv.com/v2/user_keys/`), so we can collapse those five steps into one: **Sign in with Truv → demo loaded against your sandbox**.

## Goals

- Visitors with a `dashboard.truv.com` account can start the demo with one click after Auth0 sign-in.
- The signed-in path reuses the same session store, webhook routing, and per-session lifecycle the paste flow already uses.
- Paste remains the fallback for prospects without a Truv account, with no extra friction.
- The user's API secret never touches the browser's JS memory in the SSO path (it goes Auth0 → demo backend → dashboard backend → demo session, never via the browser).

## Non-Goals

- Provisioning new API keys on the user's behalf. If their dashboard has no keys yet, we route them to dashboard.truv.com to create one, not auto-create on their behalf.
- Production keys via SSO. The SSO path is hard-coded to `x-dashboard-key-env: sandbox`. Production users keep using the paste flow.
- A company picker for users in multiple companies. Use the dashboard's default company; revisit if real demand surfaces.
- Persistent sessions across redeploys. Sessions stay in-memory as designed.
- Killing the dashboard's Auth0 session on demo logout. Resetting the demo session does not sign the user out of dashboard.truv.com.
- Storing the Auth0 access token. We use it for the single `/v2/user_keys/` call and discard it.

## Actors

- **A1. Existing Truv customer** — already has a `dashboard.truv.com` login and at least one sandbox API key on their account. Primary actor; the SSO flow is for them.
- **A2. Prospect / brand-new visitor** — no Truv account, or hasn't created API keys yet. Falls back to the paste flow; can also click "Sign up to get API keys" to head to the dashboard.

## Key Flows

- **F1. Signed-in fast path (A1)** — sees the Configure screen, clicks **Sign in with Truv**, completes Auth0 PKCE, lands back in the demo with the session already created and the first industry picker visible.
- **F2. Fallback paste (A2)** — sees the Configure screen, the "Use a key instead" affordance, fills in client ID + secret, clicks Start demo. Identical to today's behavior.
- **F3. SSO with no keys yet (A1 edge case)** — signs in successfully, but `/v2/user_keys/` returns an empty list. Demo shows "You don't have any API keys yet" with a deep-link to dashboard's create-key page, plus a fallback "Paste a key instead" link.
- **F4. Reset / re-auth (any actor)** — clicks **Update API keys** in the header. Session is destroyed locally as today; Auth0 session on dashboard.truv.com is not touched.

## Acceptance Examples

- **AE1.** Visitor signed into `dashboard.truv.com` with a default company and ≥1 sandbox key clicks "Sign in with Truv" on the Configure screen → after Auth0 round-trip, they land on the industry picker with a working session, having seen no key paste form.
- **AE2.** Visitor with no Truv account clicks "Use a key instead" → the paste form (today's UX) is revealed inline; submitting valid keys behaves identically to PR #31.
- **AE3.** Signed-in visitor whose dashboard returns `{ keys: [] }` from `/v2/user_keys/` sees an empty-state card with "Create your first API key" linking to dashboard, plus "Or paste a key now" linking to the paste flow.
- **AE4.** Visitor signs in, gets dropped into the demo, runs a few Bridge sessions, then clicks **Update API keys** → session destroyed, returned to the Configure screen, Auth0 still signed in on dashboard.truv.com.
- **AE5.** Signed-in user reloads the demo within the session TTL → cookie is still valid, lands directly on the industry picker without seeing the Configure screen again.

## Approach

**Sign-in is the primary CTA; paste is a collapsed fallback.** The Configure screen header changes from "Personalize your demo" to lead with a single **Sign in with Truv** button. Below it, a small "Use a key instead" link reveals the existing paste form inline. The trust footer ("Kept in memory for this session...") stays.

**Mechanism:**

1. Frontend kicks off Auth0 PKCE against `https://auth.truv.com/` (issuer per the user-pasted JWT) with the appropriate client_id and audience (one of the call-outs below).
2. Auth0 returns an access token to the SPA.
3. SPA `POST`s the access token to a new endpoint: `POST /api/session/sso { access_token, company_id?, env? }`.
4. Demo backend, server-to-server, calls `GET https://dashboard-backend-prod.truv.com/v2/user_keys/` with:
   - `Authorization: Bearer <access_token>`
   - `x-dashboard-company-id: <user's default company>` (read from a `/v2/me`-style endpoint or from a claim in the JWT, TBD in the plan)
   - `x-dashboard-key-env: sandbox`
5. Backend receives `{ client_id, secret }` (exact shape TBD; verified at plan time).
6. Backend creates a session via the existing `createSessionStore.create()` → registers a per-session webhook (existing flow) → sets the same `__Host-demo_sid` cookie.
7. SPA navigates into the demo. The Auth0 access token is discarded.

**Why backend-to-dashboard rather than frontend-to-dashboard:** the API secret never enters browser memory in the SSO path. The frontend only ever handles the Auth0 access token, which has a short TTL and limited scope.

## Scope Boundaries

### In scope

- New backend endpoint `POST /api/session/sso` that accepts an Auth0 access token, calls dashboard-backend, and creates a session.
- New frontend flow: Auth0 PKCE init, callback handler, "Sign in with Truv" button, "Use a key instead" toggle.
- Empty-state UI for the "no keys yet" case.
- The existing paste form stays functional and reachable.

### Deferred to follow-up work

- Production env selector via SSO. Today paste is the only path to production keys; that's intentional for safety.
- Multi-company picker. We rely on the dashboard's "default company" concept until evidence shows users need to pick.
- Persistent "remember me" across redeploys. Out of scope; in-memory sessions stay.
- Showing the signed-in user's name/email in the demo header.
- Provisioning new API keys from inside the demo.

### Outside this product's identity

- The demo is not a key-management tool. We never edit, rotate, or delete keys on the user's behalf.
- The demo is not an admin or account-management surface for Truv. It demonstrates integration flows.

## Dependencies and Assumptions

- **Dashboard `/v2/user_keys/` endpoint exists today.** Confirmed by request the user shared from `dashboard.truv.com`. Plan should still verify the exact response shape before integration.
- **Auth0 tenant is `auth.truv.com`.** Confirmed by `iss` claim on the user-pasted JWT.
- **Dashboard backend will allow CORS / cross-origin from `demo.truv.com` and `http://localhost:5173`.** Currently allows `dashboard.truv.com` only — requires a config change on the dashboard backend. Coordinate with the dashboard team.
- **The Auth0 client used by the demo will be accepted by dashboard-backend-prod.** The pasted JWT had `aud: 6eJFq3X9A2pPdSyoTIavRUmi3fYbgS3J` (dashboard SPA client). Open: see Call-outs below.
- **A "default company" is discoverable for any signed-in user.** Either from a claim in the access token or from a `/v2/me`-style endpoint. Plan should verify.
- **Backend can route Truv-side webhooks** for the SSO session exactly as it does for paste sessions. No new logic needed; the SSO path ends in the same session record.

## Call-outs to Resolve in Planning

These are the real forks that need a small amount of research before implementation. None block the brainstorm artifact, but planning should not start without an answer:

- **Auth0 client identity.** Two options: (a) reuse the dashboard's SPA client by adding `demo.truv.com` to its allowed callback URLs, or (b) create a new SPA client for the demo and configure `dashboard-backend-prod.truv.com` to accept its audience. (a) is simpler and avoids dashboard-backend changes; (b) is cleaner separation. Plan should pick one.
- **CORS allowlist on `dashboard-backend-prod.truv.com`.** Needs to include `https://demo.truv.com` (prod) and `http://localhost:5173` (dev). This is a config change on a different repo / service. Plan should include a task to coordinate with the dashboard team.
- **Default company resolution.** Either decode it from the access token (if `dashboard-backend-prod` puts it there) or call a `/v2/me`-style endpoint first. Pick whichever requires the fewest dashboard-side changes.
- **Response shape of `/v2/user_keys/`.** Shape TBD; planning should verify before writing the integration.
- **Sandbox-only constraint enforcement.** `x-dashboard-key-env: sandbox` is sent as a header on the request, but does the dashboard backend honor it or could a malicious client request `production`? Plan should confirm the constraint is server-enforced, not client-trusted.

## Success Criteria

- A signed-in `dashboard.truv.com` user completes onboarding (`Configure screen` → industry picker) in under 5 seconds with no manual keystrokes after the Auth0 round-trip.
- A prospect without a Truv account completes onboarding in the same number of steps as PR #31 (no regression in the paste flow).
- The API secret of any SSO user is never present in any client-side JavaScript variable, sessionStorage, localStorage, or network payload originating from the browser.
- The existing 400-test suite stays green; new tests cover the SSO path and the no-keys-yet empty state.

## Open Questions Resolved in This Brainstorm

| Question | Answer |
|---|---|
| Coexistence with paste flow | Sign-in primary, paste collapses behind "Use a key instead" |
| Mechanism for fetching keys | Demo backend calls dashboard `/v2/user_keys/` (not the frontend) |
| Does the endpoint exist? | Yes — confirmed by a real request from the user |
| Sandbox vs production | Sandbox only via SSO; production keys remain a paste-only path |
| Company selection | Auto-pick the user's default company; no picker UI |
| What if user has no keys yet | Empty-state UI with deep-link to dashboard create-key page |
| What about token persistence | Access token is one-shot; discarded after key fetch |
| Reset / sign-out semantics | "Update API keys" clears the demo session but not the Auth0 session |
