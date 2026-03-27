import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { TruvClient } from './truv.js';
import * as db from './db.js';
import * as apiLogger from './api-logger.js';
import { verifyWebhookSignature } from './webhooks.js';
import { setupWebhook, teardownWebhook } from './webhook-setup.js';
import ordersRoutes from './routes/orders.js';
import reportsRoutes from './routes/reports.js';
import bridgeRoutes from './routes/bridge.js';
import uploadDocumentsRoutes from './routes/upload-documents.js';

const PORT = process.env.PORT || 3000;
const { API_CLIENT_ID, API_SECRET } = process.env;

if (!API_CLIENT_ID || !API_SECRET) {
  console.error('Missing API_CLIENT_ID or API_SECRET in .env');
  process.exit(1);
}

const truv = new TruvClient({ clientId: API_CLIENT_ID, secret: API_SECRET });
db.initDb();

const app = express();
app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf-8'); } }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));

// --- Company search ---
app.get('/api/companies', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json([]);
    const result = await truv.searchCompanies(query, req.query.product_type);
    res.json(result.data || []);
  } catch (err) { console.error(err); res.json([]); }
});

// --- Webhook receiver ---
let tunnelUrl = null;

app.post('/api/webhooks/truv', (req, res) => {
  const sigMatch = verifyWebhookSignature(req.rawBody, API_SECRET, req.headers['x-webhook-sign']);
  if (!sigMatch) { console.warn('Webhook signature mismatch'); return res.status(401).end(); }
  console.log(`Webhook: ${req.body.event_type} (${req.body.status || '-'}) user=${req.body.user_id || '-'}`);

  const payload = req.body;
  const userId = payload.user_id || null;

  if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
    const order = db.findOrderByUserId(userId);
    if (order) db.updateOrder(order.id, { status: 'completed' });
  }

  apiLogger.pushWebhookEvent({ userId, webhookId: payload.webhook_id, eventType: payload.event_type, status: payload.status, payload });
  res.status(200).end();
});

app.get('/api/tunnel-url', (_req, res) => res.json({ url: tunnelUrl }));

// --- Polling endpoints ---
app.get('/api/users/:userId/webhooks', (req, res) => res.json(db.getWebhookEventsByUserId(req.params.userId)));
app.get('/api/users/:userId/logs', (req, res) => res.json(db.getApiLogsByUserId(req.params.userId)));

// --- Demo routes ---
const deps = { truv, db, apiLogger };
app.use(ordersRoutes(deps));
app.use(reportsRoutes(deps));
app.use(bridgeRoutes(deps));
app.use(uploadDocumentsRoutes(deps));

// --- Start ---
app.listen(PORT, async () => {
  console.log(`Truv Quickstart running on http://localhost:${PORT}`);
  try { tunnelUrl = await setupWebhook({ path: '/api/webhooks/truv', truvClient: truv }); } catch (err) { console.error('Webhook setup failed:', err.message); }
});

process.on('SIGINT', async () => { await teardownWebhook(truv); process.exit(0); });
