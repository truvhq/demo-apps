/**
 * FILE SUMMARY: Bridge token creation and link-scoped report routes
 * DATA FLOW: Frontend -> POST /api/bridge-token -> TruvClient -> Truv API (/v1/users/, /v1/users/{id}/tokens/)
 *            Frontend -> GET /api/link-report -> TruvClient -> Truv API (/v1/link-access-tokens/, /v1/links/{id}/{type}/report/)
 *            Frontend -> GET /api/links/:linkId/:reportType -> TruvClient -> Truv API (/v1/links/{id}/{type}/report/)
 * INTEGRATION PATTERN: Bridge flow (used by Consumer Credit and Retail Banking demos)
 *
 * This is the alternative to the Orders flow. The frontend requests a bridge token,
 * opens the Bridge popup, and after the user completes verification, exchanges the
 * resulting public_token for a link_id to fetch the verification report.
 */

// Express router factory
import { Router } from 'express';

// Factory function: receives shared dependencies (TruvClient, logger) and returns a configured router.
// Note: Bridge flow does not use the DB module because there is no persistent order to track.
export default function bridgeRoutes({ truv, apiLogger }) {
  const router = Router();

  // POST /api/bridge-token: Create a Truv user and generate a bridge token for the frontend.
  // Flow: POST /v1/users/ (create user) -> POST /v1/users/{id}/tokens/ (get bridge token) -> return both to frontend.
  // The bridge token is what the frontend passes to TruvBridge.init() to open the verification popup.
  router.post('/api/bridge-token', async (req, res) => {
    try {
      const data = req.body || {};
      const pt = data.product_type || 'income';
      const ds = data.data_sources;
      const cmid = data.company_mapping_id;
      const pid = data.provider_id;

      // Step 1: Create a Truv user (forward name fields from the form if provided)
      const userResult = await truv.createUser({
        ...(data.first_name && { first_name: data.first_name }),
        ...(data.last_name && { last_name: data.last_name }),
      });
      const userId = userResult.data?.id || null;
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/users/', requestBody: { product_type: pt }, responseBody: userResult.data, statusCode: userResult.statusCode, durationMs: userResult.durationMs });
      if (userResult.statusCode >= 400 || !userId) return res.status(userResult.statusCode || 500).json({ error: 'Failed to create user', details: userResult.data });

      // Step 2: Generate a bridge token for that user, passing product type and optional filters
      const tokenResult = await truv.createUserBridgeToken(userId, pt, { data_sources: ds, company_mapping_id: cmid, provider_id: pid });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: `/v1/users/${userId}/tokens/`, requestBody: { product_type: pt, data_sources: ds, company_mapping_id: cmid, provider_id: pid }, responseBody: tokenResult.data, statusCode: tokenResult.statusCode, durationMs: tokenResult.durationMs });
      if (tokenResult.statusCode >= 400 || !tokenResult.data?.bridge_token) return res.status(tokenResult.statusCode || 500).json({ error: 'Failed to create bridge token', details: tokenResult.data });

      // Return the bridge token and user_id so the frontend can open Bridge and later fetch reports
      res.json({ bridge_token: tokenResult.data.bridge_token, user_id: userId });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/link-report/:publicToken/:reportType: Exchange a public_token for a link_id, then fetch the report.
  // Flow: POST /v1/link-access-tokens/ (exchange token) -> GET /v1/links/{link_id}/{reportType}/report/ -> return report data.
  // Called by the frontend after Bridge's onSuccess callback provides the public_token.
  router.get('/api/link-report/:publicToken/:reportType', async (req, res) => {
    try {
      const { publicToken, reportType } = req.params;
      const userId = req.query.user_id || null;

      // Step 1: Exchange the public_token for a link_id via Truv's link-access-tokens endpoint
      const accessResult = await truv.getAccessToken(publicToken);
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/link-access-tokens/', requestBody: { public_token: publicToken }, responseBody: accessResult.data, statusCode: accessResult.statusCode, durationMs: accessResult.durationMs });
      if (accessResult.statusCode >= 400 || !accessResult.data?.link_id) return res.status(accessResult.statusCode || 500).json({ error: 'Failed to exchange token', details: accessResult.data });

      // Step 2: Fetch the verification report using the link_id and requested report type
      const linkId = accessResult.data.link_id;
      const reportResult = await truv.getLinkReport(linkId, reportType);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/${reportType}/report/`, responseBody: reportResult.data, statusCode: reportResult.statusCode, durationMs: reportResult.durationMs });
      if (reportResult.statusCode >= 400) return res.status(reportResult.statusCode).json({ error: 'Failed to fetch report', details: reportResult.data });

      res.json(reportResult.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/links/:linkId/:reportType: Fetch a link-scoped report.
  // The link_id is provided by the task-status-updated webhook after Bridge completes.
  // Used by demos that fetch reports per-link instead of per-user (PLL, docupload).
  // Whitelist is intentionally narrow — extend it only when a demo needs another type
  // and the corresponding /v1/links/{link_id}/{type}/report/ endpoint is verified.
  const ALLOWED_LINK_REPORT_TYPES = new Set(['income', 'pll']);
  router.get('/api/links/:linkId/:reportType', async (req, res) => {
    try {
      const { linkId, reportType } = req.params;
      if (!ALLOWED_LINK_REPORT_TYPES.has(reportType)) {
        return res.status(400).json({ error: `Unsupported link report type: ${reportType}` });
      }
      const userId = req.query.user_id || null;
      const result = await truv.getLinkReport(linkId, reportType);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/${reportType}/report/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to fetch link report', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // Export the configured router
  return router;
}
