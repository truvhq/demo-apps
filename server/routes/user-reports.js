/**
 * FILE SUMMARY: Unified report fetching for all demos via the Truv user reports API
 * DATA FLOW: Frontend -> GET /api/users/:userId/reports/:type -> TruvClient -> Truv API (/v1/users/{id}/reports/ or product-specific endpoint)
 * INTEGRATION PATTERN: Both Orders and Bridge flows converge here. Both produce a user_id, which is all this route needs.
 *
 * Creates a report at Truv (POST), then polls with retry delays until the report
 * is ready (GET). Deposit switch is an exception: it uses a single GET with no
 * create step. This is the primary report-fetching path for the frontend.
 */

// Express router factory
import { Router } from 'express';

// Retry delays for polling the report retrieval endpoint.
// Truv generates reports asynchronously, so the GET may return 404 briefly after the POST.
const REPORT_RETRIEVE_DELAYS_MS = [0, 2000, 4000];

// Report configuration map: each report type defines its create/retrieve functions and endpoint paths.
// This keeps the route handler generic while supporting different Truv API endpoints per product.
const REPORT_CONFIG = {
  // VOIE report (Verification of Income and Employment): is_voe: false
  income: {
    create: (truv, userId) => truv.createVoieReport(userId, false),
    retrieve: (truv, userId, reportId) => truv.getVoieReport(userId, reportId),
    createEndpoint: userId => `/v1/users/${userId}/reports/`,
    retrieveEndpoint: (userId, reportId) => `/v1/users/${userId}/reports/${reportId}/`,
  },
  // VOE report (Verification of Employment only): same endpoint, is_voe: true
  employment: {
    create: (truv, userId) => truv.createVoieReport(userId, true),
    retrieve: (truv, userId, reportId) => truv.getVoieReport(userId, reportId),
    createEndpoint: userId => `/v1/users/${userId}/reports/`,
    retrieveEndpoint: (userId, reportId) => `/v1/users/${userId}/reports/${reportId}/`,
  },
  // VOA report (Verification of Assets)
  assets: {
    create: (truv, userId) => truv.createAssetsReport(userId),
    retrieve: (truv, userId, reportId) => truv.getAssetsReport(userId, reportId),
    createEndpoint: userId => `/v1/users/${userId}/assets/reports/`,
    retrieveEndpoint: (userId, reportId) => `/v1/users/${userId}/assets/reports/${reportId}/`,
  },
  // Income Insights report
  income_insights: {
    create: (truv, userId) => truv.createIncomeInsightsReport(userId),
    retrieve: (truv, userId, reportId) => truv.getIncomeInsightsReport(userId, reportId),
    createEndpoint: userId => `/v1/users/${userId}/income_insights/reports/`,
    retrieveEndpoint: (userId, reportId) => `/v1/users/${userId}/income_insights/reports/${reportId}/`,
  },
  // Deposit Switch: no create step, single GET to retrieve the report
  deposit_switch: {
    create: null,
    retrieve: (truv, userId) => truv.getDepositSwitchReport(userId),
    retrieveEndpoint: userId => `/v1/users/${userId}/deposit_switch/report/`,
  },
};

// Factory function: receives shared dependencies (TruvClient, logger) and returns a configured router
export default function userReportsRoutes({ truv, apiLogger }) {
  const router = Router();

  // GET /api/users/:userId/reports/:reportType: Create and retrieve a verification report.
  // For most report types: POST to create, then GET with retry polling until ready.
  // For deposit_switch: single GET (no create step).
  router.get('/api/users/:userId/reports/:reportType', async (req, res) => {
    try {
      const { userId, reportType } = req.params;
      const cfg = REPORT_CONFIG[reportType];
      if (!cfg) return res.status(400).json({ error: `Unknown report type: ${reportType}` });

      // Deposit switch is a single GET (no create step)
      if (!cfg.create) {
        const result = await cfg.retrieve(truv, userId);
        apiLogger.logApiCall({
          userId,
          method: 'GET',
          endpoint: cfg.retrieveEndpoint(userId),
          responseBody: result.data,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
        });
        if (result.statusCode >= 400) {
          return res.status(result.statusCode).json({ error: 'Failed to fetch report', details: result.data });
        }
        return res.json(result.data);
      }

      // Step 1: POST to create the report at Truv
      const createResult = await cfg.create(truv, userId);
      apiLogger.logApiCall({
        userId,
        method: 'POST',
        endpoint: cfg.createEndpoint(userId),
        requestBody: createResult.requestBody,
        responseBody: createResult.data,
        statusCode: createResult.statusCode,
        durationMs: createResult.durationMs,
      });

      if (createResult.statusCode >= 400) {
        return res.status(createResult.statusCode).json({ error: 'Failed to create report', details: createResult.data });
      }

      const reportId = createResult.data?.report_id;
      if (!reportId) {
        return res.status(500).json({ error: 'No report_id in create response' });
      }

      // Step 2: GET to retrieve the report by report_id.
      // Retry up to 3 times with backoff while the report is being generated.
      let getResult;
      for (let attempt = 0; attempt < REPORT_RETRIEVE_DELAYS_MS.length; attempt++) {
        if (REPORT_RETRIEVE_DELAYS_MS[attempt]) await new Promise(r => setTimeout(r, REPORT_RETRIEVE_DELAYS_MS[attempt]));
        getResult = await cfg.retrieve(truv, userId, reportId);
        apiLogger.logApiCall({
          userId,
          method: 'GET',
          endpoint: cfg.retrieveEndpoint(userId, reportId),
          responseBody: getResult.data,
          statusCode: getResult.statusCode,
          durationMs: getResult.durationMs,
        });
        if (getResult.statusCode < 400) break;
        if (attempt < REPORT_RETRIEVE_DELAYS_MS.length - 1) console.log(`Report ${reportType} not ready (${getResult.statusCode}), retrying...`);
      }

      // Return error if the report was still not ready after all retries
      if (getResult.statusCode >= 400) {
        return res.status(getResult.statusCode).json({ error: 'Failed to retrieve report', details: getResult.data });
      }

      res.json(getResult.data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Export the configured router
  return router;
}
