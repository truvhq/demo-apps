---
title: "feat: Add test suite covering all 12 demo applications"
type: feat
status: active
date: 2026-04-10
---

# feat: Add test suite covering all 12 demo applications

## Overview

Add a comprehensive test suite for the Truv Demo Apps application. The codebase has zero tests. Tests cover server routes, shared hooks, utilities, and per-demo logic for all 12 demos. Tests live in a separate `tests/` directory, one file per demo/module. Red/Green TDD execution posture throughout.

## Problem Frame

The demo-apps codebase has 12 demo applications, 5 server route modules, shared hooks (`usePanel`, `useReportFetch`), and utilities (PII redaction, webhook verification, formatters). None of this is tested. Recent refactoring (unified report fetching, polling changes) introduced subtle bugs that were only caught by manual inspection. A test suite prevents regressions and documents the behavioral contracts each module must honor.

## Requirements Trace

- R1. Every demo's core logic must have at least one dedicated test file
- R2. Tests must live separately from application code (in `tests/` directory)
- R3. Red/Green TDD: write a failing test first, then make it pass
- R4. Cover server route logic with mocked Truv API (no real HTTP calls)
- R5. Cover shared hooks (useReportFetch, usePanel) and utilities
- R6. Test files organized per-app so each demo's coverage is independently visible

## Scope Boundaries

- **In scope**: Logic tests for hooks, utilities, server routes, and per-demo behavioral contracts
- **Not in scope**: Component rendering tests (no @testing-library/preact), visual/snapshot tests, E2E browser tests
- **Not in scope**: Testing the TruvClient HTTP layer itself (it wraps an external API)
- **Not in scope**: Testing CSS/Tailwind styling or Mermaid diagram rendering

## Context & Research

### Relevant Code and Patterns

**Three demo architectural patterns:**
- **Bridge flow** (5 demos: SmartRouting, BankIncome, PayrollIncome, DepositSwitch, PaycheckLinkedLoans): POST /api/bridge-token -> Bridge popup -> task-status-updated:done -> fetch reports
- **Orders flow** (5 demos: Application, CustomerPortal, FollowUp, LOS, EmployeePortal): POST /api/orders -> Bridge or share_url -> order-status-updated:completed -> fetch reports
- **Document Collections flow** (2 demos: PSDocuments, UploadDocuments): POST /api/collections -> poll status -> finalize -> task-status-updated:done -> fetch report via link_id

**Shared modules:**
- `src/components/hooks.js` (usePanel) -- polling lifecycle, session management
- `src/components/useReportFetch.js` -- webhook detection, report type resolution, fetch gating
- `src/components/WebhookFeed.jsx` (parsePayload) -- JSON parse utility
- `src/utils/formatters.js` -- currency, date, frequency formatters
- `server/api-logger.js` -- PII redaction + DB logging
- `server/webhooks.js` -- HMAC-SHA256 verification
- `server/db.js` -- SQLite CRUD

**Product-to-report mapping (critical contract):**
| Product | Report Endpoint | is_voe |
|---------|----------------|--------|
| income | POST+GET /v1/users/:id/reports/ | false |
| employment | POST+GET /v1/users/:id/reports/ | true |
| assets | POST+GET /v1/users/:id/assets/reports/ | N/A |
| income_insights | POST+GET /v1/users/:id/income_insights/reports/ | N/A |
| deposit_switch | GET only /v1/users/:id/deposit_switch/report/ | N/A |

**Auto-pairing rule**: `getReportTypes(['assets'])` returns `['assets', 'income_insights']`.

### Institutional Learnings

No `docs/solutions/` directory exists. Key learnings from this conversation:
- The `useReportFetch` hook's `checkWebhookDone` must handle both parsed payload and top-level webhook fields
- `pollOnceAndStop` must run after report fetch completes to capture the POST+GET logs in the API panel
- `bridge.js` must log POST /v1/users/ with the created userId (not null) for log visibility
- Products key stabilization (JSON.stringify) prevents spurious effect re-runs in useReportFetch

## Key Technical Decisions

- **Vitest as test runner**: Natural choice for a Vite project. Shares the same config ecosystem, supports ESM natively, has built-in Preact/JSX support via the existing `@preact/preset-vite` plugin.
- **Mock TruvClient at the module boundary**: Server route tests import the route factory function and pass a mock `truv` object. No HTTP interception needed.
- **In-memory SQLite for DB tests**: better-sqlite3 supports `:memory:` databases. Each test gets a fresh DB.
- **Test hooks via direct function extraction**: Export `checkWebhookDone` and `getReportTypes` from `useReportFetch.js` so they can be tested as pure functions. The effect-based integration (watching webhooks, calling fetch) is tested via a lightweight harness using `@preact/preset-vite` JSX support with preact/hooks `renderHook` equivalent.
- **Per-demo test files**: Each demo gets its own test file in `tests/demos/` verifying the correct products, webhook events, and report types it should use.

## Open Questions

### Resolved During Planning

- **Q: How to test Preact hooks without @testing-library?** Use a minimal `renderHook` helper that mounts a wrapper component with `preact/hooks` and returns the hook result. Vitest + jsdom provides the DOM environment. This avoids the @testing-library dependency while still testing hook behavior.
- **Q: How to test Express routes without starting the server?** Import the route factory (e.g., `bridgeRoutes({ truv, db, apiLogger })`), mount on a test Express app, use `supertest` to make requests. Alternatively, call handler functions directly with mock req/res.

### Deferred to Implementation

- Exact mock response shapes for TruvClient methods (discover from actual API calls during TDD)
- Whether `supertest` or direct handler invocation works better for route tests (try supertest first, fall back if it complicates ESM setup)

## Implementation Units

### Phase 1: Infrastructure

- [ ] **Unit 1: Test infrastructure and Vitest configuration**

**Goal:** Set up Vitest, create test directory structure, add test helpers and mock factories.

**Requirements:** R2, R6

**Dependencies:** None

**Files:**
- Create: `vitest.config.js`
- Create: `tests/helpers/mock-truv.js`
- Create: `tests/helpers/mock-db.js`
- Create: `tests/helpers/mock-api-logger.js`
- Modify: `package.json` (add vitest, @vitest/coverage-v8 to devDeps; add test scripts)

**Approach:**
- Vitest config with `test.include: ['tests/**/*.test.js']` to keep tests separate from source
- jsdom environment for hook tests
- Mock factory for TruvClient that returns configurable responses per method
- Mock factory for in-memory SQLite DB (fresh per test via `db.initDb()` on `:memory:`)
- Mock factory for apiLogger that records calls for assertion

**Execution note:** Start with a trivial passing test to verify the setup works before proceeding.

**Patterns to follow:**
- Vite config at `vite.config.js` for reference on plugin setup

**Test scenarios:**
- Happy path: `vitest run` executes and reports 0 failures on an empty suite
- Happy path: A trivial test in `tests/setup.test.js` passes (verifies config is correct)

**Verification:**
- `npm test` runs vitest and exits 0
- Test output shows the tests/ directory is scanned

---

### Phase 2: Shared Utilities and Server Infrastructure

- [ ] **Unit 2: Utility and shared module tests**

**Goal:** Test pure functions: formatters, parsePayload, PII redaction, webhook HMAC verification.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Create: `tests/utils/formatters.test.js`
- Create: `tests/utils/parse-payload.test.js`
- Create: `tests/server/api-logger.test.js`
- Create: `tests/server/webhooks.test.js`

**Execution note:** Red/Green TDD. Write each test before the assertion passes.

**Patterns to follow:**
- `src/utils/formatters.js` exports `$`, `freq`, `fmtDate`
- `server/api-logger.js` exports `redactSensitive`
- `server/webhooks.js` exports `verifyWebhookSignature`

**Test scenarios:**
- Happy path: `$` formats `56269.25` as `"$56,269.25"`, `0` as `"$0.00"`, `null`/`undefined` as `"$0.00"`
- Happy path: `freq` maps `"Biweekly"` to `"Biweekly"`, unknown key to `undefined`
- Happy path: `fmtDate` formats ISO date string correctly, returns fallback for null
- Happy path: `parsePayload` parses valid JSON string into object
- Edge case: `parsePayload` returns `{}` for null/undefined input
- Edge case: `parsePayload` returns `{}` for malformed JSON string
- Edge case: `parsePayload` returns the object directly if input is already an object
- Happy path: `redactSensitive` replaces `ssn: "123-45-6789"` with `***6789`
- Happy path: `redactSensitive` replaces `email`, `phone`, `date_of_birth`, `social_security_number`
- Edge case: `redactSensitive` handles nested objects and arrays
- Edge case: `redactSensitive` passes non-sensitive fields through unchanged
- Edge case: `redactSensitive` handles short values (length <= 4) with just `***`
- Happy path: `verifyWebhookSignature` returns `true` for valid HMAC-SHA256
- Error path: `verifyWebhookSignature` returns `false` for tampered body
- Error path: `verifyWebhookSignature` returns `false` for wrong secret

**Verification:**
- All tests green. Each utility function has at least 3 test cases covering happy path and edge cases.

---

- [ ] **Unit 3: Database layer tests**

**Goal:** Test all db.js CRUD operations with in-memory SQLite.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Create: `tests/server/db.test.js`

**Execution note:** Red/Green TDD. Each test uses a fresh in-memory DB.

**Patterns to follow:**
- `server/db.js` exports: `initDb`, `generateId`, `createOrder`, `getOrder`, `updateOrder`, `findOrderByUserId`, `getOrdersByDemoId`, `getAllOrders`, `insertApiLog`, `getApiLogsByUserId`, `insertWebhookEvent`, `getWebhookEventsByUserId`, `upsertReport`, `getReport`, `createDocCollection`, `getDocCollection`, `updateDocCollection`

**Test scenarios:**
- Happy path: `createOrder` + `getOrder` round-trips all fields
- Happy path: `updateOrder` changes status, `getOrder` reflects update
- Happy path: `findOrderByUserId` returns most recent order for a userId
- Happy path: `getOrdersByDemoId` filters by demo_id
- Happy path: `insertApiLog` + `getApiLogsByUserId` returns logs for that user
- Happy path: `getApiLogsByUserId` with sessionId returns user logs + session-only logs (user_id IS NULL)
- Edge case: `getApiLogsByUserId` without sessionId returns only user-scoped logs
- Happy path: `insertWebhookEvent` + `getWebhookEventsByUserId` round-trips
- Happy path: `upsertReport` inserts new, then updates on conflict (same order_id + report_type)
- Happy path: `createDocCollection` + `getDocCollection` round-trips
- Happy path: `generateId` returns 12-char hex string

**Verification:**
- All DB CRUD operations covered. Tests use in-memory DB and do not touch demo-apps.db.

---

### Phase 3: Server Routes

- [ ] **Unit 4: Bridge route tests**

**Goal:** Test POST /api/bridge-token with mocked TruvClient.

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `tests/server/routes/bridge.test.js`

**Execution note:** Red/Green TDD. Mock truv.createUser() and truv.createUserBridgeToken() to return controlled responses.

**Patterns to follow:**
- `server/routes/bridge.js` factory pattern: `bridgeRoutes({ truv, apiLogger })`

**Test scenarios:**
- Happy path: POST /api/bridge-token with `{ product_type: 'income', data_sources: ['payroll'] }` -> returns `{ bridge_token, user_id }` and logs both POST /v1/users/ and POST /v1/users/:id/tokens/
- Happy path: Verify apiLogger.logApiCall is called with correct userId (not null) for POST /v1/users/
- Happy path: company_mapping_id is passed through to createUserBridgeToken
- Happy path: provider_id is passed through to createUserBridgeToken
- Error path: Truv createUser returns 400 -> returns error, still logs the call
- Error path: Truv createUserBridgeToken returns 400 -> returns error, logs both calls

**Verification:**
- Bridge token creation flow tested with mocked Truv. API logging assertions verify the userId fix.

---

- [ ] **Unit 5: Orders route tests**

**Goal:** Test orders CRUD endpoints with mocked TruvClient.

**Requirements:** R4

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `tests/server/routes/orders.test.js`

**Execution note:** Red/Green TDD.

**Patterns to follow:**
- `server/routes/orders.js` factory: `ordersRoutes({ truv, db, apiLogger })`

**Test scenarios:**
- Happy path: POST /api/orders with income product + employer -> creates order in DB, returns order_id/user_id/bridge_token
- Happy path: POST /api/orders with assets product + provider_id -> uses `financial_institutions` array (not `employers`)
- Happy path: POST /api/orders with external_user_id -> stored and passed to Truv
- Happy path: GET /api/orders returns all orders
- Happy path: GET /api/orders?demo_id=pos-tasks filters correctly
- Happy path: GET /api/orders/:id/info returns DB-only data (no Truv call)
- Happy path: GET /api/orders/:id fetches from Truv and updates DB status
- Error path: POST /api/orders when Truv returns error -> returns error status
- Error path: GET /api/orders/:id for non-existent order -> 404
- Integration: POST /api/orders logs the API call with correct userId and endpoint

**Verification:**
- All CRUD operations tested. Payroll vs bank field mapping covered.

---

- [ ] **Unit 6: User-reports route tests**

**Goal:** Test the unified report endpoint (POST-then-GET pattern) with mocked TruvClient.

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `tests/server/routes/user-reports.test.js`

**Execution note:** Red/Green TDD.

**Patterns to follow:**
- `server/routes/user-reports.js` REPORT_CONFIG mapping

**Test scenarios:**
- Happy path: GET /api/users/:id/reports/income -> calls createVoieReport(id, false), then getVoieReport(id, reportId), returns GET result
- Happy path: GET /api/users/:id/reports/employment -> calls createVoieReport(id, true)
- Happy path: GET /api/users/:id/reports/assets -> calls createAssetsReport, then getAssetsReport
- Happy path: GET /api/users/:id/reports/income_insights -> calls createIncomeInsightsReport, then getIncomeInsightsReport
- Happy path: GET /api/users/:id/reports/deposit_switch -> single GET, no create step (cfg.create is null)
- Happy path: Both POST and GET are logged via apiLogger with correct userId, method, endpoint
- Error path: Unknown report type -> 400
- Error path: POST create returns 400 -> logs POST, returns error, no GET attempted
- Error path: POST create returns no report_id -> 500
- Error path: GET retrieve returns 400 -> logs both POST and GET, returns error

**Verification:**
- All 5 report types tested. The POST+GET pattern verified for income/employment/assets/income_insights. Deposit_switch GET-only path verified.

---

- [ ] **Unit 7: Upload-documents route tests**

**Goal:** Test document collection lifecycle with mocked TruvClient.

**Requirements:** R4

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `tests/server/routes/upload-documents.test.js`

**Execution note:** Red/Green TDD.

**Patterns to follow:**
- `server/routes/upload-documents.js` factory

**Test scenarios:**
- Happy path: POST /api/collections creates user, uploads docs, returns collection_id and user_id
- Happy path: GET /api/collections/:id returns collection status from Truv
- Happy path: POST /api/collections/:id/finalize calls Truv finalize endpoint
- Happy path: GET /api/collections/:id/report?link_id=X fetches via getLinkIncomeReport, wraps in `{ voie_report: ... }` format
- Error path: POST /api/collections with no documents -> still works (server adds test docs)
- Error path: GET /api/collections/:id for non-existent collection -> 404

**Verification:**
- Full document collection lifecycle tested from creation through report retrieval.

---

- [ ] **Unit 8: Main server route tests (webhook receiver, search, polling)**

**Goal:** Test the endpoints defined directly in server/index.js.

**Requirements:** R4

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `tests/server/routes/main.test.js`

**Execution note:** Red/Green TDD.

**Patterns to follow:**
- `server/index.js` inline routes

**Test scenarios:**
- Happy path: GET /api/companies?q=Home+Depot -> calls truv.searchCompanies, returns results, logs with session_id
- Happy path: GET /api/providers?q=Chase&data_source=financial_accounts -> calls truv.searchProviders
- Happy path: POST /api/webhooks/truv with valid HMAC -> stores webhook event, returns 200
- Happy path: POST /api/webhooks/truv with order-status-updated:completed -> updates order status in DB
- Error path: POST /api/webhooks/truv with invalid HMAC -> returns 401
- Happy path: GET /api/users/:id/webhooks -> returns webhook events from DB
- Happy path: GET /api/users/:id/logs?session_id=X -> returns API logs (user + session scoped)
- Edge case: GET /api/companies with empty q -> returns []

**Verification:**
- Webhook receiver, search endpoints, and polling endpoints all covered.

---

### Phase 4: Frontend Hooks

- [ ] **Unit 9: useReportFetch hook tests**

**Goal:** Test the core logic of the unified report-fetching hook.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/useReportFetch.js` (export `getReportTypes` and `checkWebhookDone` for direct testing)
- Create: `tests/hooks/use-report-fetch.test.js`

**Approach:**
- Export `getReportTypes` and `checkWebhookDone` as named exports (they are currently module-private)
- Test these as pure functions
- Test the hook's effect-based behavior with a minimal renderHook wrapper

**Execution note:** Red/Green TDD.

**Patterns to follow:**
- `src/components/useReportFetch.js` internal logic

**Test scenarios:**
- Happy path: `getReportTypes(['income'])` returns `['income']`
- Happy path: `getReportTypes(['assets'])` returns `['assets', 'income_insights']` (auto-pairing)
- Happy path: `getReportTypes(['income', 'assets'])` returns `['income', 'assets', 'income_insights']`
- Edge case: `getReportTypes(['assets', 'income_insights'])` does NOT duplicate income_insights
- Happy path: `checkWebhookDone(webhooks, 'task')` returns true when webhooks include task-status-updated:done
- Happy path: `checkWebhookDone(webhooks, 'order')` returns true for order-status-updated:completed
- Edge case: `checkWebhookDone([], 'task')` returns false (empty webhooks)
- Edge case: `checkWebhookDone(webhooks, null)` returns false (null event type)
- Edge case: `checkWebhookDone` works when event data is in parsed payload vs top-level fields
- Happy path: Hook does NOT fetch when webhook condition is not met
- Happy path: Hook fetches all report types when webhook condition triggers
- Happy path: Hook calls pollOnceAndStop after fetch completes
- Happy path: Hook resets (fetchedRef) when products change (same userId)
- Edge case: Hook does not re-fetch after fetchedRef is set (single-fire guard)

**Verification:**
- getReportTypes and checkWebhookDone fully covered as pure functions. Hook lifecycle tested.

---

### Phase 5: Per-Demo Logic Tests

- [ ] **Unit 10: SmartRouting demo tests**

**Goal:** Test SmartRouting's unique routing recommendation logic and config.

**Requirements:** R1, R6

**Dependencies:** Unit 9

**Files:**
- Create: `tests/demos/smart-routing.test.js`

**Execution note:** Red/Green TDD.

**Test scenarios:**
- Happy path: Payroll method passes `products: ['income']`, `webhookEvent: 'task'`, `reportType: 'income'` to useReportFetch config
- Happy path: Bank method passes `products: ['income_insights']`, `webhookEvent: 'task'`
- Happy path: METHODS array has correct dataSources: payroll->['payroll'], bank->['financial_accounts'], documents->['docs']
- Happy path: Routing recommendation: company with `success_rate: 'high'` -> recommends 'payroll'
- Happy path: Routing recommendation: company with `success_rate: 'low'` -> recommends 'bank'
- Happy path: Routing recommendation: no search results -> recommends 'documents'
- Edge case: Empty employer string in search -> returns no results -> documents

**Verification:**
- SmartRouting's routing logic and useReportFetch config verified for all three methods.

---

- [ ] **Unit 11: Bridge-flow demo tests (BankIncome, PayrollIncome, DepositSwitch, PaycheckLinkedLoans)**

**Goal:** Verify each Bridge-flow demo passes the correct config to useReportFetch and bridge-token creation.

**Requirements:** R1, R6

**Dependencies:** Unit 9

**Files:**
- Create: `tests/demos/bank-income.test.js`
- Create: `tests/demos/payroll-income.test.js`
- Create: `tests/demos/deposit-switch.test.js`
- Create: `tests/demos/paycheck-linked-loans.test.js`

**Execution note:** Red/Green TDD. Each demo gets its own test file.

**Test scenarios:**

*BankIncome:*
- Happy path: useReportFetch config has `products: ['income_insights']`, `webhookEvent: 'task'`
- Happy path: Bridge token created with `product_type: 'income'`, `data_sources: ['financial_accounts']`

*PayrollIncome:*
- Happy path: useReportFetch config has `products: ['income']`, `webhookEvent: 'task'`
- Happy path: Bridge token created with `product_type: 'income'`, `data_sources: ['payroll']`
- Happy path: Company search used for employer deeplink (company_mapping_id passed)

*DepositSwitch:*
- Happy path: useReportFetch config has `products: ['deposit_switch']`, `webhookEvent: 'task'`
- Happy path: Bridge token created with `product_type: 'deposit_switch'`

*PaycheckLinkedLoans:*
- Happy path: useReportFetch config has `products: ['income', 'deposit_switch']`, `webhookEvent: 'task'`
- Happy path: Both income and deposit_switch reports fetched in parallel
- Happy path: Bridge token created with `product_type: 'pll'`

**Verification:**
- Each demo's product/webhook/report contract verified in its own test file.

---

- [ ] **Unit 12: Orders-flow demo tests (Application, CustomerPortal, FollowUp, LOS, EmployeePortal)**

**Goal:** Verify each Orders-flow demo's product mappings, webhook events, and multi-product logic.

**Requirements:** R1, R6

**Dependencies:** Unit 9

**Files:**
- Create: `tests/demos/application.test.js`
- Create: `tests/demos/customer-portal.test.js`
- Create: `tests/demos/follow-up.test.js`
- Create: `tests/demos/los.test.js`
- Create: `tests/demos/employee-portal.test.js`

**Execution note:** Red/Green TDD. Each demo gets its own test file.

**Test scenarios:**

*Application:*
- Happy path: Income product -> `products: ['income']`, `webhookEvent: 'order'`
- Happy path: Assets product -> `products: ['assets']`, `webhookEvent: 'order'` (triggers assets + income_insights via getReportTypes)
- Happy path: DIAGRAMS object has entries for 'income' and 'assets'

*CustomerPortal:*
- Happy path: Income -> `products: ['income']`, `webhookEvent: 'order'`
- Happy path: Employment -> `products: ['employment']`, `webhookEvent: 'order'`
- Happy path: Assets -> `products: ['assets']`, `webhookEvent: 'order'`

*FollowUp:*
- Happy path: TASKS array defines 4 tasks with correct products: income, employment, assets, income+assets
- Happy path: All orders share the same external_user_id
- Happy path: activeTaskInfo resolves correct task by matching order_id from URL param
- Happy path: useReportFetch config uses active task's products and `webhookEvent: 'order'`
- Edge case: activeTaskInfo returns null when taskOrders is null
- Edge case: activeTaskInfo returns null when param doesn't match any order

*LOS:*
- Happy path: Creates order with PII + email + phone (no Bridge in UI)
- Happy path: Uses `webhookEvent: 'order'`

*EmployeePortal:*
- Happy path: Same contracts as LOS (structurally identical with different labels)

**Verification:**
- All 5 Orders-flow demos verified with product/webhook/report contracts.

---

- [ ] **Unit 13: Document-flow demo tests (PSDocuments, UploadDocuments)**

**Goal:** Verify document collection flow logic.

**Requirements:** R1, R6

**Dependencies:** Unit 1

**Files:**
- Create: `tests/demos/ps-documents.test.js`
- Create: `tests/demos/upload-documents.test.js`

**Execution note:** Red/Green TDD. Each demo gets its own file.

**Test scenarios:**

*PSDocuments:*
- Happy path: Screen state machine transitions: intro -> upload -> processing -> review
- Happy path: Collection creation sends documents as base64
- Happy path: Finalization triggers after all files status: 'successful'
- Happy path: Webhook with task-status-updated:done containing link_id triggers report fetch
- Happy path: Report fetched via /api/collections/:id/report?link_id=X

*UploadDocuments:*
- Happy path: Same contracts as PSDocuments (structurally identical with different labels)
- Happy path: Screen state machine matches: intro -> upload -> processing -> review

**Verification:**
- Both document-flow demos verified with collection lifecycle contracts.

## System-Wide Impact

- **Interaction graph:** Tests add a new `vitest` dev dependency and test scripts. No impact on production code except exporting two helper functions from `useReportFetch.js`.
- **Error propagation:** Test failures block CI (when CI is added). No runtime impact.
- **State lifecycle risks:** None. Tests use isolated in-memory DBs.
- **API surface parity:** N/A.
- **Integration coverage:** Server route tests verify the full mock-Truv -> route-handler -> DB -> response chain per endpoint.
- **Unchanged invariants:** All existing application behavior is unchanged. The only source modification is exporting `getReportTypes` and `checkWebhookDone` from useReportFetch.js (additive, not breaking).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Vitest ESM + better-sqlite3 native module compatibility | better-sqlite3 is synchronous C++ addon; Vitest's Node environment handles it natively. If issues arise, use `--pool forks` flag. |
| Mock TruvClient response shapes diverge from real API | Keep mock factories simple; match only the fields the route handlers actually use. |
| Exporting internals from useReportFetch creates coupling | Only export pure helper functions (getReportTypes, checkWebhookDone), not stateful internals. These are stable contracts unlikely to change. |
| Per-demo tests become repetitive for similar demos | Accept some repetition for the benefit of R6 (independent per-demo files). Use shared test helpers to reduce boilerplate. |

## Sources & References

- Related code: `src/components/useReportFetch.js`, `server/routes/user-reports.js`, all 12 `src/demos/*.jsx` files
- Related branch: `fix/unify-report-polling` (current work)
