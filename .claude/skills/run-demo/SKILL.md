---
name: run-demo
description: Launch and drive the Truv Demo Apps locally — Express backend (port 3000) + Vite frontend (port 5173). Use when asked to run, start, launch, or screenshot the demo app, or to confirm a change works in the real app.
---

# Run the Truv Demo Apps locally

Two processes: an Express backend on **port 3000** and a Vite frontend on
**port 5173**. The frontend proxies `/api` → `http://localhost:3000` (see
`vite.config.js`), so both must run. Open **http://localhost:5173**.

Prereqs: `node_modules` present (`npm install` if not), Node 20.19+, and your
Truv sandbox `API_CLIENT_ID` / `API_SECRET` in `.env`.

## Launch

```sh
npm start      # → "Truv Demo Apps running on http://localhost:3000"
npm run dev    # → Vite ready on http://localhost:5173
```

Open **http://localhost:5173** → pick an industry. The demos use your `.env`
keys directly — no Configure screen. When a demo launches Bridge, connect with
the sandbox login: employer **Home Depot**, `goodlogin` / `goodpassword`.

How it works: with no `PUBLIC_BASE_URL` set, the server runs in local mode
(`server/config.js`) — one shared TruvClient built from `.env`, injected into
every request. Webhook delivery to `localhost` needs a tunnel; set `NGROK_URL`
in `.env` if you need inbound webhooks (the demos otherwise run fine without).

> Deployment settings (hosted/multi-tenant mode, SSO, Docker) are out of scope
> for local runs — see `docs/DEPLOYMENT.md` if you actually need them.

## Verify it's up

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/    # 200 — app shell
curl -s http://localhost:3000/api/session/status                  # {"authenticated":true}
curl -s "http://localhost:3000/api/companies?q=home%20depot"       # live Truv data
```

A 200 from 5173 (the `Truv Demo Apps` HTML shell) plus `authenticated:true` and
real company data from the backend means the launch succeeded. Drive it further
in a browser if the change you're verifying is UI-facing.

## Gotchas

- **`Local mode needs API_CLIENT_ID and API_SECRET in .env`** → the server
  exits at boot because those keys are missing. Add your sandbox keys to `.env`.
- **`EADDRINUSE :::3000`** or Vite says **"Port 5173 is in use, trying another
  one…"** → a stale server from a prior session is holding the port. Kill it and
  relaunch on the canonical port so the proxy target and browser URL stay
  consistent:
  ```sh
  lsof -ti :3000 | xargs kill    # backend
  lsof -ti :5173 | xargs kill    # frontend
  ```
  Don't just use the fallback port Vite picks (5174…).
