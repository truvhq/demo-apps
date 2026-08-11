/**
 * FILE SUMMARY: Unauthenticated order creation for a specific pre-approved deployment
 * DATA FLOW: Frontend -> POST /api/auto-order -> TruvClient (fixed creds) -> Truv API (/v1/orders/)
 *
 * Mirrors POST /api/orders, but authorizes via a dedicated server-side
 * credential pair (AUTO_ORDER_CLIENT_ID / AUTO_ORDER_SECRET) instead of a
 * visitor session. Independent of ALLOW_ENV_FALLBACK_CREDS — those env vars
 * only affect this one route, not the rest of the app's per-visitor session
 * model. Exists for demos where the visitor should never see a
 * Configure/paste-credentials step (e.g. an external accessibility reviewer
 * with no Truv account of their own).
 *
 * Inert unless both env vars are set: `truv` is null on every other
 * deployment and the route is never registered.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export default function autoOrderRoutes({ truv, db, apiLogger, rateLimitWindowMs = 600_000, rateLimitMax = 20 }) {
  const router = Router();
  if (!truv) return router;

  // No visitor identity to key off of, so limit by IP. Order creation spends
  // real (sandbox) Truv API quota, so this stays tight.
  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  router.post('/api/auto-order', limiter, async (req, res) => {
    try {
      const data = req.body || {};
      const orderId = db.generateId();
      const pt = data.product_type || 'income';

      // Build the Truv order payload from frontend-supplied fields
      const params = {
        first_name: data.first_name, last_name: data.last_name,
        email: data.email, phone: data.phone, ssn: data.ssn,
        product_type: pt,
        products: data.products,
        external_user_id: data.external_user_id,
        employer: data.employer,
        company_mapping_id: data.company_mapping_id,
        provider_id: data.provider_id,
        data_sources: data.data_sources,
      };

      // Proxy the order creation to Truv API
      const result = await truv.createOrder(params);
      const truvData = result.data;
      if (result.statusCode >= 400) {
        console.error('Auto-order creation failed:', JSON.stringify({ request: result.requestBody, response: truvData }));
        return res.status(result.statusCode).json({ error: 'Truv API error', details: truvData });
      }

      // Persist the order in SQLite and log the API call
      const userId = truvData.user_id;
      db.createOrder({ orderId, truvOrderId: truvData.id, userId, demoId: data.demo_id || 'default', bridgeToken: truvData.bridge_token, shareUrl: truvData.share_url, status: truvData.status || 'created', rawResponse: truvData });
      db.updateOrder(orderId, { product_type: data.products ? data.products.join(',') : pt });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/orders/', requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });

      // Return the minimal order info the frontend needs to proceed
      res.json({ order_id: orderId, truv_order_id: truvData.id, user_id: userId, bridge_token: truvData.bridge_token, status: truvData.status, company_mapping_id: data.company_mapping_id || null });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
