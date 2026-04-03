// Routes: User Reports (unified report fetching for all demos)
//
// GET /api/users/:userId/reports/:reportType
//
// All demos fetch reports through this endpoint. Both Orders and Bridge flows
// produce a user_id, so reports are always fetched via the Truv user reports API:
//
//   income          → POST /v1/users/{id}/reports/ { is_voe: false }
//   employment      → POST /v1/users/{id}/reports/ { is_voe: true }
//   assets          → POST /v1/users/{id}/assets/reports/
//   income_insights → POST /v1/users/{id}/income_insights/reports/
//   deposit_switch  → GET  /v1/users/{id}/deposit-switch/reports/
//
// See: https://docs.truv.com/reference/users_reports

import { Router } from 'express';

const REPORT_CONFIG = {
  income: {
    fetch: (truv, userId) => truv.createVoieReport(userId, false),
    endpoint: userId => `/v1/users/${userId}/reports/`,
    method: 'POST',
  },
  employment: {
    fetch: (truv, userId) => truv.createVoieReport(userId, true),
    endpoint: userId => `/v1/users/${userId}/reports/`,
    method: 'POST',
  },
  assets: {
    fetch: (truv, userId) => truv.createAssetsReport(userId),
    endpoint: userId => `/v1/users/${userId}/assets/reports/`,
    method: 'POST',
  },
  income_insights: {
    fetch: (truv, userId) => truv.createIncomeInsightsReport(userId),
    endpoint: userId => `/v1/users/${userId}/income_insights/reports/`,
    method: 'POST',
  },
  deposit_switch: {
    fetch: (truv, userId) => truv.getDepositSwitchReport(userId),
    endpoint: userId => `/v1/users/${userId}/deposit-switch/reports/`,
    method: 'GET',
  },
};

export default function userReportsRoutes({ truv, apiLogger }) {
  const router = Router();

  router.get('/api/users/:userId/reports/:reportType', async (req, res) => {
    try {
      const { userId, reportType } = req.params;
      const cfg = REPORT_CONFIG[reportType];
      if (!cfg) return res.status(400).json({ error: `Unknown report type: ${reportType}` });

      const result = await cfg.fetch(truv, userId);
      apiLogger.logApiCall({
        userId,
        method: cfg.method,
        endpoint: cfg.endpoint(userId),
        requestBody: result.requestBody,
        responseBody: result.data,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
      });

      if (result.statusCode >= 400) {
        return res.status(result.statusCode).json({ error: 'Failed to fetch report', details: result.data });
      }

      res.json(result.data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
