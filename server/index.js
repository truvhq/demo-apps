/**
 * FILE SUMMARY: Express Server Entry Point
 * DATA FLOW: Frontend (browser on localhost) --> Express (port 3000) --> Truv API
 *
 * Initializes the Express app, registers middleware, and defines top-level
 * routes for company/provider search, webhook ingestion, and polling. Demo
 * logic lives in sub-route modules (orders, reports, bridge, uploads,
 * user-reports, coverage-analysis).
 *
 * Run mode and all deployment settings are resolved in ./config.js — for local
 * development you only need API_CLIENT_ID / API_SECRET in .env.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { mountStaticIfBuilt } from './serve-static.js';
import { TruvClient } from './truv.js';
import * as db from './db.js';
import * as apiLogger from './api-logger.js';
import { verifyWebhookSignature } from './webhooks.js';
import { setupWebhook, teardownWebhook, registerWebhook, unregisterWebhook } from './webhook-setup.js';
import { createSessionStore } from './sessions/store.js';
import { sessionMiddleware } from './sessions/middleware.js';
import { startSweeper } from './sessions/sweeper.js';
import { DashboardClient } from './dashboard.js';
import sessionRoutes from './routes/session.js';
import ordersRoutes from './routes/orders.js';
import reportsRoutes from './routes/reports.js';
import bridgeRoutes from './routes/bridge.js';
import uploadDocumentsRoutes from './routes/upload-documents.js';
import userReportsRoutes from './routes/user-reports.js';
import voiePllRoutes from './routes/voie-pll.js';
import coverageAnalysisRoutes from './routes/coverage-analysis.js';

// Local mode keeps one TruvClient built from your .env keys and uses it for
// every request. (Hosted deployments build a client per visitor instead.)
const localTruv = config.localMode
  ? new TruvClient({ clientId: config.creds.clientId, secret: config.creds.secret })
  : null;
db.initDb();

// In-memory, TTL'd session store. Holds per-visitor API credentials; never
// touches disk.
const sessionStore = createSessionStore({ idleTtlMs: config.session.idleTtlMs });

// Dashboard backend client for the SSO key-fetch path. Always constructed so
// session routes can inject it; the route returns 503 when SSO is disabled.
const dashboardClient = new DashboardClient({ baseUrl: config.dashboard.backendUrl });

// Sweeper: periodically evict idle sessions and best-effort delete their webhook.
const sweeper = startSweeper({
  store: sessionStore,
  intervalMs: 5 * 60_000,
  async onExpire(record) {
    if (!record.webhookId) return;
    const client = new TruvClient({ clientId: record.clientId, secret: record.secret });
    await unregisterWebhook(client, record.webhookId);
  },
});

// Express setup: JSON body parsing (with raw body capture for webhook HMAC
// verification) and CORS restricted to localhost origins.
const app = express();
app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); } }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/, credentials: true }));
app.use(cookieParser());
app.use(sessionMiddleware({ store: sessionStore, cookieSecret: config.session.cookieSecret }));

// Local mode: when a request has no per-visitor session, use the shared .env
// client so demos work out of the box with no Configure screen.
if (localTruv) {
  app.use((req, _res, next) => {
    if (!req.truv) req.truv = localTruv;
    next();
  });
}

// --- Company search ---
// Frontend --> GET /api/companies?q=... --> Truv company-mappings-search API.
// Used by payroll-based demos to find employers. Logs the API call for the activity panel.
app.get('/api/companies', async (req, res) => {
  try {
    if (!req.truv) return res.status(401).json({ error: 'session_required' });
    const query = req.query.q;
    if (!query) return res.json([]);
    const result = await req.truv.searchCompanies(query, req.query.product_type);
    apiLogger.logApiCall({ sessionId: req.query.session_id, method: 'GET', endpoint: `/v1/company-mappings-search/?query=${query}`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
    res.json(result.data || []);
  } catch (err) { console.error(err); res.json([]); }
});

// --- Provider search (financial institutions) ---
// Frontend --> GET /api/providers?q=... --> Truv providers API.
// Used by bank/assets demos to find financial institutions.
app.get('/api/providers', async (req, res) => {
  try {
    if (!req.truv) return res.status(401).json({ error: 'session_required' });
    const query = req.query.q;
    if (!query) return res.json([]);
    const result = await req.truv.searchProviders(query, req.query.product_type, req.query.data_source);
    apiLogger.logApiCall({ sessionId: req.query.session_id, method: 'GET', endpoint: `/v1/providers/?query=${query}`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
    const data = result.data?.results || result.data || [];
    res.json(Array.isArray(data) ? data : []);
  } catch (err) { console.error(err); res.json([]); }
});

// --- Webhook receiver (per-session) ---
// Truv API --> POST /api/webhooks/truv/:sessionId --> this handler.
// The session id in the URL selects the secret used for HMAC verification, so
// each customer's webhook is verified against their own session's secret.
// Payload handling logic is identical to the legacy single-tenant version.
let tunnelUrl = null;

function processWebhookPayload(req) {
  const payload = req.body;
  let userId = payload.user_id || null;
  const linkId = payload.link_id || null;

  // When an order completes, update its status in the local database
  if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
    const order = db.findOrderByUserId(userId);
    if (order) db.updateOrder(order.id, { status: 'completed' });
  }

  // task-status-updated payloads omit user_id but include link_id. Resolve via
  // prior webhooks for the same link, which carry user_id (link-connected,
  // statements-created, etc.) and seed the lookup as a side-effect of ingestion.
  if (!userId && linkId) userId = db.findUserByLinkInEvents(linkId);

  // The webhook arrived on this session's registered URL, so the session owns
  // this user_id — record it to authorize the per-user polling endpoints.
  if (userId) db.recordSessionUser(req.params.sessionId, userId);

  apiLogger.pushWebhookEvent({ userId, webhookId: payload.webhook_id, eventType: payload.event_type, status: payload.status, payload });
}

app.post('/api/webhooks/truv/:sessionId', (req, res) => {
  const session = sessionStore.get(req.params.sessionId);
  if (!session) return res.status(404).end();

  const sigMatch = verifyWebhookSignature(req.rawBody, session.secret, req.headers['x-webhook-sign']);
  if (!sigMatch) { console.warn('Webhook signature mismatch'); return res.status(401).end(); }

  console.log(`Webhook[${req.params.sessionId.slice(0, 8)}]: ${req.body.event_type} (${req.body.status || '-'}) user=${req.body.user_id || '-'}`);
  processWebhookPayload(req);
  res.status(200).end();
});

// Single-tenant webhook receiver — local mode only. Verifies against the
// shared .env secret and shares the per-session payload handler above.
if (config.localMode) {
  app.post('/api/webhooks/truv', (req, res) => {
    const sigMatch = verifyWebhookSignature(req.rawBody, config.creds.secret, req.headers['x-webhook-sign']);
    if (!sigMatch) { console.warn('Webhook signature mismatch'); return res.status(401).end(); }
    console.log(`Webhook: ${req.body.event_type} (${req.body.status || '-'}) user=${req.body.user_id || '-'}`);
    processWebhookPayload(req);
    res.status(200).end();
  });
}

// Returns the ngrok tunnel URL so the frontend can display it
app.get('/api/tunnel-url', (_req, res) => res.json({ url: tunnelUrl }));

// --- Polling endpoints ---
// Frontend polls these to display real-time webhook events and API logs in the
// activity panel. They read from the shared local DB by user_id, so in hosted
// (multi-tenant) mode they MUST be authorized: only the session that owns the
// user_id may read its activity. Local mode is single-tenant, so it stays open.
function authorizeUser(req, res) {
  if (config.localMode) return true;
  if (!req.session) { res.status(401).json({ error: 'session_required' }); return false; }
  if (!db.sessionOwnsUser(req.session.id, req.params.userId)) { res.status(403).json({ error: 'forbidden' }); return false; }
  return true;
}

app.get('/api/users/:userId/webhooks', (req, res) => {
  if (!authorizeUser(req, res)) return;
  res.json(db.getWebhookEventsByUserId(req.params.userId));
});
app.get('/api/users/:userId/logs', (req, res) => {
  if (!authorizeUser(req, res)) return;
  // The ownership gate above protects the sensitive user-scoped logs. The
  // session_id arg only widens the result to this session's pre-order search
  // logs (public company/provider queries), which carry no user-level data.
  res.json(db.getApiLogsByUserId(req.params.userId, req.query.session_id));
});

// --- Session routes ---
// Per-visitor credentials: a visitor POSTs Truv keys to /api/session and gets
// an HttpOnly cookie. In local mode the shim above means demos already work, so
// this mainly serves the Configure UI. The hooks register/tear down a webhook
// on that session's Truv account.
app.use(sessionRoutes({
  store: sessionStore,
  cookieSecret: config.session.cookieSecret,
  idleTtlMs: config.session.idleTtlMs,
  dashboardClient,
  dashboardUrl: config.dashboard.url,
  ssoEnabled: config.sso.enabled,
  localMode: config.localMode,
  async onSessionCreated({ id, client }) {
    if (!config.webhookBaseUrl) {
      // Sessions still work for outbound API calls; webhooks just can't be
      // delivered without a reachable origin. Log it, don't block the session.
      console.warn('No webhook origin configured — skipping webhook registration for this session.');
      return true;
    }
    const webhookUrl = `${config.webhookBaseUrl.replace(/\/$/, '')}/api/webhooks/truv/${id}`;
    const name = `demo-${id.slice(0, 8)}`;
    const { webhookId: registeredId, error } = await registerWebhook(client, webhookUrl, { name });
    if (!registeredId) {
      console.error(`Webhook registration failed for session ${id.slice(0, 8)}:`, error);
      return false;
    }
    sessionStore.setWebhookId(id, registeredId);
    return true;
  },
  async onSessionDestroyed({ record }) {
    if (!record.webhookId) return;
    const client = new TruvClient({ clientId: record.clientId, secret: record.secret });
    await unregisterWebhook(client, record.webhookId);
  },
}));

// --- Demo routes ---
// Each handler uses the per-request req.truv (set by the session middleware, or
// by the local shim above). The shared local client is passed for convenience.
const deps = { truv: localTruv, db, apiLogger };
app.use(ordersRoutes(deps));
app.use(reportsRoutes(deps));
app.use(bridgeRoutes(deps));
app.use(uploadDocumentsRoutes(deps));
app.use(userReportsRoutes(deps));
app.use(voiePllRoutes(deps));
app.use(coverageAnalysisRoutes(deps));

// --- Health check ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Static files ---
// No-op locally (Vite serves the frontend). Serves dist/ after a build; must be
// last so its SPA catch-all doesn't shadow other routes.
mountStaticIfBuilt(app, config);

// --- Start ---
// Local mode registers a single shared webhook at startup; otherwise webhooks
// are registered per session as visitors configure their keys.
const server = app.listen(config.port, async () => {
  console.log(`Truv Demo Apps running on http://localhost:${config.port}`);
  if (config.localMode) {
    try { tunnelUrl = await setupWebhook({ path: '/api/webhooks/truv', truvClient: localTruv }); } catch (err) { console.error('Webhook setup failed:', err.message); }
  }
});

// Graceful shutdown: tears down the shared webhook (local mode) and any
// per-session webhooks, drains connections, then exits.
async function gracefulShutdown() {
  sweeper.stop();
  const teardowns = [];
  if (localTruv) teardowns.push(teardownWebhook(localTruv));
  for (const meta of sessionStore.all()) {
    if (!meta.hasWebhook) continue;
    const record = sessionStore.destroy(meta.id);
    if (record?.webhookId) {
      const client = new TruvClient({ clientId: record.clientId, secret: record.secret });
      teardowns.push(unregisterWebhook(client, record.webhookId));
    }
  }
  try {
    await Promise.race([Promise.all(teardowns), new Promise(r => setTimeout(r, 5000))]);
  } catch (err) {
    console.error('Webhook teardown failed:', err.message);
  }
  await new Promise((resolve) => {
    server.close((err) => {
      if (err) console.error('Server close failed:', err.message);
      resolve();
    });
  });
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
