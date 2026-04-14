/**
 * FILE SUMMARY: Retail Banking: Customer Portal demo.
 * INTEGRATION PATTERN: Orders flow (PII submitted via form, order created server-side).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : create order with applicant PII + selected products
 *   2. BridgeScreen opens with order_id (deeplinked via company_mapping_id)
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * Same Orders API flow as POSApplication.jsx but with government/agency-specific
 * labels and product combinations. The applicant picks a verification type
 * (income, income+assets, or self-employment) and completes Bridge inline.
 *
 * Scaffolding: ./scaffolding/customer-portal.jsx
 * Diagrams:    ../diagrams/customer-portal.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleSubmit()     : creates an order via POST /api/orders
 *   - useReportFetch()   : watches webhooks and fetches reports by product type
 *   - <BridgeScreen />   : opens Bridge with an order_id
 *   - screen routing     : ties intro, bridge, waiting, results into a flow
 */

// --- Imports: Preact hooks ---
import { useState, useEffect } from 'preact/hooks';

// --- Imports: shared layout, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, useReportFetch } from '../components/index.js';

// --- Imports: reusable form and screen components ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';

// --- Imports: client-side navigation helper ---
import { navigate } from '../App.jsx';

// --- Imports: scaffolding (steps config, product definitions, intro/results components) ---
import { STEPS, CP_PRODUCTS, CPIntroScreen, CPReportResults } from './scaffolding/customer-portal.jsx';


// --- Component: CustomerPortalDemo ---
export function CustomerPortalDemo({ screen, param }) {
  // Component state: selected product bundle, Truv user ID, form submission flag
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Derived: resolve product bundle ID to actual product array for the order
  const products = selectedProduct ? (CP_PRODUCTS.find(p => p.id === selectedProduct)?.products || [selectedProduct]) : [];
  const productType = products[0] || null;

  // Report fetching: watches webhooks for order completion, then fetches reports
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products,
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  // Step sync: update sidebar step indicator when URL-driven screen changes
  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Handler: submit application form, POST /api/orders, then navigate to Bridge screen
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

  // Derived state: layout flags and URL param parsing
  const isBridge = screen === 'bridge';
  const isIntro = !screen && !selectedProduct;
  const [orderId, companyMappingId] = (param || '').split('/');

  // --- Render: screen routing ---
  return (
    <Layout badge="Public Sector · Customer Portal" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {/* Bridge screen: inline TruvBridge widget for order verification */}
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="public-sector/customer-portal" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {/* Waiting screen: webhook polling spinner until order completes */}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="public-sector/customer-portal" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {/* Results screen: displays fetched verification report */}
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
      {/* Default screen: product picker intro or application form */}
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
