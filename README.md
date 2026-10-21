# Truv Demo Apps

Interactive demo apps for the [Truv API](https://docs.truv.com). Each demo walks through a real integration pattern end-to-end: creating users, launching Bridge, receiving webhooks, and fetching reports.

Built with Preact, Vite, Tailwind CSS v4, and Express.

## Demos

Demos are organized by industry. Each starts with a split intro screen (business context on the left, architecture diagram on the right), then walks through the integration step by step with a live sidebar showing API calls, Bridge events, and webhooks.

### Mortgage

| Demo | What it shows |
|------|---------------|
| **POS Application** | A borrower fills out a loan application and verifies their income or assets in real time |
| **POS Tasks** | After submitting, the borrower returns to complete remaining verifications: income, employment, assets |
| **LOS** | A Loan Processor creates verification orders from the LOS using borrower data on file |
| **Document Processing** | Process pay stubs, W-2s, and tax returns. Truv validates and extracts structured income data |

### Public Sector

| Demo | What it shows |
|------|---------------|
| **Customer Portal** | An applicant applies for benefits and verifies income through a self-service portal |
| **Document Processing** | Process pay stubs, W-2s, and tax returns for benefit eligibility decisions |
| **Case Worker Portal** | A Case Worker creates verification orders using applicant data on file |
| **Renewals & Data Refresh** | Guided walkthrough plus a live recertification cycle: refresh existing payroll and bank connections via `POST /v1/orders/{id}/`, then see the two outcomes. A refresh that needs re-authorization emits `order-refresh-failed`, and that connection does not complete until the applicant acts, so listening only for `order-status-updated` will not tell you it failed |
| **Orders & Refresh Lifecycle** | A guide with a live sandbox playground: when to refresh versus start a new order, what a refresh returns for each connection (with a captured timeline), what to do when one connection fails and the others succeed, all 11 terminal statuses with what to do for each, and a plain-language section for people who are not writing the code |

### Consumer Credit

| Demo | What it shows |
|------|---------------|
| **Smart Routing** | Check employer coverage and recommend the best verification method: payroll, bank, or documents |
| **Bank Income** | Verify applicant income from bank transactions when payroll data isn't available |
| **Payroll Income** | Verify income and employment directly from payroll data |
| **Paycheck-Linked Loans** | Set up automatic loan repayment through payroll deductions |
| **Income + PLL** | Chained Orders flow with coverage and DDS pre-checks: VOIE first, then a linked PLL order that reuses the borrower's payroll session |

### Retail Banking

| Demo | What it shows |
|------|---------------|
| **Direct Deposit Switch** | Switch a customer's direct deposit to your bank through their payroll provider |

### Coverage Analysis

| Demo | What it shows |
|------|---------------|
| **Payroll Coverage** | Upload up to 10,000 employers and bulk-check Truv coverage via `POST /v1/companies/`. Rate-limited and retried |
| **Financial Accounts Coverage** | Upload up to 10,000 financial institutions and bulk-check Truv coverage via `providers` (data_source=financial_accounts) |

The two Coverage Analysis demos ship with sample CSVs (`public/samples/employer_sample.csv`, `public/samples/bank_sample.csv`). Jobs run in-memory on the backend with concurrency 5; 429 responses honor the API's `Retry-After` hint (plus a 10s buffer) and 5xx responses fall back to exponential backoff. There is no DB persistence, so a server restart cancels in-flight jobs.

## Architecture

All demos follow the same 3-tier architecture. API keys never touch the frontend.

```
Your Frontend (browser)  -->  Your Backend (server)  -->  Truv API
       |                            |                        |
   Bridge widget             API credentials           Verification
   User interaction          Webhook receiver           Reports
```

### Orders API (Mortgage, Public Sector)

```
Frontend                    Backend                     Truv API
   |                           |                           |
   |-- submit form ----------->|                           |
   |                           |-- POST /v1/orders/ ------>|
   |                           |<---- bridge_token --------|
   |<---- bridge_token --------|                           |
   |-- TruvBridge.init() ------------------------------------>
   |                           |<---- webhook: completed --|
   |                           |-- POST /v1/users/{id}/reports/ -->
   |                           |<---- report data ---------|
```

Best for workflows where you collect applicant data upfront. The server creates an order with PII, Truv returns a `bridge_token`, and reports are fetched by user ID.

**Key files:** `server/routes/orders.js`, `server/routes/user-reports.js`, `src/demos/POSApplication.jsx`

### Bridge / User+Token (Consumer Credit, Retail Banking)

```
Frontend                    Backend                     Truv API
   |                           |                           |
   |-- submit form ----------->|                           |
   |                           |-- POST /v1/users/ ------->|
   |                           |<---- user_id -------------|
   |                           |-- POST /v1/users/{id}/tokens/ -->
   |                           |<---- bridge_token --------|
   |<---- bridge_token --------|                           |
   |-- TruvBridge.init() ------------------------------------>
   |                           |<---- webhook: done -------|
   |                           |-- POST /v1/users/{id}/reports/ -->
   |                           |<---- report data ---------|
```

Best for consumer-facing flows. The server creates a user, generates a bridge token with `product_type` and `data_sources`, and reports are fetched by user ID.

**Key files:** `server/routes/bridge.js`, `server/routes/user-reports.js`, `src/demos/SmartRouting.jsx`

## Quick start

Run everything locally against your own Truv sandbox. Two processes: the
Express backend (port 3000) and the Vite frontend (port 5173).

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+
- A [Truv sandbox account](https://dashboard.truv.com/app/development/keys) (free)

### 1. Clone and install

```sh
git clone https://github.com/truvhq/demo-apps.git
cd demo-apps
npm install
cp .env.example .env
```

### 2. Add your sandbox keys

Put your Truv sandbox credentials in `.env`:

```
API_CLIENT_ID=your_client_id
API_SECRET=your_secret
```

That's all the config you need.

### 3. Run

```sh
npm start      # Backend (Express, port 3000)
npm run dev    # Frontend (Vite, port 5173)
```

Open **http://localhost:5173** and pick an industry — the demos use your `.env`
keys directly, no Configure screen.

### Sandbox credentials

When a demo launches Bridge, connect a provider with the sandbox login:

| Field | Value |
|-------|-------|
| Employer | **Home Depot** (or search for any company) |
| Login | `goodlogin` |
| Password | `goodpassword` |

### Environment variables

Only the first two are needed to run locally.

| Variable | Default | What it does |
|----------|---------|--------------|
| `API_CLIENT_ID`, `API_SECRET` | none | Your Truv sandbox keys |
| `NGROK_URL` | none | A public HTTPS address for this server, so Truv can deliver webhooks. Any tunnel works (ngrok, cloudflared). The name is historical. |
| `TRUV_API_URL` | `https://prod.truv.com/v1/` | API base URL. It must end in `/v1/`. Sandbox keys use this same host. |
| `TRUV_ENV_TYPE` | `sandbox` | Which environment's webhooks the server registers for |
| `PORT` | `3000` | Backend port |
| `BRIDGE_URL` | `https://cdn.truv.com/bridge.js` | Where the browser loads Bridge from |

Hosting variables (`PUBLIC_BASE_URL`, `SESSION_COOKIE_SECRET`, SSO) are covered in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Receiving webhooks (optional)

The demos run end-to-end for outbound API calls without any extra setup. To
also receive inbound webhooks on `localhost`, point a tunnel (ngrok, cloudflared, or similar) at port 3000 and
set `NGROK_URL` in `.env`:

```sh
ngrok http 3000          # copy the forwarding URL
```

```
NGROK_URL=https://your-tunnel.ngrok-free.dev
```

### Deploying

Hosting this as a public, multi-tenant demo (per-visitor keys, SSO, Docker) is
covered separately in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). You don't need
any of it for local development.

## Project structure

```
server/
  index.js               Express entry point: wires routes, webhooks, company/provider search
  config.js              Settings and run mode (local by default; deployment settings live here)
  serve-static.js        Production static-file serving (deployment only)
  truv.js                Truv API client with a wrapper for each v1 endpoint the demos use
  db.js                  SQLite (local, ephemeral) for orders, logs, webhooks
  api-logger.js          API call logging with PII redaction
  webhooks.js            Webhook signature verification (HMAC-SHA256)
  webhook-setup.js       Registers the shared webhook on startup when NGROK_URL is set
  dashboard.js           Dashboard backend client (server to server)
  sessions/              Hosted mode only: signed session cookies and per-visitor key store
  lib/csv.js             CSV parser and serializer for the coverage demos
  routes/
    orders.js            Orders API (Mortgage, Public Sector)
    renewals-refresh.js  Renewals and data refresh: create a refresh, resolve each connection's outcome
                         (the pure classifier functions at the top are the reusable part)
    user-reports.js      Unified report fetching by user id and report type
    reports.js           Legacy order-based report fetching with caching
    bridge.js            Bridge token flow (Consumer Credit, Retail Banking)
    voie-pll.js          Income then paycheck-linked-loan chained orders
    upload-documents.js  Document collections
    coverage-analysis.js Bulk coverage lookups
    session.js           Hosted mode: bring-your-own-keys session routes

src/
  App.jsx                Router and industry/demo registry (INDUSTRIES). A demo with kind: 'guide' is listed under Guides.
  Home.jsx               Home page with industry cards
  IndustryPage.jsx       Demos and Guides for one industry
  demos/                 One file per demo. scaffolding/ holds each demo's copy and config.
    SmartRouting.jsx       Best starting point for Consumer Credit (Bridge flow)
    POSApplication.jsx     Best starting point for Mortgage (Orders flow)
    RenewalsRefresh.jsx    Public Sector: renewals and data refresh (live flow)
    RefreshGuide.jsx       Orders and refresh lifecycle guide with a sandbox playground
    Batching.jsx           Guided walkthrough of bulk order intake
    BankIncome.jsx, PayrollIncome.jsx, DirectDepositSwitch.jsx, PaycheckLinkedLoans.jsx,
    IncomePLLChained.jsx   Consumer Credit and Retail Banking demos
    POSTasks.jsx, LOS.jsx, DocumentProcessing.jsx   Mortgage demos
    CustomerPortal.jsx, CaseWorkerPortal.jsx, PSDocumentProcessing.jsx   Public Sector and Retail Banking demos
    PayrollCoverage.jsx, BankCoverage.jsx   Coverage Analysis
  diagrams/              Mermaid architecture diagrams, one per demo
  components/            Shared UI: Layout, Panel (Guide/API/Bridge/Webhooks tabs), Walkthrough,
                         DeviceFrame, WebhookFeed, CompanySearch, IntroSlide, and more
    reports/             Report renderers (VoieReport, AssetsReport, DDSReport, ...)
    screens/             Shared screens (OrderWaitingScreen)

examples/
  refresh-minimal.mjs    Standalone script (no dependencies): refresh an order and print each connection's result
```

## Key concepts

### data_sources

Controls which verification methods Bridge shows to the user. Pass when creating a bridge token:

| Value | Bridge shows |
|-------|-------------|
| `['payroll']` | Payroll providers only |
| `['financial_accounts']` | Banks only |
| `['docs']` | Document upload only |
| *(omit)* | All available methods |

### Employer search vs Provider search

| Endpoint | When to use | Returns |
|----------|-------------|---------|
| `GET /v1/company-mappings-search/?query=...` | Payroll employer search | `company_mapping_id` |
| `GET /v1/providers/?search=...` | Bank/institution search | `provider_id` |

When creating a bridge token, pass `company_mapping_id` for employers or `provider_id` for banks to deeplink Bridge directly to that institution.

### Reports

All reports are fetched via the user reports endpoints (never link reports):

| Report | Endpoint |
|--------|----------|
| Income (VOIE) | `POST /v1/users/{id}/reports/` with `{ is_voe: false }` |
| Employment (VOE) | `POST /v1/users/{id}/reports/` with `{ is_voe: true }` |
| Assets (VOA) | `POST /v1/users/{id}/assets/reports/` |
| Income Insights | `POST /v1/users/{id}/income_insights/reports/` |
| Deposit Switch | `GET /v1/users/{id}/deposit_switch/report/` |

### Refresh

To re-check an applicant without asking for documents again, refresh the connections they already made.

| Step | Call |
|------|------|
| Refresh every connection on an order | `POST /v1/orders/{original_order_id}/` with `{ "products": ["income"] }` |
| Refresh only some connections | the same call with `employers: [{ id }]` or `financial_accounts: [{ id }]` from the original order |
| Refresh one connection directly | `POST /v1/refresh/tasks/` with its `access_token` and a `product_type` |
| Read each connection's result | `GET /v1/tasks/?user_id={user_id}`, matched to your case file by `link_id` |
| Read the refreshed data | `GET /v1/orders/{refresh_order_id}/`, then `GET` the report named by its `voie_report_id` (income) or `voa_report_id` (assets). A completed refresh order already has its own report, so nothing is created |

Refreshes are limited per connection: 1 initial request plus 3 refreshes in any 24 hours. A refresh sent right
after Bridge finishes can be rejected for about 15 to 20 seconds, so retry. A connection that needs the
applicant again fails with `login_error`, `mfa_error` or `session_expired`; send the applicant the refresh
order's `share_url`. The full guide is the **Orders & Refresh Lifecycle** page in the Public Sector demos, and
`examples/refresh-minimal.mjs` shows the calls in one file.

### Webhooks

All demos wait for webhooks before fetching reports. The key events are:
- `task-status-updated` with status `done` (Bridge flow)
- `order-status-updated` with status `completed` (Orders flow). On a refresh it describes one connection, so do not read it as "the whole refresh worked".
- `order-refresh-failed` when a refresh needs the applicant. It carries a status such as `mfa_error`, but not the error text and not a `link_id` you can match; read those from the task.

The server verifies webhook signatures via HMAC-SHA256.

## Learn more

- [Truv documentation](https://docs.truv.com)
- [API reference](https://docs.truv.com/api-reference/authentication)
- [Bridge overview](https://docs.truv.com/developers/integration/bridge-widget/overview)
- [Webhooks guide](https://docs.truv.com/api-reference/webhooks)
- [Company Search API](https://docs.truv.com/api-reference/companies/company_autocomplete_search)
- [Providers API](https://docs.truv.com/api-reference/data-providers/providers-list)
- [Bridge Tokens API](https://docs.truv.com/api-reference/bridge-token/users_tokens)
- [User Reports API](https://docs.truv.com/api-reference/user-income-and-employment-reports/users_reports)

## AI tools

This project ships with Truv's documentation wired up for AI coding assistants so you can ask questions about the API and this integration directly in your editor.

- **MCP server** — `https://docs.truv.com/mcp`. Already configured for this repo in [`.mcp.json`](.mcp.json). Reload your editor (Cursor, Windsurf, Claude Code, Claude Desktop) after cloning to pick it up. Full setup docs: [truv.com/docs/mcp](https://truv.com/docs/mcp).
- **llms.txt** — [truv.com/docs/llms.txt](https://truv.com/docs/llms.txt) is a plain-text index of the Truv docs optimized for LLMs. Paste it into an assistant that doesn't support MCP to give it full context on Truv APIs.

## License

MIT
