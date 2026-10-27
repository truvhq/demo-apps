/**
 * FILE SUMMARY: Retail Banking: Customer Portal demo.
 * INTEGRATION PATTERN: Orders flow (PII submitted via form, order created server-side).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : create order with applicant PII + selected products
 *   2. GET /api/orders/:id/info   : fetch bridge_token; Bridge modal opens inside the preview iframe
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * The start screen (CPStartScreen) picks two independent axes (two questions in the portal decide the products):
 * portal layout (hero page / slide layout) and verification display (dialog / inline),
 * ported from the Georgia Gateway demo. The portal (CPPortal) renders in the host page
 * inside DeviceFrame and opens the order page with TruvBridge directly; Embedded Orders
 * only, no standalone Bridge. Waiting/results screens are the manager view.
 *
 * Scaffolding: ./scaffolding/customer-portal.jsx, ./scaffolding/customer-portal-portal.jsx
 * Diagrams:    ../diagrams/customer-portal.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleSubmit()     : creates an order via POST /api/orders
 *   - useReportFetch()   : watches webhooks and fetches reports by product type
 *   - TruvBridge.init()  : opens the order page, dialog or inline (see openBridge() in customer-portal-portal.jsx)
 *   - screen routing     : ties intro, bridge, waiting, results into a flow
 */

// --- Imports: Preact hooks ---
import { useState, useEffect } from 'preact/hooks';

// --- Imports: shared layout, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, useReportFetch, useOrderRestore } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';

// --- Imports: reusable screen components ---
import { OrderWaitingScreen } from '../components/screens/index.js';

// --- Imports: client-side navigation helper ---
import { navigate } from '../App.jsx';

// --- Imports: scaffolding (steps config, product definitions, intro/results components) ---
import { STEPS, CP_PRODUCTS, CPReportResults } from './scaffolding/customer-portal.jsx';
import { CPStartScreen, CPPortal, PortalFrame, newApplication } from './scaffolding/customer-portal-portal.jsx';


// --- Component: CustomerPortalDemo ---
export function CustomerPortalDemo({ screen, param }) {
  // Component state: selected product bundle, Truv user ID, form submission flag,
  // and restored products (raw product list recovered on results-URL re-entry)
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [restoredProducts, setRestoredProducts] = useState(null);
  const [userId, setUserId] = useState(null);

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
    const stepMap = { '': 0, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Start-screen choices. run = the application in progress (null on the start screen).
  const [run, setRun] = useState(null);
  const [showDetails, setShowDetails] = useState(true);
  const [notice, setNotice] = useState('');

  function startRun(app, walkAway) {
    reset(); resetReports(); setUserId(null);
    setSelectedProduct(null);
    setRun({ app, walkAway });
  }
  function exitRun(message) { stopPolling(); setRun(null); setNotice(message || ''); }
  // --- Render: screen routing ---
  return (
    <Layout badge="Public Sector · Customer Portal" steps={STEPS} panel={panel} hidePanel={!screen && (!run || !showDetails)} theme="checkr">
      {!screen && !run && (
        <CPStartScreen
          notice={notice}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          onStart={({ layout, display, walkAway }) => startRun(newApplication({ layout, display }), walkAway)}
          onResume={(app) => startRun({ ...app, step: app.orderId && !app.verified ? 2 : app.step }, true)}
        />
      )}
      {!screen && run && (
        <DeviceFrame url="benefits.example.gov" variant="phone">
          <PortalFrame>{(win) => (
            <CPPortal
              key={run.app.caseNumber}
              initial={run.app}
              walkAway={run.walkAway}
              onEvent={(label, payload) => { setCurrentStep(1); addBridgeEvent(label, payload ? [{ label: 'payload', value: payload }] : null); }}
              onOrder={(data, orderProducts) => { setCurrentStep(1); setRestoredProducts(orderProducts); if (data.user_id) { setUserId(data.user_id); startPolling(data.user_id); } }}
              onExit={exitRun}
              win={win}
            />
          )}</PortalFrame>
        </DeviceFrame>
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
    </Layout>
  );
}
