# Truv Quickstart

Interactive demo apps for the [Truv API](https://docs.truv.com). Each demo walks through a real integration pattern end-to-end: creating users, launching Bridge, receiving webhooks, and fetching reports.

Built with Preact, Vite, Tailwind CSS v4, and Express.

## Demos

Demos are organized by industry. Each starts with an intro screen and architecture diagram, then walks through the integration step by step with a live sidebar showing API calls, Bridge events, and webhooks.

### Mortgage

| Demo | What it shows |
|------|---------------|
| **POS Application** | Collect applicant PII, search for employer, create an order, verify through Bridge |
| **POS Tasks** | Create multiple verification tasks for one applicant (income, employment, assets) |
| **LOS** | Create orders with PII and send verification links via email/SMS — no user present |
| **Document Processing** | Upload pay stubs, W-2s, and tax returns. Truv validates and extracts structured data |

### Public Sector

| Demo | What it shows |
|------|---------------|
| **Customer Portal** | Same flow as POS Application, branded for public sector |
| **Document Processing** | Same flow as Mortgage Document Processing |
| **Verifier Portal** | Same flow as LOS, branded for public sector |

### Consumer Credit

| Demo | What it shows |
|------|---------------|
| **Smart Routing** | Check employer's `success_rate` via company search, recommend payroll/bank/documents, user picks |
| **Bank Income** | Connect to a bank via `financial_accounts` data source, fetch income insights report |
| **Payroll Income** | Connect to payroll via `payroll` data source, fetch VOIE report |
| **Paycheck-Linked Loans** | Set up payroll deductions (`pll` product), fetch both VOIE and DDS reports |

### Retail Banking

| Demo | What it shows |
|------|---------------|
| **Direct Deposit Switch** | Switch direct deposit routing via `deposit_switch` product |

## Two integration patterns

The demos illustrate two Truv integration patterns:

### Orders API (Mortgage, Public Sector)

```
POST /v1/orders/ → bridge_token → Bridge (inline) → webhooks → POST /v1/users/{id}/reports/
```

The server creates an order with applicant PII. Truv returns a `bridge_token`. Bridge opens inline. Reports are fetched by user ID. Best for workflows where you collect applicant data upfront.

**Key files:** `server/routes/orders.js`, `server/routes/reports.js`, `src/demos/Application.jsx`

### Bridge / User+Token (Consumer Credit, Retail Banking)

```
POST /v1/users/ → POST /v1/users/{id}/tokens/ → Bridge (popup) → public_token → link report
```

The server creates a user, then generates a bridge token with `product_type` and `data_sources`. Bridge opens as a popup. On success, the `public_token` is exchanged for a link report. Best for consumer-facing flows where you want to control which verification methods Bridge shows.

**Key files:** `server/routes/bridge.js`, `src/demos/SmartRouting.jsx`

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

### 3. Start ngrok

Webhooks need a public URL. In a separate terminal:

```sh
ngrok http 3000
```

Copy the forwarding URL into `.env`:

```
NGROK_URL=https://your-tunnel.ngrok-free.dev
```

### 4. Run

```sh
npm start      # Backend (Express, port 3000)
npm run dev    # Frontend (Vite, port 5173)
```

Open **http://localhost:5173** and pick an industry.

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
  truv.js                Truv API client — all v1 endpoint wrappers
  db.js                  SQLite (local, ephemeral) for orders, logs, webhooks
  routes/
    orders.js            Orders API (Mortgage demos)
    reports.js           VOIE, VOE, assets, income insights reports
    bridge.js            Bridge Token flow (Consumer Credit demos)
    upload-documents.js  Document collections

src/
  App.jsx                Router + industry/demo registry
  Home.jsx               Home page — industry picker
  IndustryPage.jsx       Demo list for a selected industry
  demos/
    SmartRouting.jsx      ★ Best starting point for Consumer Credit pattern
    Application.jsx       ★ Best starting point for Mortgage/Orders pattern
    BankIncome.jsx        Bank income (financial_accounts)
    PayrollIncome.jsx     Payroll income (payroll data source)
    DepositSwitch.jsx     Direct deposit switch
    PaycheckLinkedLoans.jsx  PLL with dual reports
    FollowUp.jsx          Multi-task verification
    EmployeePortal.jsx    Remote verifier portal
    UploadDocuments.jsx   Document processing
  components/
    ApplicationForm.jsx   Shared PII form (handles employer vs bank search)
    CompanySearch.jsx     Typeahead — uses /v1/company-mappings-search/ or /v1/providers/
    Layout.jsx            App shell with sidebar
    Panel.jsx             Sidebar tabs (Guide, API, Bridge, Webhooks)
    hooks.js              usePanel() — state management for sidebar polling
    Icons.jsx             SVG icon library
    reports/              Report renderers (VoieReport, AssetsReport, DDSReport, etc.)
    screens/              Shared screens (BridgeScreen, OrderWaitingScreen, etc.)
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
| `GET /v1/providers/?data_source=financial_accounts` | Bank/institution search | `provider_id` |

When creating a bridge token, pass `company_mapping_id` for employers or `provider_id` for banks to deeplink Bridge directly to that institution.

### Webhooks

All demos wait for webhooks before fetching reports. The key event is `task-status-updated` with status `done`. The server verifies webhook signatures via HMAC-SHA256.

## Learn more

- [Truv documentation](https://docs.truv.com)
- [API reference](https://docs.truv.com/reference)
- [Bridge overview](https://docs.truv.com/docs/bridge-overview)
- [Webhooks guide](https://docs.truv.com/docs/webhooks)
- [Company Search API](https://docs.truv.com/reference/company_autocomplete_search)
- [Bridge Tokens API](https://docs.truv.com/reference/users_tokens)

## License

MIT
