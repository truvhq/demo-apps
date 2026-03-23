# Truv Quickstart Demos

Five interactive demos showing different Truv integration patterns. Each demo walks through the full flow — from creating orders to receiving webhooks to fetching reports.

| Demo | Integration pattern | Key APIs |
|------|-------------------|----------|
| **Application** | Collect applicant info, verify via Bridge | Orders, Company Search, Reports |
| **Follow-up** | Multiple verification tasks for one applicant | Orders with shared `external_user_id`, Reports |
| **Employee Portal** | Employee self-service verification | Orders, Share URL |
| **Choice Connect** | User-initiated Bridge (no order) | Users, Bridge Tokens, Link Reports |
| **Upload Documents** | Document collection and processing | Document Collections |

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [ngrok](https://ngrok.com/) (free account, required for webhooks)

## Setup

```sh
git clone https://github.com/truvhq/demo-apps.git
cd demo-apps
npm install
cp .env.example .env
```

Edit `.env` with your [Truv API credentials](https://dashboard.truv.com/app/development/keys):

```
API_CLIENT_ID=your_client_id
API_SECRET=your_secret
NGROK_URL=https://your-subdomain.ngrok-free.dev
```

## Run

Start ngrok (required for webhooks):

```sh
ngrok http 3000
```

Copy the forwarding URL into `NGROK_URL` in `.env`, then start the app:

```sh
# Terminal 1: backend
npm start

# Terminal 2: frontend (with hot reload)
npm run dev
```

Open http://localhost:5173

## Project structure

```
server/                     # Express backend
  index.js                  # Entry point: middleware, webhooks, startup
  routes/
    orders.js               # Order CRUD (Application, Follow-up, Employee Portal)
    reports.js              # Report fetching (VOIE, VOE, assets, income insights)
    bridge.js               # User + Bridge Token flow (Choice Connect)
    upload-documents.js     # Document collection lifecycle
  truv.js                   # Truv API client
  db.js                     # SQLite database
  api-logger.js             # API call logging with PII redaction
  webhooks.js               # HMAC signature verification
  webhook-setup.js          # Ngrok webhook registration

src/                        # Preact + Vite + Tailwind frontend
  App.jsx                   # Hash-based router
  Home.jsx                  # Demo selector
  demos/                    # One component per demo
  components/               # Shared UI (Layout, Panel, OrderResults)
```

## Sandbox credentials

- Employer: **Home Depot**
- Login: `goodlogin` / `goodpassword`
- Bank (for assets): **Chase Bank** (auto-connected)
