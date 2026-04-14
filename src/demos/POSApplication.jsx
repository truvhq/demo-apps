// POSApplication.jsx -- Mortgage demo: POS Application
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
import { STEPS, IntroScreen, ReportResults } from './scaffolding/pos-application.jsx';


export function POSApplicationDemo({ screen, param }) {
  const [productType, setProductType] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: productType ? [productType] : [],
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
        body: JSON.stringify({ ...formData, demo_id: 'application' }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      if (data.user_id) setUserId(data.user_id);
      const cmid = formData.company_mapping_id;
      navigate(`mortgage/pos-application/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); alert('Network error. Please try again.'); }
    setSubmitting(false);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && !productType;
  const [orderId, companyMappingId] = (param || '').split('/');

  return (
    <Layout badge="POS Application" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="mortgage/pos-application" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="mortgage/pos-application" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <ReportResults
          reportData={reports}
          reportLoading={reportLoading}
          reportError={reportError}
          productType={productType}
          onBack={() => { reset(); resetReports(); setProductType(null); setUserId(null); navigate('mortgage/pos-application'); }}
          backLabel="New Application"
        />
      )}
      {!screen && (
        productType ? (
          <div class="max-w-lg mx-auto">
            <ApplicationForm sessionId={sessionId} onSubmit={handleSubmit} submitting={submitting} productType={productType} />
          </div>
        ) : (
          <IntroScreen onStart={setProductType} />
        )
      )}
    </Layout>
  );
}
