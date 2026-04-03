// Routes: Bridge (User + Token) flow
//
// POST /api/bridge-token                         — Create user + bridge token
// GET  /api/link-report/:publicToken/:reportType  — Exchange public_token + fetch report
//
// Used by all Consumer Credit and Retail Banking demos.
// This is the alternative to the Orders flow (used by Mortgage demos).
//
// Flow:
//   1. POST /v1/users/                    → create a Truv user
//   2. POST /v1/users/{id}/tokens/        → generate a bridge token
//      - Pass company_mapping_id for payroll employers
//      - Pass provider_id for financial institutions (banks)
//      - Pass data_sources to restrict Bridge options
//   3. Frontend opens Bridge popup with the token
//   4. Bridge calls onSuccess(public_token) when the user completes
//   5. POST /v1/link-access-tokens/       → exchange public_token for link_id
//   6. GET /v1/links/{link_id}/{product}/report → fetch the verification report
//
// See: https://docs.truv.com/reference/users_tokens

import { Router } from 'express';

export default function bridgeRoutes({ truv, apiLogger }) {
  const router = Router();

  router.post('/api/bridge-token', async (req, res) => {
    try {
      const data = req.body || {};
      const pt = data.product_type || 'income';
      const ds = data.data_sources;
      const cmid = data.company_mapping_id;
      const pid = data.provider_id;

      const userResult = await truv.createUser();
      apiLogger.logApiCall({ userId: null, method: 'POST', endpoint: '/v1/users/', requestBody: { product_type: pt }, responseBody: userResult.data, statusCode: userResult.statusCode, durationMs: userResult.durationMs });
      if (userResult.statusCode >= 400 || !userResult.data?.id) return res.status(userResult.statusCode || 500).json({ error: 'Failed to create user', details: userResult.data });

      const userId = userResult.data.id;
      const tokenResult = await truv.createUserBridgeToken(userId, pt, { data_sources: ds, company_mapping_id: cmid, provider_id: pid });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: `/v1/users/${userId}/tokens/`, requestBody: { product_type: pt, data_sources: ds, company_mapping_id: cmid, provider_id: pid }, responseBody: tokenResult.data, statusCode: tokenResult.statusCode, durationMs: tokenResult.durationMs });
      if (tokenResult.statusCode >= 400 || !tokenResult.data?.bridge_token) return res.status(tokenResult.statusCode || 500).json({ error: 'Failed to create bridge token', details: tokenResult.data });

      res.json({ bridge_token: tokenResult.data.bridge_token, user_id: userId });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/api/link-report/:publicToken/:reportType', async (req, res) => {
    try {
      const { publicToken, reportType } = req.params;
      const userId = req.query.user_id || null;

      const accessResult = await truv.getAccessToken(publicToken);
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/link-access-tokens/', requestBody: { public_token: publicToken }, responseBody: accessResult.data, statusCode: accessResult.statusCode, durationMs: accessResult.durationMs });
      if (accessResult.statusCode >= 400 || !accessResult.data?.link_id) return res.status(accessResult.statusCode || 500).json({ error: 'Failed to exchange token', details: accessResult.data });

      const linkId = accessResult.data.link_id;
      const reportResult = await truv.getLinkReport(linkId, reportType);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/${reportType}/report`, responseBody: reportResult.data, statusCode: reportResult.statusCode, durationMs: reportResult.durationMs });
      if (reportResult.statusCode >= 400) return res.status(reportResult.statusCode).json({ error: 'Failed to fetch report', details: reportResult.data });

      res.json(reportResult.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
