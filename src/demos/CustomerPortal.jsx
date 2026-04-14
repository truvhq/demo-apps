// CustomerPortal.jsx -- Public Sector demo: Customer Portal
//
// Same Orders API flow as Application.jsx but with government-specific
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
import { Layout, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { navigate } from '../App.jsx';
import { CP_DIAGRAMS } from '../diagrams/customer-portal.js';

const STEPS = [
  {
    title: 'Applicant submits information',
    guide: '<p>The form collects applicant PII and employer/institution. Employers are searched via:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=...</pre>'
      + '<p>For financial institutions (banks):</p>'
      + '<pre>GET /v1/providers/?search=...</pre>'
      + '<p>Then an order is created:</p><pre>POST /v1/orders/</pre>'
      + '<p><a href="https://docs.truv.com/reference/company_autocomplete_search" target="_blank">Company Search</a> · <a href="https://docs.truv.com/reference/providers-list" target="_blank">Providers</a> · <a href="https://docs.truv.com/reference/orders_create" target="_blank">Orders</a></p>',
  },
  { title: 'Applicant completes verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/truv-bridge" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Agency processes results', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>' },
  { title: 'Agency reviews report', guide: '<p>Fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre><p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API →</a></p>' },
];


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

function CPReportResults({ reportData, reportLoading, reportError, productType, onBack, backLabel = 'Back', maxWidth = 'max-w-lg' }) {
  if (reportError) return <div class={`${maxWidth} mx-auto text-center py-16 text-red-600`}>{reportError}</div>;
  if (reportLoading || !reportData) return <div class={`${maxWidth} mx-auto text-center py-16`}><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return (
    <div class={`${maxWidth} mx-auto`}>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Results</h2>
      <p class="text-sm text-gray-500 mb-7">{productType} verification</p>
      {reportData.income && <VoieReport report={reportData.income} />}
      {reportData.employment && <VoieReport report={reportData.employment} />}
      {reportData.assets && <AssetsReport report={reportData.assets} />}
      {reportData.income_insights && <IncomeInsightsReport report={reportData.income_insights} />}
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}

const CP_PRODUCTS = [
  {
    id: 'income',
    name: 'Income and employment verification',
    desc: 'Verify current income for program eligibility and benefit calculations.',
    useCase: 'SNAP, TANF, Medicaid, housing assistance',
    report: 'VOIE Report',
    products: ['income'],
  },
  {
    id: 'income_assets',
    name: 'Income + Expenses',
    desc: 'Verify income and bank balances together for full financial picture.',
    useCase: 'Housing assistance, comprehensive eligibility',
    report: 'VOIE + VOA',
    products: ['income', 'assets'],
  },
  {
    id: 'assets',
    name: 'Self-employment income',
    desc: 'Verify bank balances and account ownership for means testing.',
    useCase: 'Housing assistance, program eligibility',
    report: 'VOA + Income Insights',
    products: ['assets'],
  },
];

function CPIntroScreen({ onStart }) {
  const [selected, setSelected] = useState(null);

  return (
    <IntroSlide
      label="Public Sector · Customer Portal"
      title={<>Verify income for<br />benefit eligibility</>}
      subtitle="An applicant applies for benefits and verifies their income and employment through a self-service portal. No document uploads needed."
      diagram={CP_DIAGRAMS[selected] || CP_DIAGRAMS.income}
      actions={
        <button
          onClick={() => selected && onStart(selected)}
          disabled={!selected}
          class="w-full block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
        >
          Get started
        </button>
      }
    >
      <div class="grid gap-3 text-left">
        {CP_PRODUCTS.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(p.id)}
            class={`rounded-xl border px-5 py-4 cursor-pointer transition-all duration-150 ${
              selected === p.id
                ? 'border-primary bg-primary/[0.04]'
                : 'border-[#e8e8ed] hover:border-[#c0c0c5]'
            }`}
          >
            <div class="flex items-center justify-between">
              <h3 class="text-[14px] font-semibold text-[#171717]">{p.name}</h3>
              <span class="text-[10px] font-medium text-[#8E8E93] font-mono">{p.report}</span>
            </div>
            <p class="text-[13px] text-[#8E8E93] leading-[1.5] mt-0.5">{p.desc}</p>
          </div>
        ))}
      </div>
    </IntroSlide>
  );
}
