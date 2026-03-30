# Truv Quickstart

Interactive demo apps for the [Truv API](https://docs.truv.com). Each demo walks through a real integration pattern end-to-end: creating orders, launching Bridge, receiving webhooks, and fetching reports.

Built with Preact, Vite, Tailwind CSS, and Express.

## Demos

| Demo | What it shows |
|------|---------------|
| **Application** | Collect applicant info, search for employer, verify income or employment through Bridge |
| **Follow-up** | Create multiple verification tasks for one applicant using a shared `external_user_id` |
| **Consumer Credit** | Bundle income, deposit switch, and payroll-linked lending in one Bridge session (no orders) |
| **Verifier Portal** | Create orders server-side and send verification links via email/SMS — no user present |
| **Document Processing** | Upload pay stubs and tax returns, then extract structured data via Truv |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [ngrok](https://ngrok.com/) (free tier works) for receiving webhooks locally
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

Open `.env` and add your Truv API credentials:

```
API_CLIENT_ID=your_client_id
API_SECRET=your_secret
```

### 3. Start ngrok

Webhooks need a public URL. In a separate terminal:

```sh
ngrok http 3000
```

Copy the `https://...ngrok-free.dev` forwarding URL and set it in `.env`:

```
NGROK_URL=https://your-tunnel.ngrok-free.dev
```

### 4. Run

```sh
# Terminal 1 — backend (Express on port 3000)
npm start

# Terminal 2 — frontend (Vite dev server with hot reload)
npm run dev
```

Open **http://localhost:5173** and pick a demo.

### Sandbox test credentials

| Field | Value |
|-------|-------|
| Employer | **Home Depot** |
| Login | `goodlogin` |
| Password | `goodpassword` |
| Bank (assets) | **Chase Bank** (auto-connected in sandbox) |

## Project structure

```
server/
  index.js                  Entry point — middleware, webhooks, startup
  truv.js                   Truv API client wrapper
  db.js                     SQLite database (local, ephemeral)
  api-logger.js             API call logging with PII redaction
  webhooks.js               HMAC-SHA256 signature verification
  webhook-setup.js          Auto-registers ngrok webhook on startup
  routes/
    orders.js               Create/list/refresh orders
    reports.js              Fetch VOIE, VOE, assets, and income insights reports
    bridge.js               User + Bridge Token flow (no orders)
    upload-documents.js     Document collection lifecycle

src/
  App.jsx                   Hash-based router
  Home.jsx                  Demo picker
  demos/                    One component per demo
  components/               Shared UI — Layout, Panel, report renderers
```

## How it works

Each demo follows the same general flow:

1. **Create** — POST to Truv to create an order (or user + bridge token)
2. **Bridge** — Launch the [Truv Bridge](https://docs.truv.com/docs/bridge-overview) widget inline
3. **Webhooks** — Receive real-time status updates as verification progresses
4. **Reports** — Fetch structured verification data (income, employment, assets)

The right-side panel shows API calls, Bridge events, and webhook payloads as they happen — so you can see exactly what the integration does under the hood.

## Learn more

- [Truv documentation](https://docs.truv.com)
- [API reference](https://docs.truv.com/reference)
- [Bridge overview](https://docs.truv.com/docs/bridge-overview)
- [Webhooks guide](https://docs.truv.com/docs/webhooks)

## License

MIT
