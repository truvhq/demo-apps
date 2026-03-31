// Routes: Choice Connect demo
//
// POST /api/bridge-token                        — Create user + bridge token
// GET  /api/link-report/:publicToken/:reportType — Exchange token + get report
//
// Choice Connect uses the User + Bridge Token flow (not Orders).
// 1. Create a Truv user
// 2. Generate a bridge token for that user
// 3. After Bridge completes, exchange the public_token for a link report

import { Router } from 'express';
import type { TruvClient } from '../truv.js';
import type * as apiLogger from '../api-logger.js';

interface RouteDeps {
  truv: TruvClient;
  apiLogger: typeof apiLogger;
}

export default function choiceConnectRoutes({ truv, apiLogger }: RouteDeps): Router {
  const router = Router();

  router.post('/api/bridge-token', async (req, res) => {
    try {
      const data = (req.body ?? {}) as Record<string, unknown>;
      const pt = (data.product_type as string | undefined) ?? 'income';

      const userResult = await truv.createUser();
      apiLogger.logApiCall({ userId: null, method: 'POST', endpoint: '/v1/users/', requestBody: { product_type: pt }, responseBody: userResult.data, statusCode: userResult.statusCode, durationMs: userResult.durationMs });
      if (userResult.statusCode >= 400 || !userResult.data.id) return res.status(userResult.statusCode || 500).json({ error: 'Failed to create user', details: userResult.data });

      const userId = userResult.data.id;
      const tokenResult = await truv.createUserBridgeToken(userId, pt);
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: `/v1/users/${userId}/tokens/`, requestBody: { product_type: pt }, responseBody: tokenResult.data, statusCode: tokenResult.statusCode, durationMs: tokenResult.durationMs });
      if (tokenResult.statusCode >= 400 || !tokenResult.data.bridge_token) return res.status(tokenResult.statusCode || 500).json({ error: 'Failed to create bridge token', details: tokenResult.data });

      res.json({ bridge_token: tokenResult.data.bridge_token, user_id: userId });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/api/link-report/:publicToken/:reportType', async (req, res) => {
    try {
      const { publicToken, reportType } = req.params;
      const userId = (req.query.user_id as string | undefined) ?? null;

      const accessResult = await truv.getAccessToken(publicToken ?? '');
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/link-access-tokens/', requestBody: { public_token: publicToken }, responseBody: accessResult.data, statusCode: accessResult.statusCode, durationMs: accessResult.durationMs });
      if (accessResult.statusCode >= 400 || !accessResult.data.link_id) return res.status(accessResult.statusCode || 500).json({ error: 'Failed to exchange token', details: accessResult.data });

      const linkId = accessResult.data.link_id;
      const reportResult = await truv.getLinkReport(linkId, reportType ?? '');
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/${reportType}/report`, responseBody: reportResult.data, statusCode: reportResult.statusCode, durationMs: reportResult.durationMs });
      if (reportResult.statusCode >= 400) return res.status(reportResult.statusCode).json({ error: 'Failed to fetch report', details: reportResult.data });

      res.json(reportResult.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
