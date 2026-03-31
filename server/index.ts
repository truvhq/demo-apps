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

declare global {
  namespace Express {
    interface Request {
      rawBody: string;
    }
  }
}

const PORT = process.env.PORT ?? 3000;
const { API_CLIENT_ID, API_SECRET } = process.env;

if (!API_CLIENT_ID || !API_SECRET) {
  console.error('Missing API_CLIENT_ID or API_SECRET in .env');
  process.exit(1);
}

const truv = new TruvClient({ clientId: API_CLIENT_ID, secret: API_SECRET });
db.initDb();

const app = express();
app.use(express.json({ limit: '100mb', verify: (req, _res, buf) => { (req as express.Request).rawBody = buf.toString('utf-8'); } }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));

// --- Company search ---
app.get('/api/companies', async (req, res) => {
  try {
    const query = req.query.q as string | undefined;
    if (!query) return res.json([]);
    const result = await truv.searchCompanies(query, req.query.product_type as string | undefined);
    res.json(result.data.data ?? []);
  } catch (err) { console.error(err); res.json([]); }
});

// --- Webhook receiver ---
let tunnelUrl: string | null = null;

app.post('/api/webhooks/truv', (req, res) => {
  const sigMatch = verifyWebhookSignature(req.rawBody, API_SECRET, req.headers['x-webhook-sign'] as string | undefined);
  if (!sigMatch) { console.warn('Webhook signature mismatch'); return res.status(401).end(); }

  const payload = req.body as Record<string, unknown>;
  console.log(`Webhook: ${payload.event_type} (${payload.status ?? '-'}) user=${payload.user_id ?? '-'}`);

  const userId = (payload.user_id as string | undefined) ?? null;

  if (userId && payload.event_type === 'order-status-updated' && payload.status === 'completed') {
    const order = db.findOrderByUserId(userId);
    if (order) db.updateOrder(order.id, { status: 'completed' });
  }

  apiLogger.pushWebhookEvent({ userId, webhookId: payload.webhook_id as string | undefined, eventType: payload.event_type as string | undefined, status: payload.status as string | undefined, payload });
  res.status(200).end();
});

app.get('/api/tunnel-url', (_req, res) => res.json({ url: tunnelUrl }));

// --- Polling endpoints ---
app.get('/api/users/:userId/webhooks', (req, res) => res.json(db.getWebhookEventsByUserId(req.params.userId ?? '')));
app.get('/api/users/:userId/logs', (req, res) => res.json(db.getApiLogsByUserId(req.params.userId ?? '')));

// --- Demo routes ---
const deps = { truv, db, apiLogger };
app.use(ordersRoutes(deps));
app.use(reportsRoutes(deps));
app.use(bridgeRoutes(deps));
app.use(uploadDocumentsRoutes(deps));

// --- Start ---
app.listen(PORT, async () => {
  console.log(`Truv Quickstart running on http://localhost:${PORT}`);
  try { tunnelUrl = await setupWebhook({ path: '/api/webhooks/truv', truvClient: truv }); } catch (err) { console.error('Webhook setup failed:', (err as Error).message); }
});

process.on('SIGINT', async () => { await teardownWebhook(truv); process.exit(0); });
