# Deployment

> You don't need any of this to run the demos locally. See the
> [Quick start](../README.md#quick-start) for that. This page is only for
> hosting the demo as a public, multi-tenant app.

The demo runs in one of two modes, resolved entirely in
[`server/config.js`](../server/config.js):

| Mode | When | Credentials | Webhooks |
|------|------|-------------|----------|
| **Local** (default) | No `PUBLIC_BASE_URL` set | One shared set from `.env` | One shared webhook |
| **Hosted** (multi-tenant) | `PUBLIC_BASE_URL` set | Each visitor brings their own keys | One webhook per session |

Mode is inferred from `PUBLIC_BASE_URL`: set it and the server runs hosted. An
explicit `ALLOW_ENV_FALLBACK_CREDS=true|false` overrides the inference either
way.

## Hosted (bring-your-own credentials)

In hosted mode each visitor pastes their own Truv API keys into a Configure
screen on first visit. Credentials live only in the server's process memory for
the session — nothing hits disk, logs, or the database. Each session registers
its own webhook on the visitor's Truv account, so signatures and event delivery
are isolated per visitor.

Set the public origin the visitors' Truv accounts will reach you at, plus a
secret for cookie signing:

```
PUBLIC_BASE_URL=https://demo.truv.com
SESSION_COOKIE_SECRET=<random 32+ char string>
```

Build and start:

```sh
npm install
npm run build
npm start
```

On first visit the server validates the pasted keys with a probe to
`/v1/webhooks/`, registers a per-session webhook at
`<PUBLIC_BASE_URL>/api/webhooks/truv/<sid>`, and sets an HttpOnly session cookie.

## Sign in with Truv (Auth0 SSO)

If you set the Auth0 vars, the Configure screen leads with **Sign in with Truv**
and visitors with a `dashboard.truv.com` account skip the paste step. After
Auth0 PKCE, the backend calls `GET <dashboard-backend>/v2/user_keys/` with the
user's access token and lands their sandbox keys in the session.

```
VITE_AUTH0_DOMAIN=auth.truv.com
VITE_AUTH0_CLIENT_ID=<dashboard SPA client id>
VITE_AUTH0_AUDIENCE=https://dashboard-backend-prod.truv.com/
```

If any is missing, the SSO route returns `503 sso_disabled` and the Configure
screen renders the paste flow instead — no breakage.

## Docker

Build and run everything in a single container. Provide the env vars for the
mode you want:

```sh
docker build -t truv-demo-app .
docker run -p 3000:3000 --env-file .env truv-demo-app
```

Open **http://localhost:3000**.

## Environment variable reference

All variables are optional for local development except `API_CLIENT_ID` /
`API_SECRET`. Defaults live in [`server/config.js`](../server/config.js).

| Variable | Mode | Default | Purpose |
|----------|------|---------|---------|
| `API_CLIENT_ID` / `API_SECRET` | Local | — | Shared sandbox credentials (required locally) |
| `PORT` | Both | `3000` | Backend listen port |
| `PUBLIC_BASE_URL` | Hosted | — | Public origin; its presence selects hosted mode and is the webhook base |
| `ALLOW_ENV_FALLBACK_CREDS` | Both | inferred | Force local (`true`) or hosted (`false`), overriding the `PUBLIC_BASE_URL` inference |
| `NGROK_URL` | Local | — | Webhook origin for local mode (tunnel to `localhost:3000`) |
| `SESSION_COOKIE_SECRET` | Hosted | random per-process | Signs session cookies; set a stable value so sessions survive restarts |
| `SESSION_IDLE_TTL_MS` | Both | `3600000` | Idle session lifetime |
| `DASHBOARD_URL` | Both | `https://dashboard.truv.com` | Dashboard frontend origin for key/webhook deep links |
| `DASHBOARD_BACKEND_URL` | Both | `https://dashboard-backend-prod.truv.com` | Dashboard backend for SSO key fetch |
| `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` / `VITE_AUTH0_AUDIENCE` | Hosted | — | Auth0 SSO ("Sign in with Truv") |
| `BRIDGE_URL` | Both | `https://cdn.truv.com/bridge.js` | Bridge script URL injected into built HTML |

## Receiving webhooks locally

Local mode registers one shared webhook on your Truv account at startup. For
Truv to reach `localhost`, point a tunnel at it and set `NGROK_URL`:

```sh
ngrok http 3000
# copy the forwarding URL into .env as NGROK_URL=https://...
```

Without `NGROK_URL` the demos still run end-to-end for outbound API calls; only
inbound webhook delivery is unavailable.
