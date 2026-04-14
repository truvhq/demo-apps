/**
 * FILE SUMMARY: Legacy order-based report fetching with DB caching
 * DATA FLOW: Frontend -> GET /api/orders/:id/report -> DB cache check -> TruvClient -> Truv API (/v1/users/{id}/reports/ etc.) -> DB upsert -> response
 * INTEGRATION PATTERN: Orders flow (used by Application and Follow-up demos)
 *
 * Fetches verification reports for a given order. Reports are created once via POST
 * to Truv, then cached in SQLite. Subsequent requests return the stored response
 * without hitting the Truv API again. Supports multiple product types per order.
 */

// Express router factory
import { Router } from 'express';

// Report configuration map: maps product type keys to their Truv API functions and endpoint paths.
// Each entry provides create (POST) and get (GET) wrappers around TruvClient methods.
const REPORT_CONFIG = {
  // VOIE report (Verification of Income and Employment): is_voe: false
  income: {
    type: 'voie',
    create: (t, uid) => t.createVoieReport(uid, false),
    get: (t, uid, rid) => t.getVoieReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/reports/${rid}/`,
  },
  // VOE report (Verification of Employment only): is_voe: true
  employment: {
    type: 'voe',
    create: (t, uid) => t.createVoieReport(uid, true),
    get: (t, uid, rid) => t.getVoieReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/reports/${rid}/`,
  },
  // VOA report (Verification of Assets)
  assets: {
    type: 'assets',
    create: (t, uid) => t.createAssetsReport(uid),
    get: (t, uid, rid) => t.getAssetsReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/assets/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/assets/reports/${rid}/`,
  },
  // Income Insights report
  income_insights: {
    type: 'income_insights',
    create: (t, uid) => t.createIncomeInsightsReport(uid),
    get: (t, uid, rid) => t.getIncomeInsightsReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/income_insights/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/income_insights/reports/${rid}/`,
  },
};

// Factory function: receives shared dependencies (TruvClient, DB, logger) and returns a configured router
export default function reportsRoutes({ truv, db, apiLogger }) {
  const router = Router();

  // Helper: fetch a single report for an order, using DB cache when available.
  // First checks the DB for an existing report. If not found, POSTs to Truv to create one.
  // If found but the response is missing, GETs the report from Truv to refresh.
  // All results are upserted into the DB for future cache hits.
  async function fetchReport(orderId, userId, configKey) {
    const cfg = REPORT_CONFIG[configKey];
    if (!cfg) return null;
    let row = db.getReport(orderId, cfg.type);

    // No cached report: POST to create. The response contains the full report data.
    if (!row || !row.truv_report_id) {
      const cr = await cfg.create(truv, userId);
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: cfg.postPath(userId), requestBody: cr.requestBody, responseBody: cr.data, statusCode: cr.statusCode, durationMs: cr.durationMs });
      if (cr.statusCode >= 400 || !cr.data?.report_id) return null;
      db.upsertReport({ orderId, reportType: cfg.type, truvReportId: cr.data.report_id, status: 'ready', response: cr.data });
      return cr.data;
    }

    // Already created: return the stored response if available
    const stored = row.response ? JSON.parse(row.response) : null;
    if (stored) return stored;

    // Stored row exists but response is missing: GET from Truv to refresh
    const gr = await cfg.get(truv, userId, row.truv_report_id);
    apiLogger.logApiCall({ userId, method: 'GET', endpoint: cfg.getPath(userId, row.truv_report_id), requestBody: gr.requestBody, responseBody: gr.data, statusCode: gr.statusCode, durationMs: gr.durationMs });
    if (gr.statusCode < 400) {
      db.upsertReport({ orderId, reportType: cfg.type, truvReportId: row.truv_report_id, status: 'ready', response: gr.data });
      return gr.data;
    }
    return null;
  }

  // GET /api/orders/:id/report: Fetch all reports for an order based on its product types.
  // Reads the order from the DB, determines which product types are requested (comma-separated),
  // then fetches each report in parallel using the fetchReport helper.
  // Assets orders also fetch income_insights as a companion report.
  router.get('/api/orders/:id/report', async (req, res) => {
    try {
      const order = db.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const userId = order.user_id;
      const productTypes = (order.product_type || 'income').split(',');
      let voie_report = null, voe_report = null, voa_report = null, income_insights_report = null;

      // Fetch reports in parallel based on the order's product types
      const fetches = [];
      if (productTypes.includes('income')) fetches.push(fetchReport(order.id, userId, 'income').then(r => { voie_report = r; }).catch(e => console.error('Income report error:', e.message)));
      if (productTypes.includes('employment')) fetches.push(fetchReport(order.id, userId, 'employment').then(r => { voe_report = r; }).catch(e => console.error('Employment report error:', e.message)));
      if (productTypes.includes('assets')) {
        fetches.push(fetchReport(order.id, userId, 'assets').then(r => { voa_report = r; }).catch(e => console.error('Assets report error:', e.message)));
        fetches.push(fetchReport(order.id, userId, 'income_insights').then(r => { income_insights_report = r; }).catch(e => console.error('Income insights error:', e.message)));
      }
      await Promise.all(fetches);

      // Return all report data alongside order metadata
      res.json({ order_id: order.id, truv_order_id: order.truv_order_id, user_id: userId, product_type: order.product_type, status: order.status, voie_report, voe_report, voa_report, income_insights_report });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // Export the configured router
  return router;
}
