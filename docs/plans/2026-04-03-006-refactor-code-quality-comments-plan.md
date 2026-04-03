---
title: "refactor: Improve code quality and developer-facing comments"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Improve code quality and developer-facing comments

## Overview

Add consistent file-level comments and inline documentation so external developers and LLMs can quickly understand how to integrate Truv by reading this codebase. Currently ~50% of files lack header comments, and some critical integration patterns (webhook handling, report fetching, Bridge initialization) have no explanation.

## Problem Frame

This is a demo/quickstart app that external developers use as reference. Every file should answer: "What does this do? What Truv API pattern does it demonstrate? Where do I start?" The code itself is functional, but a developer opening a random file may not understand the context without reading 3 other files first.

## Requirements Trace

- R1. Every server file has a header comment explaining its role and the Truv API endpoints it wraps
- R2. Every component file has a header comment explaining its purpose and props
- R3. Every demo file has a header comment explaining the integration pattern, screen flow, and API flow
- R4. Critical integration points (Bridge init, webhook handling, report fetching, token exchange) have inline comments explaining "why"
- R5. The README is updated to reflect all the changes made in this branch
- R6. No comment references "Plaid" or uses em dashes

## Scope Boundaries

- Not changing functionality or design
- Not adding JSDoc/TypeScript types (this is a Preact/JSX project)
- Not commenting obvious code (loops, conditionals). Only commenting integration-specific logic.
- Comments should be concise (1-3 lines for headers, 1 line for inline). Not essays.

## Key Technical Decisions

- **Header comment pattern for server files**: Describe routes, Truv API endpoints, and link to docs
- **Header comment pattern for demo files**: Describe the integration pattern (Orders vs Bridge), screen state machine, and API flow
- **Header comment pattern for components**: Describe purpose and key props
- **Inline comments at integration points only**: Bridge init, webhook parsing, report fetching, company search branching

## Implementation Units

- [ ] **Unit 1: Add header comments to all server files**

  **Goal:** Every server file has a clear header explaining its role.

  **Requirements:** R1

  **Files:**
  - Modify: `server/index.js`
  - Modify: `server/truv.js`
  - Modify: `server/db.js`
  - Modify: `server/api-logger.js`
  - Modify: `server/webhooks.js`

  **Approach:**
  - `server/index.js`: Express entry point, webhook receiver, company/provider search, polling endpoints
  - `server/truv.js`: Truv API client with links to docs for each method group
  - `server/db.js`: SQLite schema and queries for orders, logs, webhooks, reports
  - `server/api-logger.js`: PII redaction and API call logging
  - `server/webhooks.js`: HMAC-SHA256 signature verification
  - Route files already have good headers, just verify they're accurate

  **Test scenarios:**
  - Test expectation: none (comments only)

  **Verification:**
  - Every server/*.js file has a header comment

- [ ] **Unit 2: Add header comments to all component files**

  **Goal:** Every component file has a clear purpose statement and props list.

  **Requirements:** R2

  **Files:**
  - Modify: `src/components/CompanySearch.jsx`
  - Modify: `src/components/Layout.jsx`
  - Modify: `src/components/MermaidDiagram.jsx`
  - Modify: `src/components/OrderResults.jsx`
  - Modify: `src/components/Panel.jsx`
  - Modify: `src/components/WebhookFeed.jsx`
  - Modify: `src/components/index.js`

  **Approach:**
  - Brief purpose line + key props for each
  - CompanySearch: explain the dual-endpoint pattern (company-mappings-search vs providers)
  - Panel: explain the 4 sidebar tabs
  - WebhookFeed: explain webhook parsing

  **Test scenarios:**
  - Test expectation: none (comments only)

  **Verification:**
  - Every src/components/*.jsx file has a header comment

- [ ] **Unit 3: Add header comments to all demo files**

  **Goal:** Every demo file has a header explaining the integration pattern, screen flow, and API flow.

  **Requirements:** R3

  **Files:**
  - Modify: `src/demos/Application.jsx`
  - Modify: `src/demos/CustomerPortal.jsx`
  - Modify: `src/demos/FollowUp.jsx`
  - Modify: `src/demos/LOS.jsx`
  - Modify: `src/demos/EmployeePortal.jsx`
  - Modify: `src/demos/UploadDocuments.jsx`
  - Modify: `src/demos/PSDocuments.jsx`

  **Approach:**
  - Each header should state: demo name, industry, integration pattern (Orders or Bridge/User+Token), screen state machine, API flow summary
  - Follow the pattern already established in SmartRouting.jsx and BankIncome.jsx (which already have good headers)
  - For copy-paste demos (LOS=EmployeePortal, PSDocuments=UploadDocuments), note the original and what's different

  **Test scenarios:**
  - Test expectation: none (comments only)

  **Verification:**
  - Every src/demos/*.jsx file has a header comment with pattern, screens, and API flow

- [ ] **Unit 4: Add inline comments at critical integration points**

  **Goal:** Key "why" comments at webhook handling, Bridge init, report fetching, and search branching.

  **Requirements:** R4

  **Files:**
  - Modify: Various demo and server files where integration logic lives

  **Approach:**
  - Webhook checking: explain why we check both parsed payload and direct properties
  - Bridge init: explain the bridgeToken flow (backend creates, frontend opens)
  - Report fetching: explain why we use user reports endpoints
  - Company search: explain company_mapping_id vs provider_id
  - fetchedRef: explain why it prevents double-fetching
  - session_id: explain how it ties pre-order search logs to the session

  **Test scenarios:**
  - Test expectation: none (comments only)

  **Verification:**
  - Each critical integration point has a 1-line "why" comment

- [ ] **Unit 5: Update README to reflect current state**

  **Goal:** README accurately describes the current demo structure, API patterns, and setup.

  **Requirements:** R5

  **Files:**
  - Modify: `README.md`

  **Approach:**
  - Update the demo table to reflect current industry grouping and names
  - Update the "Two integration patterns" section with correct endpoint references
  - Update the project structure to reflect new files (Header.jsx, user-reports.js, etc.)
  - Add a "Key concepts" section update for data_sources, provider search
  - Remove any stale references to old demo names or removed files
  - Verify sandbox credentials are still correct

  **Test scenarios:**
  - Test expectation: none (documentation)

  **Verification:**
  - README demo table matches INDUSTRIES in App.jsx
  - Project structure tree matches actual files
  - All links point to correct Truv docs URLs

## Sources & References

- Existing well-commented files as patterns: `src/demos/SmartRouting.jsx`, `src/components/hooks.js`, `server/routes/bridge.js`
- Related code: all `server/`, `src/components/`, `src/demos/` files
