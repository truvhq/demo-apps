// Routes: Reports (used by Application, Follow-up demos)
//
// GET /api/orders/:id/report — Fetch VOIE/VOE/assets/income-insights reports
//
// Reports are created once (POST) and cached in the DB. Subsequent requests
// return the stored response. Each product type has its own Truv endpoint.

import { Router } from 'express';
import type { TruvClient, TruvApiResponse } from '../truv.js';
import type * as db from '../db.js';
import type * as apiLogger from '../api-logger.js';

interface RouteDeps {
  truv: TruvClient;
  db: typeof db;
  apiLogger: typeof apiLogger;
}

interface ReportConfig {
  type: string;
  create: (t: TruvClient, uid: string) => Promise<TruvApiResponse>;
  get: (t: TruvClient, uid: string, rid: string) => Promise<TruvApiResponse>;
  postPath: (uid: string) => string;
  getPath: (uid: string, rid: string) => string;
}

const REPORT_CONFIG: Record<string, ReportConfig> = {
  income: {
    type: 'voie',
    create: (t, uid) => t.createVoieReport(uid, false),
    get: (t, uid, rid) => t.getVoieReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/reports/${rid}/`,
  },
  employment: {
    type: 'voe',
    create: (t, uid) => t.createVoieReport(uid, true),
    get: (t, uid, rid) => t.getVoieReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/reports/${rid}/`,
  },
  assets: {
    type: 'assets',
    create: (t, uid) => t.createAssetsReport(uid),
    get: (t, uid, rid) => t.getAssetsReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/assets/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/assets/reports/${rid}/`,
  },
  income_insights: {
    type: 'income_insights',
    create: (t, uid) => t.createIncomeInsightsReport(uid),
    get: (t, uid, rid) => t.getIncomeInsightsReport(uid, rid),
    postPath: uid => `/v1/users/${uid}/income_insights/reports/`,
    getPath: (uid, rid) => `/v1/users/${uid}/income_insights/reports/${rid}/`,
  },
};

export default function reportsRoutes({ truv, db, apiLogger }: RouteDeps): Router {
  const router = Router();

  async function fetchReport(orderId: string, userId: string, configKey: string): Promise<unknown> {
    const cfg = REPORT_CONFIG[configKey];
    if (!cfg) return null;
    let row = db.getReport(orderId, cfg.type);

    // POST to create — response contains the full report data
    if (!row?.truv_report_id) {
      const cr = await cfg.create(truv, userId);
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: cfg.postPath(userId), requestBody: cr.requestBody, responseBody: cr.data, statusCode: cr.statusCode, durationMs: cr.durationMs });
      if (cr.statusCode >= 400 || !cr.data.report_id) return null;
      db.upsertReport({ orderId, reportType: cfg.type, truvReportId: cr.data.report_id, status: 'ready', response: cr.data });
      return cr.data;
    }

    // Already created — return stored data or GET to refresh
    const stored = row.response ? JSON.parse(row.response) : null;
    if (stored) return stored;

    const gr = await cfg.get(truv, userId, row.truv_report_id);
    apiLogger.logApiCall({ userId, method: 'GET', endpoint: cfg.getPath(userId, row.truv_report_id), requestBody: gr.requestBody, responseBody: gr.data, statusCode: gr.statusCode, durationMs: gr.durationMs });
    if (gr.statusCode < 400) {
      db.upsertReport({ orderId, reportType: cfg.type, truvReportId: row.truv_report_id, status: 'ready', response: gr.data });
      return gr.data;
    }
    return null;
  }

  router.get('/api/orders/:id/report', async (req, res) => {
    try {
      const order = db.getOrder(req.params.id ?? '');
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const userId = order.user_id ?? '';
      const productTypes = (order.product_type ?? 'income').split(',');
      let voie_report = null, voe_report = null, voa_report = null, income_insights_report = null;

      const fetches: Promise<void>[] = [];
      if (productTypes.includes('income')) fetches.push(fetchReport(order.id, userId, 'income').then(r => { voie_report = r; }).catch(e => console.error('Income report error:', (e as Error).message)));
      if (productTypes.includes('employment')) fetches.push(fetchReport(order.id, userId, 'employment').then(r => { voe_report = r; }).catch(e => console.error('Employment report error:', (e as Error).message)));
      if (productTypes.includes('assets')) {
        fetches.push(fetchReport(order.id, userId, 'assets').then(r => { voa_report = r; }).catch(e => console.error('Assets report error:', (e as Error).message)));
        fetches.push(fetchReport(order.id, userId, 'income_insights').then(r => { income_insights_report = r; }).catch(e => console.error('Income insights error:', (e as Error).message)));
      }
      await Promise.all(fetches);

      res.json({ order_id: order.id, truv_order_id: order.truv_order_id, user_id: userId, product_type: order.product_type, status: order.status, voie_report, voe_report, voa_report, income_insights_report });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
