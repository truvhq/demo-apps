---
name: feat-runtime-byo-api-credentials
description: Replace startup-loaded API credentials with per-session, runtime-supplied credentials for the public demo.truv.com deployment, with multi-tenant webhook routing and no persistence of raw secrets.
status: active
created: 2026-05-20
type: feat
depth: deep
---

# Runtime Bring-Your-Own API Credentials for demo.truv.com

## Summary

Today the backend loads `API_CLIENT_ID` and `API_SECRET` from `.env` at startup and constructs a single shared `TruvClient` (`server/index.js:32-41`). The same secret doubles as the webhook HMAC verification secret (`server/index.js:84`) and as the credential used to register one global webhook URL via `setupWebhook()` (`server/webhook-setup.js`).

This works for a localhost demo for a single developer. It does not work for a public demo at `demo.truv.com`, where each visitor needs to plug in their own Truv credentials and operate against their own Truv account in isolation.

This plan introduces a runtime BYO ("bring your own") credential flow with:

1. **In-memory, session-scoped credential store** — a TTL'd `Map<sessionId, SessionCreds>` keyed by an opaque session ID. Raw secrets never hit disk, never go to logs, never leave the server.
2. **Per-session `TruvClient` construction** — replace the singleton with a request-scoped factory. All six route modules switch from the injected `truv` dependency to `req.truv`.
3. **Per-session webhook routing** — replace the one global webhook URL with a per-session URL `/api/webhooks/truv/:sessionId`. Each session registers its own webhook against its own Truv account on session start, and tears it down on session end. The receiver extracts the session ID from the path and uses *that* session's secret for HMAC verification.
4. **Frontend Configure gate** — first-visit screen that collects `client_id` + `secret`, posts them to `/api/session`, and receives an HttpOnly cookie. Raw secrets stay in the form and the in-memory store; the cookie carries only the opaque session ID.
5. **Defense-in-depth** — `express-rate-limit` on `/api/session`, a cheap validate-keys probe before the session is stored, TLS-only `__Host-` cookie, no credential logging, and a stale-session sweeper.

The .env path is retained as an opt-in **fallback dev mode** so existing local dev workflows don't break, but is off by default.

---

## Problem Frame

`demo.truv.com` is the planned public deployment for these integration demos. Every visitor today would share the same set of Truv API credentials baked into the server's `.env`, which means:

- All API traffic hits one Truv account, mixing every visitor's user/order data.
- All webhooks land on one URL with one shared HMAC secret. Truv-side delivery cannot be isolated per visitor.
- Anyone with shell access to the box can read the keys; the keys appear in `.env`, possibly `docker run --env-file`, and the running process's environment.
- Sandbox credentials in `.env` cannot be rotated without redeploying.
- We cannot demonstrate a customer's *own* coverage, *own* employer data, or *own* webhooks — which is the entire point of a self-service demo.

We need a flow where each visitor supplies their own credentials at runtime, those credentials never persist to disk, traffic is isolated per session, and webhooks route correctly to the right verifier.

---

## Goals

- A visitor can configure their Truv credentials in the browser and run any existing demo against their own Truv account.
- Credentials are stored only in process memory with a TTL; nothing is written to disk, the DB, or logs.
- Each session's outbound API calls and inbound webhook signatures are verified with that session's secret only.
- Concurrent sessions are isolated (one visitor's webhook events never appear in another visitor's UI).
- Local dev with `.env` credentials still works behind an opt-in `ALLOW_ENV_FALLBACK_CREDS=true` flag.
- The public deployment refuses to start without `PUBLIC_BASE_URL` and `SESSION_COOKIE_SECRET`.

## Non-Goals

- Persistent multi-day sessions or "remember me" — sessions are short-lived (default 60 min idle).
- A first-class user/account model in the DB — sessions are ephemeral in-memory state.
- OAuth or magic-link auth — the credential entry form *is* the authentication.
- Multi-instance horizontal scaling of the backend — see Deferred for KV-backed session store.
- Re-encrypting the SQLite DB or moving away from SQLite.
- Rebuilding the existing PII redaction in `server/api-logger.js`.

---

## Scope Boundaries

### In scope

- Replacing the singleton `TruvClient` with a session-scoped factory.
- `POST /api/session`, `DELETE /api/session`, and a session-resolving middleware.
- Per-session webhook registration and signature verification.
- Frontend Configure gate at first load and a "Reset credentials" affordance.
- Rate limiting and a key-validation probe on session creation.
- `.env.example`, `README.md`, and deployment-doc updates.
- An in-process stale-session sweeper.

### Deferred to Follow-Up Work

- Redis or Cloudflare KV-backed session store for multi-instance scale. The in-memory design is correct for a single Node container; swapping in a KV store is a contained refactor of `server/sessions/store.js`.
- CAPTCHA on `/api/session`. Adds friction; revisit only if abuse is observed.
- A "share this session" or read-only handoff link.
- Encrypting session credentials at rest in memory (e.g., sealing with a per-process key). The dominant attack on in-memory creds is a process-memory dump, against which encryption-at-rest-with-the-decryption-key-also-in-memory adds no real protection.
- Rotating `SESSION_COOKIE_SECRET` without invalidating active sessions.
- Moving CORS from localhost-only to a deployment allowlist. Adjacent and required for production, but it lives in `server/index.js:48` and should be handled in a separate small PR.

### Outside this product's identity

- The demo is not a production-grade multi-tenant SaaS. It is an interactive showcase. We do not need user accounts, billing, or auditing.

---

## Key Technical Decisions

### Why in-memory `Map` instead of Redis on day one

A single Node process handles the demo today. An in-memory `Map<sessionId, SessionCreds>` is the simplest correct implementation, requires no new infra, and is trivially testable. The store interface (`server/sessions/store.js`) is intentionally small (`get`, `set`, `delete`, `sweep`) so a Redis adapter can drop in later without touching call sites. The cost of restart-induced session loss is one Configure-screen reload per visitor; acceptable for a demo.

### Why per-session webhook URLs instead of one global URL with secret discovery

A single URL approach would require either (a) trying every known active secret against each inbound webhook until one verifies, which is O(N) and timing-leaky, or (b) parsing the payload for tenant hints before signature verification, which is the wrong order — we must verify the signature *before* trusting any field in the payload.

A per-session URL `/api/webhooks/truv/:sessionId` makes routing deterministic and signature verification single-secret. Truv allows a customer to register multiple webhooks per account (the existing code already lists, filters, and deletes by `name`), so each customer's account ends up with exactly one demo webhook named `demo-${sessionId-short}` — registered on session start, deleted on session end. The session ID in the URL is opaque randomness; no tenant identifier is leaked.

### Why HttpOnly `__Host-`-prefixed cookie, not localStorage

The session ID is a bearer credential for "send Truv API requests on this Truv account." If JavaScript can read it, a single XSS turns into account access. HttpOnly removes JS access; `Secure` enforces TLS; `__Host-` prefix locks the cookie to the issuing host with `path=/` (no `Domain=`), which matters because demo.truv.com sits under the same parent domain as the Truv dashboard. `SameSite=Lax` is fine — there are no cross-site form submissions, and Lax still allows top-level navigation to `demo.truv.com`.

### Why validate credentials before storing the session

If we store and let the first demo call surface the error, the user sees an opaque 401 from inside, say, `POST /api/orders`. A cheap upfront probe (`GET /v1/webhooks/` — already used by `webhook-setup.js`) lets us surface a clear error on the Configure screen and avoids storing dead credentials.

### Why drop startup webhook registration in `setupWebhook()`

In BYO mode there are no credentials at startup. The startup-time call to `truvClient.listWebhooks()` would fail. Keep the **function** for reuse from the new session-creation path (it already does "delete old `demo-apps` webhooks then create new one"), but stop calling it from `server.listen()`'s callback. The fallback-dev-mode path can still call it on startup when `ALLOW_ENV_FALLBACK_CREDS=true`.

### Why session cookie signing

The session ID is opaque randomness, so an attacker can't forge a known-valid ID. But signing the cookie with `SESSION_COOKIE_SECRET` lets us detect cookie tampering early (drop the request at the middleware, no map lookup) and is one line with `cookie-signature` or `express`-style `secret` config. Cost is negligible; benefit is preventing speculative-ID enumeration.

---

## Architecture and Data Flow

### Request lifecycle (with BYO credentials)

```
Browser                              Backend                           Truv API (customer's account)
  |                                     |                                          |
  | -- POST /api/session ----------->   |                                          |
  | { client_id, secret }               | rate-limit by IP                         |
  |                                     | new TruvClient(creds)                    |
  |                                     | -- GET /v1/webhooks/ ----------------->  |  (validation probe)
  |                                     | <----- 200 OK -------------------------- |
  |                                     | sweep old demo-${sessionId} webhooks     |
  |                                     | -- POST /v1/webhooks/ ----------------->  |  (register new webhook
  |                                     | <----- {id} ---------------------------- |   for this session)
  |                                     | store session in Map<sid, creds+webhookId>
  | <- Set-Cookie: __Host-demo_sid ---- |                                          |
  | <- 200 { ok: true }                 |                                          |
  |                                     |                                          |
  | -- POST /api/orders (cookie) -->    |                                          |
  |                                     | middleware -> req.truv = client(sid)     |
  |                                     | -- POST /v1/orders/ ------------------>  |
  |                                     | <----- order ------------------------- - |
  | <----- 200 ----------------------   |                                          |
  |                                     |                                          |
  |                                     | <- POST /api/webhooks/truv/${sid} -----  |  (signed with session secret)
  |                                     | verify HMAC with session.secret          |
  |                                     | store event scoped to session            |
  |                                     |                                          |
  | -- DELETE /api/session ---------->  |                                          |
  |                                     | -- DELETE /v1/webhooks/${webhookId} -->  |
  |                                     | remove session from Map                  |
  | <- Clear-Cookie ------------------- |                                          |
```

*This sequence is directional guidance for review, not implementation specification. Implementers should treat it as context, not code to reproduce.*

### Session state shape

```js
// server/sessions/store.js — internal session record (NOT a TS interface, illustrative only)
SessionRecord = {
  id: string,                  // opaque, base64url(32 bytes)
  clientId: string,            // Truv X-Access-Client-Id
  secret: string,              // Truv X-Access-Secret (HMAC + outbound creds)
  webhookId: string | null,    // Truv-side webhook registration ID, for teardown
  createdAt: number,           // ms epoch
  lastUsedAt: number,          // ms epoch, refreshed on each request
  // No TTL field stored — TTL is `idleTtlMs` config, computed against lastUsedAt.
}
```

*Directional sketch. Field names, types, and the exact module boundary may shift in implementation.*

---

## System-Wide Impact

| Surface | Change |
|---|---|
| `server/index.js` | Drop singleton `truv` and startup webhook registration. Add session middleware. Move webhook receiver to `/api/webhooks/truv/:sessionId`. |
| `server/truv.js` | Unchanged. The class already takes `{clientId, secret}` per construction — perfect fit. |
| `server/routes/*.js` | All six modules stop receiving `truv` via the `deps` factory and start reading `req.truv`. The factory signature becomes `(deps)` where `deps` has `db, apiLogger` only. |
| `server/webhook-setup.js` | Renamed/refactored: `registerWebhook()` stays usable; `setupWebhook()` no longer called from startup. The `WEBHOOK_NAME` constant becomes a function `webhookName(sessionId)` returning `demo-${sessionId.slice(0,8)}`. |
| `server/webhooks.js` | Unchanged. Already takes `secret` as a parameter. |
| `server/db.js` | Unchanged. Existing tables are keyed by Truv-issued `user_id`; cross-session collision is impossible because Truv user IDs are globally unique across accounts. |
| `server/api-logger.js` | Unchanged. |
| `src/App.jsx` | Wrap rendering in a `<SessionGate>` that shows `<ConfigureScreen>` if no session, else current router. Add "Reset credentials" affordance to `Layout.jsx` header. |
| New: `server/sessions/store.js`, `server/sessions/middleware.js`, `server/sessions/cookie.js` | The session subsystem. |
| New: `server/routes/session.js` | `POST /api/session`, `DELETE /api/session`. |
| New: `src/components/ConfigureScreen.jsx` | Credential entry UI. |
| `.env.example`, `README.md` | Document `PUBLIC_BASE_URL`, `SESSION_COOKIE_SECRET`, `ALLOW_ENV_FALLBACK_CREDS`, and the new flow. |
| `Dockerfile` | Unchanged (no new system deps). |
| `package.json` | Add `cookie-parser`, `express-rate-limit`. Both small, well-maintained, no native deps. |

---

## Implementation Units

### U1. Session store, cookie helpers, and core types

**Goal:** Add the in-memory session store and cookie signing/parsing utilities. No route changes yet; this is the foundation.

**Files:**
- Create: `server/sessions/store.js`
- Create: `server/sessions/cookie.js`
- Create: `tests/server/sessions/store.test.js`
- Create: `tests/server/sessions/cookie.test.js`

**Approach:**
- `store.js` exports `createStore({ idleTtlMs })` returning `{ create, get, touch, destroy, sweep, _all }`. Internally a `Map<string, SessionRecord>`. Session IDs are `crypto.randomBytes(32).toString('base64url')`. No logging of secrets, ever.
- `cookie.js` exports `signSessionId(id, secret)` and `verifySessionCookie(cookieValue, secret)` using `crypto.createHmac('sha256', secret)` and constant-time compare. Output format `${id}.${sig}`. Cookie name `__Host-demo_sid`.
- The store does *not* call out to Truv. Webhook registration happens in U4; the store just holds creds and a nullable `webhookId`.

**Patterns to follow:**
- `server/webhooks.js` HMAC + `timingSafeEqual` pattern for the cookie verifier.
- `server/db.js` factory-style module export (constants + helper functions, no class).

**Execution note:** Implement test-first. Both modules are pure and ideal for it.

**Test scenarios:**

`store.test.js`:
- Happy path: `create({clientId, secret})` returns a session ID; `get(id)` returns the record; `touch(id)` updates `lastUsedAt`.
- TTL eviction: a record older than `idleTtlMs` since `lastUsedAt` returns `undefined` from `get` and is removed on `sweep()`.
- `destroy(id)` removes the record; subsequent `get(id)` is `undefined`.
- Two concurrent sessions have distinct IDs and cannot read each other's creds.
- `sweep()` removes only expired entries.
- A session record never appears in any error message thrown by the store (no logging of secrets even on bugs).

`cookie.test.js`:
- Happy path: `verifySessionCookie(signSessionId('abc', S), S)` returns `'abc'`.
- Tamper rejection: flipping a single bit in either segment returns `null`.
- Wrong-secret rejection: signing with `S1` and verifying with `S2` returns `null`.
- Missing/malformed cookie value returns `null` (no throw).
- Constant-time comparison: the verifier uses `crypto.timingSafeEqual`, not `===`. Verify by code inspection in the test description; tests assert behavior, not timing.

**Verification:** `npm test -- sessions` is all green. No call sites reference the new modules yet.

---

### U2. Session middleware and request-scoped `TruvClient`

**Goal:** Add an Express middleware that reads the cookie, resolves the session, and attaches a per-request `TruvClient` to `req.truv`. Keep the global `truv` import alive for now so nothing breaks; routes migrate in U3.

**Files:**
- Create: `server/sessions/middleware.js`
- Create: `tests/server/sessions/middleware.test.js`
- Modify: `server/index.js` (wire the middleware after `express.json` and `cors`, before route registration; do NOT yet remove the singleton)

**Approach:**
- `middleware.js` exports `sessionMiddleware({ store, cookieSecret })`. Reads `req.cookies['__Host-demo_sid']`, verifies, calls `store.get`, calls `store.touch`, constructs `new TruvClient({clientId, secret})` (the existing class in `server/truv.js`), attaches as `req.truv` and `req.session = { id }`. On any failure attaches `req.truv = null`. Route handlers in later units check `req.truv` and 401 if absent.
- `cookie-parser` is the only new dep at this stage. Add it to `package.json` and to `server/index.js` middleware chain.
- The middleware MUST run after `cors` (so OPTIONS preflights aren't gated) but before routes.

**Dependencies:** U1

**Patterns to follow:**
- `server/index.js` middleware order: `express.json` → `cors` → new `sessionMiddleware` → routes.
- Use the existing `TruvClient` constructor signature `{clientId, secret}` — already correct.

**Test scenarios:**
- No cookie present → `req.truv === null`, `req.session === null`, `next()` is called.
- Valid cookie, valid session → `req.truv` is a `TruvClient` instance, `req.session.id` matches, `store.touch` was called.
- Valid signature, but session was destroyed → `req.truv === null`.
- Tampered cookie → `req.truv === null`, store is NOT consulted (verified via spy).
- Expired session (older than TTL) → `req.truv === null`.
- The middleware does not write secrets to the response, logs, or any error.

**Verification:** Existing test suite continues to pass. `req.truv` is reachable from a sample handler when a valid cookie is present.

---

### U3. Session API routes (`POST /api/session`, `DELETE /api/session`)

**Goal:** Add the session-creation and session-destruction endpoints. Validation probe runs before the session is created. Rate limiting wraps the create endpoint.

**Files:**
- Create: `server/routes/session.js`
- Create: `tests/server/routes/session.test.js`
- Modify: `server/index.js` (register the new router; add `express-rate-limit` dep)
- Modify: `package.json` (add `express-rate-limit` ^7)

**Approach:**
- `POST /api/session` body: `{ client_id, secret }`. Both must be non-empty strings, length-bounded (e.g., 8–256 chars). Reject anything else with 400.
- Rate limit: 10 successful or failed creates per IP per 10 minutes via `express-rate-limit`. 429 with `Retry-After`.
- Validation probe: construct an ephemeral `TruvClient`, call `listWebhooks()`. If `statusCode === 401` or `403`, return 401 to the caller with `{ error: 'invalid_credentials' }`. Other non-2xx → 502 `{ error: 'truv_unreachable' }`. Network throw → same 502.
- On success: `store.create({clientId, secret})` returns the session ID. Webhook registration is **NOT** done here — that's U4. For now, set the cookie and respond `{ ok: true }`.
- `DELETE /api/session`: read session from `req.session`, call `store.destroy(req.session.id)`. Clear cookie. 204.
- No PII or credentials in any response body or log line. The 401 invalid_credentials response must not echo the submitted client_id back.

**Dependencies:** U1, U2

**Patterns to follow:**
- Factory pattern from `server/routes/orders.js`: `export default function sessionRoutes({ store, cookieSecret, idleTtlMs })`.
- Same `import { Router } from 'express'` shape.

**Test scenarios:**

Happy paths:
- `POST /api/session` with valid creds → `200 { ok: true }`, `Set-Cookie` header present with `__Host-demo_sid`, cookie has `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain=` (required by `__Host-` prefix).
- `DELETE /api/session` with a live session → `204`, `Set-Cookie` clears the cookie, `store.get` returns undefined afterward.

Edge cases:
- Body missing `client_id` → `400 { error: 'invalid_input' }`.
- Body has `client_id` but it's an empty string → `400`.
- Body has 1024-char `secret` → `400` (exceeds bound).
- Body has non-string fields → `400`.

Error/failure paths:
- Truv probe returns 401 → response is `401 { error: 'invalid_credentials' }`, no session is stored.
- Truv probe returns 500 → `502 { error: 'truv_unreachable' }`, no session is stored.
- Truv probe throws (network error) → `502`, no session is stored.
- Rate limit exceeded → `429`, `Retry-After` header present.

Integration:
- A successful `POST /api/session` followed by a subsequent request to a protected route (with the returned cookie) lands in the route handler with `req.truv` populated — confirms the middleware + store handoff actually works end-to-end, not just in isolation.
- No log line written during `POST /api/session` contains the submitted `secret` (asserted by intercepting `console.log/error` in the test).

**Verification:** `npm test -- session` is all green. Manually: `curl -X POST /api/session` with sandbox creds returns a cookie; `curl -b cookie /api/health` succeeds; `curl -X DELETE -b cookie /api/session` returns 204.

---

### U4. Per-session webhook registration, routing, and teardown

**Goal:** On session create, register a webhook for that session on the customer's Truv account. Route inbound webhooks to the correct session by URL path. On session destroy (or sweep), delete the webhook from the customer's Truv account.

**Files:**
- Modify: `server/webhook-setup.js` (refactor: `registerWebhook(truvClient, webhookUrl, { name })` keeps the same shape but `name` is now a parameter, not a constant; new helper `unregisterWebhook(truvClient, webhookId)`)
- Modify: `server/routes/session.js` (register a webhook after store.create, persist `webhookId` on the session)
- Modify: `server/index.js` (replace `/api/webhooks/truv` with `/api/webhooks/truv/:sessionId`; signature verification reads the secret from `store.get(req.params.sessionId)`; **drop** the startup `setupWebhook` call from `server.listen` unless `ALLOW_ENV_FALLBACK_CREDS=true`)
- Modify: `server/sessions/store.js` (extend `destroy` to accept an optional async callback so teardown can call `unregisterWebhook`, OR expose the webhookId so the route handler does it; pick whichever keeps the store pure — see Approach)
- Modify: `tests/server/webhook-handler.test.js` (update expectations for new URL shape and per-session secret)
- Create: `tests/server/sessions/webhook-routing.test.js`

**Approach:**
- Keep the store free of Truv-API knowledge. The *route handler* for `DELETE /api/session` orchestrates: read `session.webhookId`, call `unregisterWebhook(truvClient, webhookId)`, then `store.destroy(id)`. The sweeper (U6) follows the same pattern but iterates.
- Webhook URL is built from `PUBLIC_BASE_URL` env var: `${PUBLIC_BASE_URL}/api/webhooks/truv/${sessionId}`. `PUBLIC_BASE_URL` is required when `ALLOW_ENV_FALLBACK_CREDS` is not `'true'`. In dev-fallback mode, `NGROK_URL` is used as before.
- The inbound webhook handler:
  1. Reads `sessionId` from `req.params.sessionId`.
  2. Calls `store.get(sessionId)` (read-only — does NOT touch `lastUsedAt`; webhooks shouldn't keep a session alive on their own).
  3. If session is missing → `404` (the customer's Truv will eventually retry; if the session is gone, the webhook is dead).
  4. Else verifies HMAC with `session.secret` via existing `verifyWebhookSignature`.
  5. If valid → existing payload-processing logic runs unchanged.
- The webhook name passed to Truv becomes `demo-${sessionId.slice(0, 8)}` — short enough for Truv's name field, opaque, and distinct per session.

**Dependencies:** U1, U2, U3

**Patterns to follow:**
- Existing `registerWebhook()` in `server/webhook-setup.js:53-81` — keep its "list, delete-by-name-and-env, create" structure. The change is making `name` and `webhookUrl` parameters, and not relying on a module-level `webhookId`.
- Existing inbound webhook handler in `server/index.js:83-106` — payload-processing logic (lines 88-105) is preserved verbatim; only the signature-source changes.

**Execution note:** Add a characterization test on the existing webhook handler's payload-processing behavior *before* refactoring the URL shape. The handler has several subtle behaviors (user_id resolution via `findUserByLinkInEvents`, order status updates on `order-status-updated/completed`) that the new test must preserve.

**Test scenarios:**

Happy paths:
- `POST /api/session` with valid creds → calls `truvClient.createWebhook` with `webhook_url: ${PUBLIC_BASE_URL}/api/webhooks/truv/${sessionId}` and `name: demo-${sessionId.slice(0,8)}`. The returned `webhookId` is stored on the session record.
- `POST /api/webhooks/truv/:sessionId` with a valid signature signed by the session secret → `200`, payload is processed (order updated, webhook event stored).
- `DELETE /api/session` → calls `truvClient.deleteWebhook(webhookId)` before destroying the session.

Edge cases:
- `POST /api/webhooks/truv/unknownSessionId` → `404`, no signature verification attempted, no DB writes.
- `POST /api/webhooks/truv/:sessionId` with a signature signed by a *different* session's secret → `401`, no DB writes. This is the critical isolation test.
- `POST /api/webhooks/truv/:sessionId` with no `X-Webhook-Sign` header → `401`.
- Two concurrent sessions S1 and S2: webhooks arriving at `/api/webhooks/truv/${S1}` signed with S1's secret succeed; the same payload at `/api/webhooks/truv/${S2}` signed with S1's secret returns 401.

Error/failure paths:
- Truv `createWebhook` returns a 409 (duplicate URL) during `POST /api/session` → session creation rolls back (`store.destroy`), the user sees a clear `502 { error: 'webhook_registration_failed' }`. The previous behavior (logging the error and continuing) is wrong here: a session without a webhook is useless.
- Truv `deleteWebhook` fails during `DELETE /api/session` → session is still destroyed locally, error is logged, response is `204` (the customer can clean up the webhook manually if needed; a stuck local session is worse).

Integration:
- Covers AE1. A webhook delivered to session S1's URL with S1's signature triggers the existing `order-status-updated` flow and `db.updateOrder(...)` — i.e., the refactor doesn't regress the payload handling that the original `server/index.js:88-105` did.

**Verification:** `npm test -- webhook` is all green including the new isolation test. Manual smoke: configure two browsers with two different Truv sandbox accounts, run a demo in each, confirm webhook events appear in the correct browser only.

---

### U5. Migrate all six route modules from `deps.truv` to `req.truv`

**Goal:** Stop injecting the singleton `TruvClient` and read the per-request one. Add 401 guards on every protected route. This is the unit where the singleton actually goes away.

**Files:**
- Modify: `server/routes/orders.js`
- Modify: `server/routes/bridge.js`
- Modify: `server/routes/reports.js`
- Modify: `server/routes/upload-documents.js`
- Modify: `server/routes/user-reports.js`
- Modify: `server/routes/coverage-analysis.js`
- Modify: `server/index.js` (drop `const truv = new TruvClient(...)` at line 41; drop `truv` from the `deps` object at line 118)
- Modify: `tests/server/routes/*.test.js` (mocks switch from injected `truv` to `req.truv`; details vary per file — implementer reads existing patterns)

**Approach:**
- Each route factory's destructured signature changes from `{ truv, db, apiLogger }` to `{ db, apiLogger }`.
- Inside each handler, replace `truv.xxx(...)` with `req.truv.xxx(...)`.
- Add a guard at the top of every route handler that uses `req.truv`:
  ```js
  if (!req.truv) return res.status(401).json({ error: 'session_required' });
  ```
  This pattern repeats; resist abstracting it. Six handler-tops are clearer than a wrapper.
- The two top-level routes in `server/index.js` (`/api/companies`, `/api/providers`) follow the same migration.
- The webhook receiver (`/api/webhooks/truv/:sessionId`) does NOT use `req.truv` — it has its own session lookup logic in U4.

**Dependencies:** U2, U3, U4

**Patterns to follow:**
- Existing factory shape in `server/routes/orders.js:18` and the consistent `({ truv, db, apiLogger })` destructure across all six route files — only the destructure changes.

**Test scenarios (per route module):**
- Request without a session cookie → `401 { error: 'session_required' }` (one assertion per route module is enough; the pattern is identical).
- Request with a valid session → existing happy path passes unchanged (mock the per-request `req.truv` instead of injected singleton).
- Existing edge cases and error paths continue to pass. **The bar is no behavior regression**; the change is purely structural.

**Verification:** `npm test` is fully green. `git grep "deps.truv\|{ truv,"` returns nothing under `server/routes/`. `git grep "new TruvClient"` returns hits only in `server/sessions/middleware.js`, `server/routes/session.js`, and tests.

---

### U6. Frontend Configure gate and credential entry UI

**Goal:** Before any demo loads, the visitor sees a Configure screen that posts credentials to `/api/session`. After a successful response, the existing app renders normally. A "Reset credentials" button in the header destroys the session.

**Files:**
- Create: `src/components/ConfigureScreen.jsx`
- Create: `src/hooks/useSession.js`
- Modify: `src/App.jsx` (wrap routing in a session gate)
- Modify: `src/components/Layout.jsx` (add "Reset credentials" affordance to the header)
- Create: `tests/frontend/ConfigureScreen.test.jsx` *(if a frontend test harness exists; otherwise list as manual verification)*

**Approach:**
- `useSession()` hook: `GET /api/session/status` (added inline in U3 as a tiny endpoint, or piggybacks on `GET /api/health`) returns `{ authenticated: boolean }`. The hook reflects this in state. There are no creds on the client — only the boolean. The HttpOnly cookie does the work.
- `<ConfigureScreen>`: two password-type inputs (`client_id`, `secret`), a "Start demo" button, an error banner. Submit calls `fetch('/api/session', { method: 'POST', credentials: 'include', body: JSON.stringify({client_id, secret}) })`. On 200 → `useSession` reloads; gate falls away. On 401 → "Invalid credentials" banner. On 429 → "Too many attempts. Try again in N minutes" with `Retry-After`. On 502 → "Truv is unreachable. Try again shortly."
- Both inputs are `type="password"` and `autocomplete="off"`. The form clears its state on successful submit (don't leave the secret hanging in the DOM input value).
- Helper text on the screen: a small link to the Truv dashboard keys page and a note that credentials live only in this browser session.
- "Reset credentials" in `Layout.jsx` header opens a confirm and on confirm calls `DELETE /api/session`. After 204, `useSession` re-renders the gate.

**Dependencies:** U3 (for `POST /api/session`)

**Patterns to follow:**
- `src/App.jsx:116-142` routing structure — the gate sits *outside* the route resolution but inside `<App>`.
- `src/components/Layout.jsx` for header composition (avoid duplicating the header).
- `src/components/ApplicationForm.jsx` for `<input>` styling and validation.

**Test scenarios:**
- Unauthenticated visit → Configure screen renders, no demo content reachable.
- Submit with valid creds → fetch is called with `credentials: 'include'`, on success the gate disappears and `<Home>` (or current hash route) renders.
- Submit with empty client_id → client-side validation blocks the submit; no fetch fires.
- Submit then 401 response → error banner shows "Invalid credentials", inputs stay editable (don't reset on failure — only on success).
- Submit then 429 → banner shows the cooldown.
- Click "Reset credentials" → confirm dialog → on confirm, DELETE fires, gate reappears.
- `secret` input has `type="password"` and `autocomplete="off"`.
- After a successful submit, the input's `value` is cleared (assertion on the input element).

**Verification:** Manual browser walkthrough: open with no cookie → Configure screen; enter valid sandbox creds → app loads; reset → screen returns. Browser devtools: confirm cookie is `HttpOnly` and `Secure` (the latter requires HTTPS or `localhost` exception).

---

### U7. Rate limiting, stale session sweeper, and abuse protection

**Goal:** Prevent runaway abuse of `/api/session`. Clean up stale sessions and their Truv-side webhooks so we don't leak webhook slots on a customer's Truv account.

**Files:**
- Modify: `server/routes/session.js` (already added `express-rate-limit` in U3 — this unit tunes config and adds a per-IP daily ceiling)
- Create: `server/sessions/sweeper.js`
- Modify: `server/index.js` (start the sweeper interval on listen; clear it on shutdown)
- Create: `tests/server/sessions/sweeper.test.js`

**Approach:**
- `sweeper.js` exports `startSweeper({ store, intervalMs, onExpire })`. Every `intervalMs` (default 5 minutes), iterate `store._all()`, identify expired sessions, call `onExpire(session)` for each (the entry point invokes `unregisterWebhook` with a Truv client built from the about-to-be-deleted session's creds), then `store.destroy(session.id)`. Errors are logged but never thrown out of the interval — one failing teardown must not stop the loop.
- Tune `express-rate-limit`: 10 attempts per IP per 10 min sliding window for `POST /api/session`. Add a second daily ceiling of 100 attempts per IP. Both return `429` with `Retry-After`.
- Graceful shutdown in `server/index.js:151` (the existing `gracefulShutdown`): before `server.close`, iterate active sessions and best-effort delete their Truv-side webhooks (5-second total budget like the existing teardown).

**Dependencies:** U1, U4

**Patterns to follow:**
- Existing `gracefulShutdown` in `server/index.js:151-164` for the "race against a timeout" pattern.

**Test scenarios:**
- A session whose `lastUsedAt` is older than `idleTtlMs` is removed by the next `sweep` tick; `onExpire` is called once with that session.
- A session within TTL is not touched.
- If `onExpire` throws, the sweeper still removes the session from the store and still processes the next session in the same tick.
- Rate limit: 11th `POST /api/session` from the same IP within the window → `429`, `Retry-After` set.
- Daily ceiling: 101st attempt from the same IP within 24h → `429`.
- Graceful shutdown: with 3 active sessions, `SIGINT` causes 3 `deleteWebhook` calls (best-effort), then exits within the 5s budget even if Truv is slow.

**Verification:** Run server, create a session with short TTL (e.g., 5s via test env var), watch logs show sweep removing it after expiry and webhook delete being attempted. `npm test -- sweeper` is green.

---

### U8. Configuration, docs, and `.env.example` updates

**Goal:** Document the new flow and required env vars. Make the dev-fallback mode explicit. Verify CI / Docker setup works without baked-in credentials.

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `server/index.js` (env validation: `PUBLIC_BASE_URL` and `SESSION_COOKIE_SECRET` required unless `ALLOW_ENV_FALLBACK_CREDS=true`; the existing line 34-37 check on `API_CLIENT_ID`/`API_SECRET` becomes conditional on the fallback flag)
- Create: `docs/architecture/byo-credentials.md` *(optional one-pager pointing readers at this plan and the security model)*

**Approach:**
- New required env vars (production):
  - `PUBLIC_BASE_URL` — e.g., `https://demo.truv.com`; used to construct webhook URLs.
  - `SESSION_COOKIE_SECRET` — random 32+ char string; signs the session cookie.
  - `SESSION_IDLE_TTL_MS` — optional, default `3600000` (1 hour).
  - `SESSION_RATE_LIMIT_WINDOW_MS` — optional, default `600000` (10 min).
- Optional dev-fallback env vars:
  - `ALLOW_ENV_FALLBACK_CREDS=true` — enables the legacy `.env`-based singleton path. When this is set, `API_CLIENT_ID`, `API_SECRET`, and `NGROK_URL` are also required (current behavior). The startup `setupWebhook` call is gated on this flag.
- `.env.example` is rewritten with the new vars at the top and the legacy block clearly labeled "Local dev only — set `ALLOW_ENV_FALLBACK_CREDS=true` to use these."
- `README.md` Quick Start gets two sections: "Run locally (single dev account)" using fallback mode, and "Run as a public demo (BYO credentials)" using session mode. Architecture section gets a paragraph on the session flow and a link to `docs/architecture/byo-credentials.md`.

**Dependencies:** U1–U7

**Test scenarios:**

This unit is mostly docs and config, but the env validation has a real behavioral test:
- Server boots with `ALLOW_ENV_FALLBACK_CREDS` unset and missing `PUBLIC_BASE_URL` → process exits 1 with a clear message naming `PUBLIC_BASE_URL`.
- Server boots with `ALLOW_ENV_FALLBACK_CREDS=true` and missing `API_CLIENT_ID` → process exits 1 (existing behavior preserved).
- Server boots with all production env vars set → starts successfully and does NOT call `setupWebhook` at startup.

**Verification:** `docker build` then `docker run -e PUBLIC_BASE_URL=... -e SESSION_COOKIE_SECRET=...` boots cleanly. README quickstart can be followed end-to-end by someone unfamiliar with the change.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Webhook signature confusion — wrong secret used to verify | Low | High (security) | Per-session URL + isolation test in U4 covers exactly the cross-session signature case. |
| Process restart drops all sessions | High | Low (UX) | Document this clearly on the Configure screen ("Sessions reset when the demo redeploys"). For multi-instance later, swap in KV store — interface is already abstracted. |
| Leaked secrets in logs | Medium | High | Two layers: (a) the store and middleware never log secrets, (b) `api-logger.js` already redacts PII (but does NOT touch credentials — we don't pass them through logs anyway). Add explicit unit tests in U1 and U3 that intercept stdout/stderr during success and failure paths. |
| Cookie theft via XSS | Low | High | `HttpOnly` + `Secure` + `__Host-` prefix. The existing `dompurify` dep (per package-lock) suggests the codebase already cares about XSS in any rendered content; no changes there. |
| Public endpoint abuse / DoS via `/api/session` | Medium | Medium | Rate limit (10 / 10min / IP) + daily ceiling (100 / 24h / IP) in U3 and U7. Validation probe before storage limits the cost of bad requests. |
| Webhook slot exhaustion on customer Truv accounts | Low | Medium | Sweeper (U7) deletes stale webhooks; graceful shutdown also cleans up. Webhook name `demo-${sid8}` is distinct enough that a manual cleanup script is trivial if needed. |
| Backward incompatibility with local dev workflows | Medium | Low | Fallback flag `ALLOW_ENV_FALLBACK_CREDS=true` preserves current behavior verbatim. README documents both paths. |
| CORS still localhost-only blocks public demo | High (forgotten step) | High (blocks launch) | Out of scope for this PR but called out in Scope Boundaries → Deferred to Follow-Up so it isn't lost. |

---

## Test Strategy

- Unit tests for `server/sessions/store.js`, `server/sessions/cookie.js`, `server/sessions/middleware.js`, `server/sessions/sweeper.js`.
- Route tests for `server/routes/session.js` and one regression-style test per existing route module confirming 401-without-session and 2xx-with-session.
- Webhook isolation test (U4) is the security-critical one — it should be reviewed carefully.
- Manual smoke: two-browser scenario with two different sandbox accounts, confirming webhook events are routed to the correct browser only.
- No new e2e test infrastructure introduced; existing `vitest` setup covers everything.

---

## Sequencing and Dependencies

```
U1 (store + cookie)
  └─> U2 (middleware) ─┐
                       ├─> U3 (session routes) ─┐
                       │                        ├─> U4 (webhook routing) ─┐
                       │                        │                        ├─> U5 (route migration)
                       │                        │                        ├─> U6 (frontend gate)
                       │                        │                        └─> U7 (rate limit + sweeper) ─> U8 (docs + env)
```

U5, U6, and U7 can land in parallel after U4. U8 closes out the change.

---

## Open Questions Deferred to Implementation

- Whether `cookie-parser` is enough or whether `cookie-session` / `iron-session` would be cleaner. Decision belongs in U1/U2 when the implementer reads the cookie-parser API. The plan's HMAC-signing approach is small enough that an extra session library may be unnecessary.
- The exact `name` format for the session-scoped webhook on Truv's side (`demo-${sid8}` vs `demo-${cssid8}-${env}`). Implementer should look at Truv's webhook name length constraint and any uniqueness requirement; the current `WEBHOOK_NAME = 'demo-apps'` is opaque.
- Whether to expose a `GET /api/session/status` endpoint or piggyback on `GET /api/health`. Trivial either way; U6 implementer picks based on whatever reads cleanest with the `useSession` hook.

---

## References

- Current credential touch points: `server/index.js:32-41`, `server/index.js:84`.
- Webhook setup: `server/webhook-setup.js`, `server/webhooks.js`.
- Route factories that take the singleton today: `server/routes/orders.js`, `server/routes/bridge.js`, `server/routes/reports.js`, `server/routes/upload-documents.js`, `server/routes/user-reports.js`, `server/routes/coverage-analysis.js`.
- Frontend routing: `src/App.jsx:116-142`.
- Existing PII redaction (not changed but adjacent): `server/api-logger.js`.
