// CustomerPortal.jsx -- Public Sector demo: Customer Portal
//
// Same Orders API flow as POSApplication.jsx but with government-specific
// labels (applicant, agency) and product types.
//
// SCREEN FLOW (URL-driven via `screen` prop):
//   ''        -> Intro slide with product picker (income, employment, assets)
//   'bridge'  -> Bridge widget (order-based, inline)
//   'waiting' -> Webhook waiting spinner
//   'results' -> Verification report
//
// API FLOW:
//   1. POST /api/orders        -> create order with PII + products
//   2. Bridge opened with order_id (deeplinked via company_mapping_id)
//   3. Wait for order-status-updated webhook with status "completed"
//   4. POST /api/users/:userId/reports/ -> GET /api/users/:userId/reports/:report_id

import { useState, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, useReportFetch } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';
import { STEPS, CP_PRODUCTS, CPIntroScreen, CPReportResults } from './scaffolding/customer-portal.jsx';


export function CustomerPortalDemo({ screen, param }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  const products = selectedProduct ? (CP_PRODUCTS.find(p => p.id === selectedProduct)?.products || [selectedProduct]) : [];
  const productType = products[0] || null;

  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products,
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  async function handleSubmit(formData) {
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, products, demo_id: 'customer-portal' }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      if (data.user_id) setUserId(data.user_id);
      const cmid = formData.company_mapping_id;
      navigate(`public-sector/customer-portal/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); alert('Network error. Please try again.'); }
    setSubmitting(false);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && !selectedProduct;
  const [orderId, companyMappingId] = (param || '').split('/');

  return (
    <Layout badge="Public Sector · Customer Portal" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="public-sector/customer-portal" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="public-sector/customer-portal" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <CPReportResults
          reportData={reports}
          reportLoading={reportLoading}
          reportError={reportError}
          productType={selectedProduct}
          onBack={() => { reset(); resetReports(); setSelectedProduct(null); setUserId(null); navigate('public-sector/customer-portal'); }}
          backLabel="Customer Portal"
        />
      )}
      {!screen && (
        selectedProduct ? (
          <div class="max-w-lg mx-auto">
            <ApplicationForm sessionId={sessionId} onSubmit={handleSubmit} submitting={submitting} productType={productType} />
          </div>
        ) : (
          <CPIntroScreen onStart={setSelectedProduct} />
        )
      )}
    </Layout>
  );
}
