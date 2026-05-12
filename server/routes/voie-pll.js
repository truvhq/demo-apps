/**
 * FILE SUMMARY: VOIE -> PLL chained-order routes (Income + Paycheck-Linked Loans)
 * DATA FLOW: Frontend -> POST/GET /api/voie-pll/* -> TruvClient -> Truv API
 * INTEGRATION PATTERN: Orders flow with two linked orders sharing order_number
 *
 * Walks the borrower through the chained Income → PLL flow:
 *   1. Pre-check coverage          GET /api/voie-pll/coverage/:cmid
 *   2. Create VOIE order           POST /api/voie-pll/voie-order
 *   3. Inspect bank_accounts +
 *      is_dds_supported            GET /api/voie-pll/decision/:voieOrderId
 *   4. Create linked PLL order     POST /api/voie-pll/pll-order/:voieOrderId
 *   5. Read PLL report             GET /api/voie-pll/pll-report/:pllOrderId
 *   (debug) List user tasks        GET /api/voie-pll/tasks/:userId
 *
 * The VOIE and PLL orders share order_number + company_mapping_id so the
 * borrower's payroll auth from step 2 carries forward to step 4 — they confirm
 * the deposit allocation without re-authenticating. The four decision gates
 * (coverage, percent allocations, max_number, is_dds_supported) catch
 * unsupported combinations up front so borrowers aren't stranded mid-flow.
 */

// Express router factory
import { Router } from 'express';

// uuid for generating stable shared order_numbers / external user IDs
import { v4 as uuidv4 } from 'uuid';

// Demo identifier persisted on each order so they can be cross-referenced later
const PLL_DEMO_ID = 'consumer-credit-income-pll';

// Sandbox destination + allocation used for the PLL order. Replace in production.
const SANDBOX_PLL_ACCOUNT = {
  bank_name: 'Truv Bank',
  action: 'create',
  account_number: '420024441',
  account_type: 'savings',
  routing_number: '42345621134',
  deposit_type: 'amount',
  deposit_value: '150.00',
};

// Utility: safely parse JSON strings from the DB without throwing
function safeParse(str) { try { return JSON.parse(str); } catch { return {}; } }

// Decision-gate helpers. Each maps an upstream Truv field to a proceed/manual signal
// with a stable reason code so the frontend can surface why a borrower was routed.
function evaluateCoverage(coverage) {
  if (coverage === 'high' || coverage === 'medium') return { proceed: true, reason: 'good_coverage' };
  // null = Truv has no data on this combination yet, not a definitive "no". Proceed.
  if (coverage == null) return { proceed: true, reason: 'coverage_unknown' };
  return { proceed: false, reason: `coverage_${coverage}` };
}
function evaluateBankAccounts(bankAccounts, maxNumber) {
  const accounts = bankAccounts || [];
  // Truv emits both the long form ("percent"/"amount") and short codes ("P"/"A").
  // Treat anything starting with P as percent — covers "P", "PT", "percent".
  const isPercent = (dt) => typeof dt === 'string' && dt.toUpperCase().startsWith('P');
  if (accounts.some(a => isPercent(a?.deposit_type))) return { proceed: false, reason: 'percent_allocation' };
  if (typeof maxNumber === 'number' && accounts.length >= maxNumber) return { proceed: false, reason: 'over_max_allocations' };
  return { proceed: true, reason: 'allocations_ok' };
}
function evaluateDdsSupport(isDdsSupported) {
  if (isDdsSupported === false) return { proceed: false, reason: 'dds_unsupported' };
  return { proceed: true, reason: isDdsSupported === true ? 'dds_supported' : 'dds_unknown' };
}

// Factory function: receives shared dependencies and returns a configured router
export default function voiePllRoutes({ truv, db, apiLogger }) {
  const router = Router();

  // GET /api/voie-pll/coverage/:cmid: First decision gate.
  // Frontend -> GET /v1/companies/{cmid}?product_type=pll -> { coverage, max_number }.
  // If coverage is low/unsupported/null, the borrower should be routed to manual.
  router.get('/api/voie-pll/coverage/:cmid', async (req, res) => {
    try {
      const { cmid } = req.params;
      const sessionId = req.query.session_id || null;
      const result = await truv.getCompanyInfo(cmid, 'pll');
      apiLogger.logApiCall({ sessionId, method: 'GET', endpoint: `/v1/companies/${cmid}?product_type=pll`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to fetch coverage', details: result.data });

      const coverage = result.data?.coverage ?? null;
      const maxNumber = result.data?.features?.deposit_switch?.max_number ?? null;
      res.json({
        company_mapping_id: cmid,
        name: result.data?.name || null,
        coverage,
        max_number: maxNumber,
        decision: evaluateCoverage(coverage),
        raw: result.data,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // POST /api/voie-pll/voie-order: Step 2 — creates the VOIE (income) order.
  // The order_number generated here is the linkage between this order and the
  // PLL order that will follow. Persisted in SQLite alongside the bridge_token.
  router.post('/api/voie-pll/voie-order', async (req, res) => {
    try {
      const { first_name, last_name, company_mapping_id } = req.body || {};
      // company_mapping_id is optional — when missing, Bridge prompts the borrower
      // to search for and pick their employer themselves.

      // Stable shared identifiers — use your loan/application ID in production.
      const orderNumber = `qs-pll-${uuidv4().slice(0, 12)}`;
      const externalUserId = `qs-${uuidv4()}`;
      const orderId = db.generateId();

      const result = await truv.createVoiePllVoieOrder({
        orderNumber,
        externalUserId,
        firstName: first_name || 'ExampleUser',
        lastName: last_name || 'NewUser',
        companyMappingId: company_mapping_id,
      });
      const truvData = result.data;
      const userId = truvData?.user_id || null;
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/orders/', requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to create VOIE order', details: truvData });

      // Truv's order response omits company_mapping_id from employers[]. Inject it
      // back from the request so the PLL step can read it from the stored response
      // and reuse the exact cmid for the linked order.
      if (company_mapping_id && Array.isArray(truvData?.employers) && truvData.employers[0]) {
        truvData.employers[0].company_mapping_id = company_mapping_id;
      }

      db.createOrder({
        orderId, truvOrderId: truvData.id, userId,
        demoId: PLL_DEMO_ID,
        bridgeToken: truvData.bridge_token, shareUrl: truvData.share_url,
        status: truvData.status || 'created', rawResponse: truvData,
      });
      db.updateOrder(orderId, { product_type: 'income_pll_voie' });

      res.json({
        order_id: orderId,
        truv_order_id: truvData.id,
        user_id: userId,
        bridge_token: truvData.bridge_token,
        share_url: truvData.share_url,
        order_number: orderNumber,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/voie-pll/decision/:voieOrderId: Decision gates 2, 3, 4.
  // Reads the order's bank_accounts (allocation type + count), re-fetches coverage
  // for max_number, and reads the link's is_dds_supported. Combines them into a
  // single proceed/manual verdict with reason codes for the frontend to display.
  router.get('/api/voie-pll/decision/:voieOrderId', async (req, res) => {
    try {
      const order = db.getOrder(req.params.voieOrderId);
      if (!order || !order.truv_order_id) return res.status(404).json({ error: 'VOIE order not found' });
      const userId = order.user_id;

      // Step 4 of postman flow: read bank_accounts to check for percent allocations.
      const orderResult = await truv.getOrder(order.truv_order_id);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${order.truv_order_id}/`, responseBody: orderResult.data, statusCode: orderResult.statusCode, durationMs: orderResult.durationMs });
      if (orderResult.statusCode >= 400) return res.status(orderResult.statusCode).json({ error: 'Failed to fetch order', details: orderResult.data });

      // Truv puts bank_accounts under employers[].employments[].bank_accounts for
      // the income product. Scan every plausible location so a response-shape
      // change doesn't strand the flow.
      const employers = orderResult.data?.employers || [];
      const employer = employers[0] || {};
      let bankAccounts = [];
      let linkId = null;
      for (const e of employers) {
        if (!linkId && e?.link_id) linkId = e.link_id;
        if (!bankAccounts.length && Array.isArray(e?.bank_accounts) && e.bank_accounts.length) {
          bankAccounts = e.bank_accounts;
        }
        for (const em of (e?.employments || [])) {
          if (!bankAccounts.length && Array.isArray(em?.bank_accounts) && em.bank_accounts.length) {
            bankAccounts = em.bank_accounts;
          }
        }
        for (const t of (e?.tasks || [])) {
          if (!bankAccounts.length && Array.isArray(t?.bank_accounts) && t.bank_accounts.length) {
            bankAccounts = t.bank_accounts;
          }
        }
      }
      if (!bankAccounts.length && Array.isArray(orderResult.data?.bank_accounts)) {
        bankAccounts = orderResult.data.bank_accounts;
      }
      const orderNumber = orderResult.data?.order_number || safeParse(order.raw_response)?.order_number;
      const companyMappingId = employer.company_mapping_id || safeParse(order.raw_response)?.employers?.[0]?.company_mapping_id || null;

      // Re-fetch coverage so we have max_number for the bank-accounts check.
      let maxNumber = null;
      let coverage = null;
      if (companyMappingId) {
        const covResult = await truv.getCompanyInfo(companyMappingId, 'pll');
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/companies/${companyMappingId}?product_type=pll`, responseBody: covResult.data, statusCode: covResult.statusCode, durationMs: covResult.durationMs });
        if (covResult.statusCode < 400) {
          coverage = covResult.data?.coverage ?? null;
          maxNumber = covResult.data?.features?.deposit_switch?.max_number ?? null;
        }
      }

      // Step 5 of postman flow: Truv's DDS verdict for this combo.
      // The link endpoint returns this as `is_dds_available`; older docs called it
      // `is_dds_supported` — accept either to be safe.
      let isDdsSupported = null;
      let linkInfoData = null;
      if (linkId) {
        const linkResult = await truv.getLinkInfo(linkId);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/`, responseBody: linkResult.data, statusCode: linkResult.statusCode, durationMs: linkResult.durationMs });
        if (linkResult.statusCode < 400) {
          linkInfoData = linkResult.data;
          isDdsSupported = linkResult.data?.is_dds_available ?? linkResult.data?.is_dds_supported ?? null;
        }
      }

      // Truv strips company_mapping_id from order.employers[] but the link endpoint
      // returns it nested under company_mapping. Last-chance fallback so the PLL
      // step can reuse the borrower's exact cmid.
      const cmidFromLink = linkInfoData?.company_mapping?.id || null;
      const resolvedCmid = companyMappingId || cmidFromLink;

      const accountDecision = evaluateBankAccounts(bankAccounts, maxNumber);
      const ddsDecision = evaluateDdsSupport(isDdsSupported);
      const proceed = accountDecision.proceed && ddsDecision.proceed;

      res.json({
        order_id: order.id,
        truv_order_id: order.truv_order_id,
        user_id: userId,
        order_number: orderNumber,
        company_mapping_id: resolvedCmid,
        link_id: linkId,
        bank_accounts: bankAccounts,
        coverage,
        max_number: maxNumber,
        is_dds_supported: isDdsSupported,
        decision: { proceed, reasons: [accountDecision.reason, ddsDecision.reason] },
        link_info: linkInfoData,
        // Raw upstream payloads for debugging when fields don't render as expected.
        _raw: { order: orderResult.data, link_info: linkInfoData },
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // POST /api/voie-pll/pll-order/:voieOrderId: Step 6 — creates the linked PLL order.
  // Pulls order_number + company_mapping_id from the VOIE order's stored response so
  // both orders share them exactly. Mismatch on either field is the #1 reason
  // borrowers get re-auth prompts in production.
  router.post('/api/voie-pll/pll-order/:voieOrderId', async (req, res) => {
    try {
      const voieOrder = db.getOrder(req.params.voieOrderId);
      if (!voieOrder || !voieOrder.truv_order_id) return res.status(404).json({ error: 'VOIE order not found' });

      const voieRaw = safeParse(voieOrder.raw_response);
      const orderNumber = voieRaw.order_number;
      // Resolve cmid: prefer the original create payload, then the request body
      // (frontend passes it from decision data), then the live order state — the
      // borrower may have picked the employer in Bridge after VOIE was created.
      let companyMappingId = voieRaw.employers?.[0]?.company_mapping_id || req.body?.company_mapping_id || null;
      if (!companyMappingId && voieOrder.truv_order_id) {
        const liveResult = await truv.getOrder(voieOrder.truv_order_id);
        apiLogger.logApiCall({ userId: voieOrder.user_id, method: 'GET', endpoint: `/v1/orders/${voieOrder.truv_order_id}/`, responseBody: liveResult.data, statusCode: liveResult.statusCode, durationMs: liveResult.durationMs });
        companyMappingId = liveResult.data?.employers?.[0]?.company_mapping_id || null;
      }
      if (!orderNumber || !companyMappingId) return res.status(400).json({ error: 'Missing order_number or company_mapping_id from VOIE order' });

      const externalUserId = voieRaw.external_user_id || `qs-${uuidv4()}`;
      const account = req.body?.account || SANDBOX_PLL_ACCOUNT;
      const orderId = db.generateId();
      const userId = voieOrder.user_id;

      const result = await truv.createVoiePllPllOrder({
        orderNumber, externalUserId,
        firstName: voieRaw.first_name || 'ExampleUser',
        lastName: voieRaw.last_name || 'NewUser',
        companyMappingId,
        account,
      });
      const truvData = result.data;
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/orders/', requestBody: result.requestBody, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to create PLL order', details: truvData });

      db.createOrder({
        orderId, truvOrderId: truvData.id, userId: truvData.user_id || userId,
        demoId: PLL_DEMO_ID,
        bridgeToken: truvData.bridge_token, shareUrl: truvData.share_url,
        status: truvData.status || 'created', rawResponse: truvData,
      });
      db.updateOrder(orderId, { product_type: 'income_pll_pll' });

      res.json({
        order_id: orderId,
        truv_order_id: truvData.id,
        user_id: truvData.user_id || userId,
        bridge_token: truvData.bridge_token,
        share_url: truvData.share_url,
        order_number: orderNumber,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/voie-pll/pll-report/:pllOrderId: Step 9 — reads the PLL deposit-switch
  // result. Returns tasks too so the frontend can surface error_message strings
  // when the order didn't reach status=done.
  router.get('/api/voie-pll/pll-report/:pllOrderId', async (req, res) => {
    try {
      const pllOrder = db.getOrder(req.params.pllOrderId);
      if (!pllOrder || !pllOrder.truv_order_id) return res.status(404).json({ error: 'PLL order not found' });
      const userId = pllOrder.user_id;

      const orderResult = await truv.getOrder(pllOrder.truv_order_id);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/orders/${pllOrder.truv_order_id}/`, responseBody: orderResult.data, statusCode: orderResult.statusCode, durationMs: orderResult.durationMs });
      if (orderResult.statusCode >= 400) return res.status(orderResult.statusCode).json({ error: 'Failed to fetch PLL order', details: orderResult.data });

      const employer = orderResult.data?.employers?.[0] || {};
      const linkId = employer.link_id;
      const tasks = employer.tasks || [];

      let report = null;
      if (linkId) {
        const reportResult = await truv.getPllReport(linkId);
        apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/links/${linkId}/pll/report/`, responseBody: reportResult.data, statusCode: reportResult.statusCode, durationMs: reportResult.durationMs });
        if (reportResult.statusCode < 400) report = reportResult.data;
      }

      res.json({
        order_id: pllOrder.id,
        truv_order_id: pllOrder.truv_order_id,
        user_id: userId,
        link_id: linkId || null,
        tasks,
        status: orderResult.data?.status || pllOrder.status,
        pll_report: report,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/voie-pll/tasks/:userId: Diagnostic endpoint for failed PLL orders.
  // Each task's error_message contains the literal provider error which usually
  // tells you whether to retry, send to manual, or escalate.
  router.get('/api/voie-pll/tasks/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await truv.getUserTasks(userId);
      apiLogger.logApiCall({ userId, method: 'GET', endpoint: `/v1/tasks/?user_id=${userId}`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Failed to fetch tasks', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
