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

**Key files:** `server/routes/orders.js`, `server/routes/user-reports.js`, `src/demos/Application.jsx`

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

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [ngrok](https://ngrok.com/) (free tier) for receiving webhooks locally
- A [Truv sandbox account](https://dashboard.truv.com/app/development/keys) (free)

### 1. Clone and install

```sh
git clone https://github.com/truvhq/demo-apps.git
cd demo-apps
npm install
```

### 2. Configure

```sh
cp .env.example .env
```

Add your Truv API credentials to `.env`:

```
API_CLIENT_ID=your_client_id
API_SECRET=your_secret
```

### 3. Start ngrok and configure NGROK_URL

Webhooks need a public URL. In a terminal, run:

```sh
# Terminal 1 — ngrok
ngrok http 3000
```

Copy the forwarding URL into `.env`:

```
NGROK_URL=https://your-tunnel.ngrok-free.dev
```

### 4. Run

Keep ngrok terminal opened, open two new terminals and run following commands:

```sh
npm start      # Backend (Express, port 3000)
npm run dev    # Frontend (Vite, port 5173)
```

Open **http://localhost:5173** and pick an industry.

### Run with Docker

Build and run everything in a single container:

```sh
docker build -t truv-demo-app .
docker run -p 3000:3000 --env-file .env truv-demo-app
```

Open **http://localhost:3000** and pick an industry.

### Sandbox credentials

| Field | Value |
|-------|-------|
| Employer | **Home Depot** (or search for any company) |
| Login | `goodlogin` |
| Password | `goodpassword` |

## Project structure

```
server/
  index.js               Express entry point, webhooks, company/provider search
  truv.js                Truv API client with all v1 endpoint wrappers
  db.js                  SQLite (local, ephemeral) for orders, logs, webhooks
  api-logger.js          API call logging with PII redaction
  webhooks.js            HMAC-SHA256 webhook signature verification
  webhook-setup.js       Auto-registers ngrok webhook on startup
  routes/
    orders.js            Orders API (Mortgage, Public Sector demos)
    user-reports.js      Unified report fetching by userId and reportType
    reports.js           Legacy order-based report fetching
    bridge.js            Bridge Token flow (Consumer Credit, Retail Banking demos)
    upload-documents.js  Document collections

src/
  App.jsx                Router + industry/demo registry (INDUSTRIES config)
  Home.jsx               Home page with industry cards
  IndustryPage.jsx       Demo list for a selected industry
  demos/
    SmartRouting.jsx      Best starting point for Consumer Credit (Bridge flow)
    Application.jsx       Best starting point for Mortgage (Orders flow)
    BankIncome.jsx        Bank income via financial_accounts
    PayrollIncome.jsx     Payroll income via payroll data source
    DepositSwitch.jsx     Direct deposit switch
    PaycheckLinkedLoans.jsx  PLL with dual reports (income + deposit switch)
    FollowUp.jsx          Multi-task verification with shared external_user_id
    LOS.jsx               Loan Processor creates orders, sends verification links
    EmployeePortal.jsx    Case Worker portal (same as LOS, government context)
    CustomerPortal.jsx    Self-service verification (same as Application, government context)
    UploadDocuments.jsx   Document processing via Document Collections API
    PSDocuments.jsx       Document processing (same as UploadDocuments, government context)
  components/
    Header.jsx            Shared header bar with Truv logo
    ApplicationForm.jsx   Shared PII form (handles employer vs bank search)
    CompanySearch.jsx     Typeahead search for employers or financial institutions
    IntroSlide.jsx        Split intro layout (text left, diagram right)
    Layout.jsx            App shell with Header and optional sidebar Panel
    Panel.jsx             Sidebar tabs (Guide, API, Bridge, Webhooks)
    hooks.js              usePanel() hook for sidebar state and polling
    Icons.jsx             SVG icon library including Truv wordmark
    MermaidDiagram.jsx    Renders architecture diagrams as inline SVG
    reports/              Typed report renderers (VoieReport, AssetsReport, DDSReport, etc.)
    screens/              Shared demo screens (BridgeScreen, OrderWaitingScreen)
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

### Webhooks

All demos wait for webhooks before fetching reports. The key events are:
- `task-status-updated` with status `done` (Bridge flow)
- `order-status-updated` with status `completed` (Orders flow)

The server verifies webhook signatures via HMAC-SHA256.

## Learn more

- [Truv documentation](https://docs.truv.com)
- [API reference](https://docs.truv.com/reference)
- [Bridge overview](https://docs.truv.com/docs/truv-bridge)
- [Webhooks guide](https://docs.truv.com/docs/webhooks)
- [Company Search API](https://docs.truv.com/reference/company_autocomplete_search)
- [Providers API](https://docs.truv.com/reference/list_providers)
- [Bridge Tokens API](https://docs.truv.com/reference/users_tokens)
- [User Reports API](https://docs.truv.com/reference/users_reports)

## AI tools

This project ships with Truv's documentation wired up for AI coding assistants so you can ask questions about the API and this integration directly in your editor.

- **MCP server** — `https://docs.truv.com/mcp`. Already configured for this repo in [`.mcp.json`](.mcp.json). Reload your editor (Cursor, Windsurf, Claude Code, Claude Desktop) after cloning to pick it up. Full setup docs: [truv.com/docs/mcp](https://truv.com/docs/mcp).
- **llms.txt** — [truv.com/docs/llms.txt](https://truv.com/docs/llms.txt) is a plain-text index of the Truv docs optimized for LLMs. Paste it into an assistant that doesn't support MCP to give it full context on Truv APIs.

## License

MIT
