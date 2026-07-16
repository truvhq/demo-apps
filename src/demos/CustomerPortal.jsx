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
import { Layout, usePanel, API_BASE, useReportFetch, useOrderRestore } from '../components/index.js';

// --- Imports: reusable form and screen components ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';

// --- Imports: client-side navigation helper ---
import { navigate } from '../App.jsx';

// --- Imports: scaffolding (steps config, product definitions, intro/results components) ---
import { STEPS, CP_PRODUCTS, CPIntroScreen, CPReportResults } from './scaffolding/customer-portal.jsx';


// --- Component: CustomerPortalDemo ---
export function CustomerPortalDemo({ screen, param }) {
  // Component state: selected product bundle, Truv user ID, form submission flag,
  // and restored products (raw product list recovered on results-URL re-entry)
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [restoredProducts, setRestoredProducts] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, stopPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Derived: resolve product bundle ID to actual product array for the order.
  // Falls back to restoredProducts when the session was restored from a results URL.
  const products = selectedProduct
    ? (CP_PRODUCTS.find(p => p.id === selectedProduct)?.products || [selectedProduct])
    : (restoredProducts || []);
  const productType = products[0] || null;

  // Report fetching: watches webhooks for order completion, then fetches reports
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products,
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  // Session restore: when the user re-enters the results URL (refresh/back-forward)
  // the component remounts with no userId/selectedProduct, so the results screen would
  // spin forever. Restore both from GET /api/orders/:id/info and restart polling so
  // the persisted completion webhook re-triggers the report fetch. The stored
  // product_type is comma-joined, so map it back to a CP_PRODUCTS bundle when possible.
  useOrderRestore({
    active: screen === 'results',
    orderId: param,
    userId,
    startPolling,
    onRestore: ({ userId: restoredUserId, products: restored }) => {
      setUserId(restoredUserId);
      const bundle = CP_PRODUCTS.find(p => p.products.join(',') === restored.join(','));
      if (bundle) setSelectedProduct(bundle.id);
      else setRestoredProducts(restored);
    },
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
      {/* Bridge screen: inline TruvBridge widget for order verification.
          onAbort: on a genuine user close, stop polling the abandoned order and
          clear the stale userId so a later webhook can't hijack a restarted flow. */}
      {screen === 'bridge' && (
        <BridgeScreen
          orderId={orderId}
          demoPath="public-sector/customer-portal"
          companyMappingId={companyMappingId}
          addBridgeEvent={addBridgeEvent}
          startPolling={startPolling}
          onAbort={() => { stopPolling(); setUserId(null); navigate('public-sector/customer-portal'); }}
        />
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
          onBack={() => { reset(); resetReports(); setSelectedProduct(null); setRestoredProducts(null); setUserId(null); navigate('public-sector/customer-portal'); }}
          backLabel="Customer Portal"
        />
      )}
      {/* Default screen: product picker intro or application form */}
      {!screen && (
        selectedProduct ? (
          <div class="w-full sm:max-w-lg sm:mx-auto px-4 py-6 sm:px-8 sm:py-10">
            <ApplicationForm sessionId={sessionId} onSubmit={handleSubmit} submitting={submitting} productType={productType} />
          </div>
        ) : (
          <CPIntroScreen onStart={setSelectedProduct} />
        )
      )}
    </Layout>
  );
}
