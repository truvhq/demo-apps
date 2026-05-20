/**
 * FILE SUMMARY: Express Server Entry Point
 * DATA FLOW: Frontend (Browser on localhost) --> Express (port 3000) --> Truv API
 * INTEGRATION PATTERN: Supports both Orders flow and Bridge flow via sub-routes.
 *
 * Initializes the Express app, registers middleware, and defines top-level routes
 * for company/provider search, webhook ingestion, and polling endpoints. Delegates
 * demo-specific logic to sub-route modules (orders, reports, bridge, uploads, user-reports).
 */

// Imports: environment config, Express framework, CORS, and all server modules
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { TruvClient } from './truv.js';
import * as db from './db.js';
import * as apiLogger from './api-logger.js';
import { verifyWebhookSignature } from './webhooks.js';
import { setupWebhook, teardownWebhook, registerWebhook, unregisterWebhook } from './webhook-setup.js';
import { createSessionStore } from './sessions/store.js';
import { sessionMiddleware } from './sessions/middleware.js';
import { startSweeper } from './sessions/sweeper.js';
import sessionRoutes from './routes/session.js';
import ordersRoutes from './routes/orders.js';
import reportsRoutes from './routes/reports.js';
import bridgeRoutes from './routes/bridge.js';
import uploadDocumentsRoutes from './routes/upload-documents.js';
import userReportsRoutes from './routes/user-reports.js';
import coverageAnalysisRoutes from './routes/coverage-analysis.js';

// Configuration
const PORT = process.env.PORT || 3000;
const { API_CLIENT_ID, API_SECRET, PUBLIC_BASE_URL, NGROK_URL } = process.env;
const SESSION_IDLE_TTL_MS = Number(process.env.SESSION_IDLE_TTL_MS) || 3_600_000;
const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || randomBytes(32).toString('hex');
// Fallback dev mode: when truthy, the server keeps a singleton TruvClient
// from .env and registers one shared webhook at startup, preserving the
// pre-BYO behavior for local development.
const ALLOW_ENV_FALLBACK_CREDS = process.env.ALLOW_ENV_FALLBACK_CREDS === 'true';

if (ALLOW_ENV_FALLBACK_CREDS && (!API_CLIENT_ID || !API_SECRET)) {
  console.error('ALLOW_ENV_FALLBACK_CREDS=true requires API_CLIENT_ID and API_SECRET in .env');
  process.exit(1);
}

if (!ALLOW_ENV_FALLBACK_CREDS && !PUBLIC_BASE_URL) {
  console.error('PUBLIC_BASE_URL is required in BYO mode. Set it to the public origin reachable from the customer\'s Truv account (e.g., https://demo.truv.com), or enable ALLOW_ENV_FALLBACK_CREDS=true for local dev.');
  process.exit(1);
}

if (!ALLOW_ENV_FALLBACK_CREDS && !process.env.SESSION_COOKIE_SECRET) {
  console.warn('SESSION_COOKIE_SECRET is not set — using a per-process random value. Active sessions will reset on each restart.');
}

// The base URL the customer's Truv account uses to reach us. In fallback dev
// mode we keep accepting NGROK_URL. In BYO mode PUBLIC_BASE_URL is required.
const WEBHOOK_BASE_URL = ALLOW_ENV_FALLBACK_CREDS ? (NGROK_URL || PUBLIC_BASE_URL) : PUBLIC_BASE_URL;

// Initialization: optional singleton TruvClient for fallback mode, SQLite DB.
const fallbackTruv = ALLOW_ENV_FALLBACK_CREDS
  ? new TruvClient({ clientId: API_CLIENT_ID, secret: API_SECRET })
  : null;
db.initDb();

// Session store: in-memory, TTL'd. Holds per-visitor API credentials for the
// BYO-credentials flow. Sessions never reach disk.
const sessionStore = createSessionStore({ idleTtlMs: SESSION_IDLE_TTL_MS });

// Sweeper: periodically evict idle sessions and best-effort delete their
// per-session webhook from the customer's Truv account.
const sweeper = startSweeper({
  store: sessionStore,
  intervalMs: 5 * 60_000,
  async onExpire(record) {
    if (!record.webhookId) return;
    const client = new TruvClient({ clientId: record.clientId, secret: record.secret });
    await unregisterWebhook(client, record.webhookId);
  },
});

// Express setup: JSON body parsing (with raw body capture for webhook HMAC verification)
// and CORS restricted to localhost origins only.
const app = express();
app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); } }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/, credentials: true }));
app.use(cookieParser());
app.use(sessionMiddleware({ store: sessionStore, cookieSecret: SESSION_COOKIE_SECRET }));

// Fallback shim: when ALLOW_ENV_FALLBACK_CREDS is on and a request has no
// active BYO session, fall back to the .env-configured singleton client. This
// preserves the pre-BYO local-dev experience (no Configure screen, demos work
// against API_CLIENT_ID/API_SECRET out of the box).
if (fallbackTruv) {
  app.use((req, _res, next) => {
    if (!req.truv) req.truv = fallbackTruv;
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

// Legacy single-tenant webhook receiver. Active only when fallback dev mode is
// enabled so existing local-dev workflows keep working unchanged.
if (ALLOW_ENV_FALLBACK_CREDS) {
  app.post('/api/webhooks/truv', (req, res) => {
    const sigMatch = verifyWebhookSignature(req.rawBody, API_SECRET, req.headers['x-webhook-sign']);
    if (!sigMatch) { console.warn('Webhook signature mismatch'); return res.status(401).end(); }
    console.log(`Webhook: ${req.body.event_type} (${req.body.status || '-'}) user=${req.body.user_id || '-'}`);
    processWebhookPayload(req);
    res.status(200).end();
  });
}

// Returns the ngrok tunnel URL so the frontend can display it
app.get('/api/tunnel-url', (_req, res) => res.json({ url: tunnelUrl }));

// --- Polling endpoints ---
// Frontend polls these to display real-time webhook events and API logs in the activity panel.
app.get('/api/users/:userId/webhooks', (req, res) => res.json(db.getWebhookEventsByUserId(req.params.userId)));
app.get('/api/users/:userId/logs', (req, res) => res.json(db.getApiLogsByUserId(req.params.userId, req.query.session_id)));

// --- Session routes ---
// BYO API credentials: visitors POST their Truv keys to /api/session and
// receive an HttpOnly cookie. The onSessionCreated/onSessionDestroyed hooks
// register and tear down a per-session webhook on the customer's own Truv
// account.
app.use(sessionRoutes({
  store: sessionStore,
  cookieSecret: SESSION_COOKIE_SECRET,
  idleTtlMs: SESSION_IDLE_TTL_MS,
  async onSessionCreated({ id, client }) {
    if (!WEBHOOK_BASE_URL) {
      // Sessions still work for outbound API calls, but webhooks cannot be
      // delivered until PUBLIC_BASE_URL is configured. Surface the gap to
      // the operator via logs; do not block session creation.
      console.warn('PUBLIC_BASE_URL not set — skipping per-session webhook registration');
      return true;
    }
    const webhookUrl = `${WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/webhooks/truv/${id}`;
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
// Mounts sub-route modules. In BYO mode the per-request req.truv is used by
// each handler (U5); the deps object only carries db and apiLogger. In
// fallback mode the singleton truv is also provided for legacy compatibility.
const deps = { truv: fallbackTruv, db, apiLogger };
app.use(ordersRoutes(deps));
app.use(reportsRoutes(deps));
app.use(bridgeRoutes(deps));
app.use(uploadDocumentsRoutes(deps));
app.use(userReportsRoutes(deps));
app.use(coverageAnalysisRoutes(deps));

// --- Health check ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Static files (production) ---
// In production (after `npm run build`), serve the Vite-built frontend from dist/.
// IMPORTANT: The catch-all '*' route must remain the last registered route.
// Any non-/api route added after this block will be shadowed by the SPA fallback.
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');
if (existsSync(join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(distPath, 'index.html'), (err) => { if (err) next(err); });
  });
}

// --- Start ---
// In fallback dev mode, register the legacy shared webhook at startup.
// In BYO mode webhooks are registered per session and there is nothing to do here.
const server = app.listen(PORT, async () => {
  console.log(`Truv Demo Apps running on http://localhost:${PORT}`);
  if (ALLOW_ENV_FALLBACK_CREDS) {
    try { tunnelUrl = await setupWebhook({ path: '/api/webhooks/truv', truvClient: fallbackTruv }); } catch (err) { console.error('Webhook setup failed:', err.message); }
  }
});

// Graceful shutdown: tears down singleton webhook (fallback mode) and any
// per-session webhooks, drains connections, then exits.
async function gracefulShutdown() {
  sweeper.stop();
  const teardowns = [];
  if (fallbackTruv) teardowns.push(teardownWebhook(fallbackTruv));
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
