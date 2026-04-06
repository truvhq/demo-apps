// Routes: Orders (used by Application, Follow-up, Employee Portal demos)
//
// POST /api/orders        — Create a Truv order
// GET  /api/orders        — List orders (optionally filter by demo_id)
// GET  /api/orders/:id    — Get order details (fetches latest from Truv)
// GET  /api/orders/:id/info    — Lightweight order info (DB only)
// POST /api/orders/:id/refresh — Refresh order data

import { Router } from 'express';

function safeParse(str) { try { return JSON.parse(str); } catch { return {}; } }

export default function ordersRoutes({ truv, db, apiLogger }) {
  const router = Router();

  router.get('/api/orders', (req, res) => {
    try {
      const demoId = req.query.demo_id;
      const orders = demoId ? db.getOrdersByDemoId(demoId) : db.getAllOrders();
      res.json(orders.map(o => ({
        order_id: o.id, truv_order_id: o.truv_order_id, user_id: o.user_id, demo_id: o.demo_id,
        status: o.status, share_url: o.share_url, created_at: o.created_at,
        raw_response: safeParse(o.raw_response),
      })));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.post('/api/orders', async (req, res) => {
    try {
      const data = req.body || {};
      const orderId = db.generateId();
      const pt = data.product_type || 'income';
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

      const result = await truv.createOrder(params);
      const truvData = result.data;
      if (result.statusCode >= 400) {
        console.error('Order creation failed:', JSON.stringify({ request: result.requestBody, response: truvData }));
        return res.status(result.statusCode).json({ error: 'Truv API error', details: truvData });
      }

      const userId = truvData.user_id;
      db.createOrder({ orderId, truvOrderId: truvData.id, userId, demoId: data.demo_id || 'default', bridgeToken: truvData.bridge_token, shareUrl: truvData.share_url, status: truvData.status || 'created', rawResponse: truvData });
      db.updateOrder(orderId, { product_type: data.products ? data.products.join(',') : pt });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/orders/', requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });

      res.json({ order_id: orderId, truv_order_id: truvData.id, user_id: userId, bridge_token: truvData.bridge_token, status: truvData.status, company_mapping_id: data.company_mapping_id || null });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // Lightweight — DB only, no Truv API call
  router.get('/api/orders/:id/info', (req, res) => {
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order_id: order.id, truv_order_id: order.truv_order_id, user_id: order.user_id, bridge_token: order.bridge_token, status: order.status, product_type: order.product_type });
  });

  router.get('/api/orders/:id', async (req, res) => {
    try {
      let order = db.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const userId = order.user_id;

      if (order.truv_order_id) {
        const result = await truv.getOrder(order.truv_order_id);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${order.truv_order_id}/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
        if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: result.data });
        db.updateOrder(order.id, { status: result.data.status || order.status, raw_response: result.data });
        order = db.getOrder(order.id);
      }

      const raw = order.raw_response ? JSON.parse(order.raw_response) : {};
      res.json({ order_id: order.id, truv_order_id: order.truv_order_id, user_id: userId, status: order.status, bridge_token: order.bridge_token, share_url: order.share_url, raw_response: raw });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.post('/api/orders/:id/refresh', async (req, res) => {
    try {
      const order = db.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.truv_order_id) return res.status(400).json({ error: 'No Truv order ID' });

      const result = await truv.refreshOrder(order.truv_order_id);
      apiLogger.logApiCall({ userId: order.user_id, method: 'POST', endpoint: `/v1/orders/${order.truv_order_id}/refresh/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
