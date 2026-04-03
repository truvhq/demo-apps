---
title: "refactor: Unify all demos to fetch reports via user reports endpoints"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Unify all demos to fetch reports via user reports endpoints

## Overview

Replace the two separate report-fetching paths (Orders: `/api/orders/:id/report`, Bridge: `/api/link-report/:publicToken/:reportType`) with a single unified path: all demos call `/api/users/:userId/reports/:reportType`. Both Orders and Bridge flows produce a `user_id`, so all reports should be fetched through the Truv user reports endpoints:

- `POST /v1/users/{id}/reports/` (VOIE/VOE)
- `POST /v1/users/{id}/assets/reports/` (Assets)
- `POST /v1/users/{id}/income_insights/reports/` (Income Insights)
- `GET /v1/users/{id}/deposit_switch/reports/` (DDS)

This eliminates the link-access-tokens exchange, simplifies the architecture, and ensures consistent report rendering across all demos.

## Problem Frame

Currently the codebase has two report paths:

1. **Orders demos** (Application, FollowUp, LOS, CustomerPortal, EmployeePortal): fetch via `GET /api/orders/:id/report` which internally calls `POST /v1/users/{uid}/reports/`. Reports are rendered with typed components (`VoieReport`, `AssetsReport`, `IncomeInsightsReport`).

2. **Bridge demos** (SmartRouting, BankIncome, PayrollIncome, PaycheckLinkedLoans, DepositSwitch): fetch via `GET /api/link-report/:publicToken/:reportType` which exchanges the `public_token` for a `link_id`, then calls `GET /v1/links/{link_id}/{product}/report`. This is unnecessary since the `user_id` is already known.

The Truv user reports endpoints are the canonical, safe choice:
- `POST /v1/users/{id}/reports/` (https://docs.truv.com/reference/users_reports)
- `POST /v1/users/{id}/assets/reports/` (https://docs.truv.com/reference/assets-report-create)
- `POST /v1/users/{id}/income_insights/reports/` (https://docs.truv.com/reference/income-insights-report-create)
- `GET /v1/users/{id}/deposit_switch/reports/` (https://docs.truv.com/reference/dds-report-retrieve)

## Requirements Trace

- R1. All demos fetch reports via Truv user reports endpoints, not link reports
- R2. A single server endpoint serves all report types by userId and reportType
- R3. Every demo renders a typed report component (VoieReport, AssetsReport, IncomeInsightsReport, DDSReport), never raw JSON
- R4. Bridge demos still exchange public_token via `POST /v1/link-access-tokens/` (public_token is ephemeral, must be exchanged for permanent access_token). But reports are fetched via user reports endpoints, not link reports.
- R5. Diagrams and guide text updated to show the user reports endpoints
- R6. OrderResultsScreen removed in favor of a generic ReportScreen that fetches by userId + reportType

## Scope Boundaries

- Not changing how orders or bridge tokens are created
- Not changing webhook handling
- Not adding new report types
- Not changing report component rendering (VoieReport, AssetsReport, etc. stay as-is)

## Context & Research

### Current Report Architecture

**Orders flow (server/routes/reports.js):**
- `GET /api/orders/:id/report` looks up the order, gets `user_id`, then calls the user reports endpoints
- Has a `REPORT_CONFIG` map that knows how to create/fetch each report type
- Caches reports in the DB

**Bridge flow (server/routes/bridge.js):**
- `GET /api/link-report/:publicToken/:reportType` exchanges `public_token` for `link_id`, then calls `GET /v1/links/{link_id}/{product}/report`
- No caching, no typed report creation

**Existing report components:**
- `VoieReport` (income + employment)
- `AssetsReport` (bank balances, transactions)
- `IncomeInsightsReport` (bank-derived income)
- `DDSReport` (deposit switch confirmation)

### Report Type to Component Mapping

| Product/Report Type | Truv Endpoint | Component |
|---|---|---|
| `income` | `POST /v1/users/{id}/reports/` with `is_voe: false` | `VoieReport` |
| `employment` | `POST /v1/users/{id}/reports/` with `is_voe: true` | `VoieReport` |
| `assets` | `POST /v1/users/{id}/assets/reports/` | `AssetsReport` |
| `income_insights` | `POST /v1/users/{id}/income_insights/reports/` | `IncomeInsightsReport` |
| `deposit_switch` | `GET /v1/users/{id}/deposit_switch/reports/` | `DDSReport` |
| `pll` | `GET /v1/users/{id}/deposit_switch/reports/` (same endpoint) | `DDSReport` + `VoieReport` |

### Demos and Their Report Needs

| Demo | Current fetch | Report types needed |
|---|---|---|
| Application | OrderResultsScreen | income OR assets (income_insights too) |
| FollowUp | OrderResultsScreen | income, employment, assets (per task) |
| LOS | /api/orders/:id/report | income OR employment OR assets |
| EmployeePortal | /api/orders/:id/report | income OR employment OR assets |
| CustomerPortal | OrderResultsScreen | income OR employment OR assets |
| UploadDocuments | OrderResults (document data) | N/A (document collections, not user reports) |
| PSDocuments | OrderResults (document data) | N/A (document collections, not user reports) |
| SmartRouting | /api/link-report (public_token) | income (VoieReport or IncomeInsightsReport) |
| BankIncome | /api/link-report (public_token) | income (IncomeInsightsReport) |
| PayrollIncome | /api/link-report (public_token) | income (VoieReport) |
| PaycheckLinkedLoans | /api/link-report (public_token) | income + deposit_switch (VoieReport + DDSReport) |
| DepositSwitch | /api/link-report (public_token) | deposit_switch (DDSReport) |

## Key Technical Decisions

- **Single new server endpoint:** `GET /api/users/:userId/reports/:reportType` replaces both the orders report endpoint and the link-report endpoint. It calls the appropriate Truv user reports endpoint based on reportType.

- **Remove link-report endpoint:** The `GET /api/link-report/:publicToken/:reportType` endpoint and the `getAccessToken`/`getLinkReport` methods are no longer needed.

- **Keep OrderResultsScreen for Orders demos but rewire it:** Instead of fetching via `/api/orders/:id/report`, it fetches via `/api/users/:userId/reports/:reportType`. The `orderId` is still needed to look up the `userId` and `product_type`, so the server endpoint can accept either.

- **Actually, simpler: replace OrderResultsScreen with a ReportScreen.** All demos know their `userId` and `reportType` at the point they navigate to results. Pass those directly instead of going through the order lookup.

- **Document demos (UploadDocuments, PSDocuments) are out of scope.** They use document collections, not user reports.

## Implementation Units

- [ ] **Unit 1: Create unified user reports server endpoint**

  **Goal:** Add `GET /api/users/:userId/reports/:reportType` that calls the correct Truv user reports endpoint.

  **Requirements:** R1, R2

  **Dependencies:** None

  **Files:**
  - Create: `server/routes/user-reports.js`
  - Modify: `server/index.js` (register new route)

  **Approach:**
  - The endpoint accepts `reportType` as one of: `income`, `employment`, `assets`, `income_insights`, `deposit_switch`
  - For `income` and `employment`: call `POST /v1/users/{id}/reports/` with `is_voe` flag
  - For `assets`: call `POST /v1/users/{id}/assets/reports/`
  - For `income_insights`: call `POST /v1/users/{id}/income_insights/reports/`
  - For `deposit_switch`: call `GET /v1/users/{id}/deposit_switch/reports/` (note: this is a GET, not POST)
  - Log each call via apiLogger
  - Return the report data directly
  - Reuse the existing `REPORT_CONFIG` pattern from `server/routes/reports.js`

  **Patterns to follow:**
  - `server/routes/reports.js` REPORT_CONFIG and fetchReport pattern

  **Test scenarios:**
  - Happy path: `GET /api/users/:userId/reports/income` returns VOIE report
  - Happy path: `GET /api/users/:userId/reports/deposit_switch` returns DDS report
  - Error path: Invalid reportType returns 400
  - Error path: Truv API error returns appropriate status

  **Verification:**
  - Endpoint returns report data for all 5 report types

- [ ] **Unit 2: Refactor Bridge demos to use user reports endpoint**

  **Goal:** Replace all `link-report` fetches with `/api/users/:userId/reports/:reportType` in SmartRouting, BankIncome, PayrollIncome, PaycheckLinkedLoans, DepositSwitch.

  **Requirements:** R1, R4

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/SmartRouting.jsx`
  - Modify: `src/demos/BankIncome.jsx`
  - Modify: `src/demos/PayrollIncome.jsx`
  - Modify: `src/demos/PaycheckLinkedLoans.jsx`
  - Modify: `src/demos/DepositSwitch.jsx`

  **Approach:**
  - These demos already have `userId` in state (set when creating the bridge token)
  - Keep `publicToken` state and Bridge `onSuccess` callback. The public_token is ephemeral and MUST be exchanged for a permanent access_token via `POST /v1/link-access-tokens/`. This exchange still happens server-side.
  - Add a new server endpoint `POST /api/exchange-token` that accepts `{ public_token, user_id }`, calls `POST /v1/link-access-tokens/`, and stores the access_token. This happens immediately after Bridge onSuccess.
  - After webhook `done`, fetch report via `GET /api/users/${userId}/reports/${reportType}` instead of `GET /api/link-report/${publicToken}/${reportType}`
  - The flow becomes: Bridge onSuccess -> exchange token -> wait for webhook -> fetch user report
  - For PaycheckLinkedLoans: fetch both `/reports/income` and `/reports/deposit_switch` in parallel
  - For SmartRouting: fetch `/reports/income` for payroll, `/reports/income_insights` for bank

  **Patterns to follow:**
  - Current webhook-watching useEffect pattern stays the same
  - Token exchange happens eagerly after onSuccess, report fetch happens after webhook

  **Test scenarios:**
  - Happy path: BankIncome exchanges token on onSuccess, then fetches income report by userId after webhook done
  - Happy path: PaycheckLinkedLoans fetches both income and deposit_switch reports by userId
  - Happy path: DepositSwitch fetches deposit_switch report by userId

  **Verification:**
  - All Bridge demos exchange public_token for access_token after Bridge completes
  - All Bridge demos fetch reports via user reports endpoint, not link reports
  - No remaining references to `/api/link-report/` in demo fetch calls

- [ ] **Unit 3: Refactor Orders demos to use user reports endpoint**

  **Goal:** Replace OrderResultsScreen with direct report fetching by userId in Application, FollowUp, CustomerPortal. Refactor LOS and EmployeePortal similarly.

  **Requirements:** R1, R6

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/Application.jsx`
  - Modify: `src/demos/FollowUp.jsx`
  - Modify: `src/demos/CustomerPortal.jsx`
  - Modify: `src/demos/LOS.jsx`
  - Modify: `src/demos/EmployeePortal.jsx`

  **Approach:**
  - Application, CustomerPortal: after order creation, the server returns `user_id` in the response. Store it in state. After webhook `done`, fetch reports via `/api/users/${userId}/reports/${productType}`. For assets, also fetch `income_insights`.
  - FollowUp: same pattern per task, each task has its own order and userId
  - LOS, EmployeePortal: already have order data with userId. Switch from `/api/orders/:id/report` to `/api/users/:userId/reports/:reportType`
  - Render reports using typed components directly (VoieReport, AssetsReport, etc.) instead of through OrderResults wrapper

  **Patterns to follow:**
  - Bridge demos (after Unit 2) as the model for webhook-then-report pattern

  **Test scenarios:**
  - Happy path: Application income flow shows VoieReport after verification
  - Happy path: Application assets flow shows AssetsReport + IncomeInsightsReport
  - Happy path: LOS shows correct report type based on product

  **Verification:**
  - No remaining references to `/api/orders/:id/report` in demo code
  - OrderResultsScreen no longer imported by any demo

- [ ] **Unit 4: Update diagrams and guide text for user reports endpoints**

  **Goal:** All architecture diagrams and sidebar guides reference user reports endpoints, not link reports.

  **Requirements:** R5

  **Dependencies:** Units 2-3

  **Files:**
  - Modify: All demo files with DIAGRAM constants and STEPS guide HTML

  **Approach:**
  - Keep `POST /v1/link-access-tokens/` in Bridge flow diagrams (it still happens for token exchange)
  - Replace `GET /v1/links/{link_id}/...` report lines with `POST /v1/users/{user_id}/reports/` (or the appropriate variant)
  - Update guide HTML to show the user reports endpoints for the report-fetching step
  - Diagram flow: Bridge onSuccess -> exchange token -> webhook done -> fetch user report

  **Test scenarios:**
  - Test expectation: none (text/diagram only)

  **Verification:**
  - No remaining references to `GET /v1/links/{link_id}/` in any diagram or guide
  - `POST /v1/link-access-tokens/` still present in Bridge flow diagrams

- [ ] **Unit 5: Remove OrderResults and OrderResultsScreen**

  **Goal:** Delete the OrderResults wrapper and OrderResultsScreen. All demos must render typed report components (VoieReport, AssetsReport, etc.) directly via user reports. No order-based report aggregation on the frontend.

  **Requirements:** R3, R6

  **Dependencies:** Units 2-3 (all demos already switched off these components)

  **Files:**
  - Delete: `src/components/screens/OrderResultsScreen.jsx`
  - Delete: `src/components/OrderResults.jsx`
  - Modify: `src/components/screens/index.js` (remove OrderResultsScreen export)
  - Modify: `src/components/index.js` (remove OrderResults export)

  **Approach:**
  - Delete both files. All backend endpoints stay as-is.
  - Remove exports from barrel files.
  - Verify no demo imports either component.

  **Test scenarios:**
  - Happy path: App starts without errors
  - Edge case: No broken imports across all demos

  **Verification:**
  - `grep -r 'OrderResults' src/` returns zero hits
  - All demos render reports via typed components directly

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| DDS report endpoint is GET not POST | Handle per-type in the unified endpoint; REPORT_CONFIG already differentiates |
| SmartRouting bank method needs income_insights not VOIE | The server can check what's available and return the right one, or the frontend can request the specific type |
| FollowUp has multiple orders per user | Each task creates its own order with its own userId; fetch reports per userId per task |

## Sources & References

- Truv user reports: https://docs.truv.com/reference/users_reports
- Truv assets report: https://docs.truv.com/reference/assets-report-create
- Truv income insights: https://docs.truv.com/reference/income-insights-report-create
- Truv DDS report: https://docs.truv.com/reference/dds-report-retrieve
- Related code: `server/routes/reports.js` (existing REPORT_CONFIG pattern), `server/routes/bridge.js` (link-report to remove), `src/components/reports/` (typed renderers)
