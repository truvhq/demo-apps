// Routes: Smart Routing
//
// GET /api/smart-route?q=<employer>&product_type=income
//
// Calls company_search and returns a routing recommendation based on
// whether payroll coverage is available for the given employer.

import { Router } from 'express';

// Illustrative thresholds for the demo
const CONFIDENCE_HIGH = 0.7;

export default function smartRouteRoutes({ truv, apiLogger }) {
  const router = Router();

  router.get('/api/smart-route', async (req, res) => {
    try {
      const query = req.query.q;
      const productType = req.query.product_type || 'income';

      if (!query) {
        return res.json({ recommendation: 'documents', confidence: 0, company: null });
      }

      const result = await truv.searchCompanies(query, productType);
      const userId = req.query.user_id || null;
      apiLogger.logApiCall({
        userId,
        method: 'GET',
        endpoint: `/v1/company-mappings-search/?query=${encodeURIComponent(query)}&product_type=${productType}`,
        responseBody: result.data,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
      });

      const companies = Array.isArray(result.data) ? result.data : [];
      if (companies.length === 0) {
        return res.json({ recommendation: 'documents', confidence: 0, company: null });
      }

      // Use the top result — if it exists and has a mapping ID, payroll is likely supported
      const top = companies[0];
      const hasMapping = !!top.company_mapping_id;
      const confidence = hasMapping ? Math.min(1, 0.5 + companies.length * 0.1) : 0.2;

      let recommendation;
      if (confidence >= CONFIDENCE_HIGH) {
        recommendation = 'payroll';
      } else if (confidence > 0) {
        recommendation = 'bank';
      } else {
        recommendation = 'documents';
      }

      res.json({
        recommendation,
        confidence: Math.round(confidence * 100) / 100,
        company: {
          name: top.name,
          company_mapping_id: top.company_mapping_id || null,
        },
      });
    } catch (err) {
      console.error('Smart route error:', err);
      res.json({ recommendation: 'documents', confidence: 0, company: null });
    }
  });

  return router;
}
