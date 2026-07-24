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
 * Same Orders API flow as POSApplication.jsx but with government/agency-specific
 * labels and product combinations. The applicant picks a verification type
 * (income, income+assets, or self-employment) and completes Bridge.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; intro/waiting/results screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/customer-portal.jsx
 * Diagrams:    ../diagrams/customer-portal.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleSubmit()     : creates an order via POST /api/orders
 *   - useReportFetch()   : watches webhooks and fetches reports by product type
 *   - TruvBridge.init()  : opens Bridge with an order's bridge_token (see preview/components/BridgePreview.jsx)
 *   - screen routing     : ties intro, bridge, waiting, results into a flow
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, useReportFetch, useOrderRestore } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: reusable screen components ---
import { OrderWaitingScreen } from '../components/screens/index.js';

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
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  // Set when Bridge fires COMPLETED (source: order) — a trailing close from the
  // SDK's auto-close-after-completion must not abort the successful session.
  const completedRef = useRef(false);

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

  // Derived state: URL param parsing and layout flags
  const isIntro = !screen && !selectedProduct;
  const [orderId, companyMappingId] = (param || '').split('/');

  // Effect: on the bridge screen, fetch order info to get bridge_token and user_id
  // (also covers a refresh directly on /bridge/:orderId). The backend proxies
  // GET /api/orders/:id/info to Truv's API. Once we have user_id, start polling
  // for API logs and webhooks. Leaving the bridge screen clears the token so a
  // remounted iframe never replays a stale 'bridge' command.
  useEffect(() => {
    if (screen !== 'bridge' || !orderId) {
      setBridgeToken(null);
      return;
    }
    // Fresh Bridge session: clear the completion marker so a later onClose counts
    // as an abandon. A completed order sets it true just before navigating away,
    // and it must stay true until the next Bridge opens (see onClose below).
    completedRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({ error: 'Unknown' }));
          if (cancelled) return;
          alert('Error: ' + (data.error || 'Unknown'));
          abortBridge();
          return;
        }
        const data = await resp.json();
        if (cancelled) return;
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) {
        console.error(e);
        if (!cancelled) abortBridge();
      }
    })();
    return () => { cancelled = true; };
  }, [screen, orderId]);

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

  // Preview iframe channel: maps user/SDK events from inside the iframe back to
  // host state changes. On COMPLETED (source: order) the flow advances to the
  // waiting screen; on a genuine user close, stop polling the abandoned order and
  // clear the stale userId so a later webhook can't hijack a restarted flow.
  const sendPreview = usePreviewIframe(iframeRef, {
    'form:submit': (data) => handleSubmit(data),
    'bridge:onLoad': () => addBridgeEvent('onLoad()', null),
    'bridge:onEvent': (type, payload, source) => {
      const payloadStr = payload ? 'payload' : 'undefined';
      addBridgeEvent(`onEvent("${type}", ${payloadStr}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
      // Orders flow: the whole order (all products) is done only on the
      // order-level COMPLETED event — not a per-link SUCCESS, which fires once
      // per product and would advance a multi-product order too early.
      if (type === 'COMPLETED' && source === 'order') {
        completedRef.current = true;
        navigate(`public-sector/customer-portal/waiting/${orderId}`);
      }
    },
    'bridge:onSuccess': () => addBridgeEvent('onSuccess()', null),
    // If the user closes Bridge without completing the order, send them back to
    // the previous screen (the application form). completedRef skips this when
    // the widget auto-closes right after a successful COMPLETED.
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      if (!completedRef.current) abortBridge();
    },
  });

  // Abort: on a failure to load the order (see the bridge-token effect), or when
  // the user closes Bridge without completing — stop polling, clear the stale
  // userId, and return to the previous screen (the application form).
  function abortBridge() {
    stopPolling();
    setUserId(null);
    navigate('public-sector/customer-portal');
  }

  // Drive the preview iframe from host state: application form before an order
  // exists, Bridge modal (or a spinner while the token loads) on the bridge screen.
  useEffect(() => {
    if (!screen && selectedProduct) {
      sendPreview('application-form', { sessionId, productType, submitting });
    } else if (screen === 'bridge') {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken, isOrder: true, companyMappingId, inline: true });
      } else {
        sendPreview('loading', { label: 'Preparing verification…' });
      }
    }
  }, [screen, selectedProduct, productType, submitting, bridgeToken, companyMappingId, sessionId, sendPreview]);

  // Derived state: the device frame spans the applicant-facing screens (form + Bridge)
  const showDeviceFrame = (!screen && selectedProduct) || screen === 'bridge';

  // --- Render: screen routing ---
  return (
    <Layout badge="Public Sector · Customer Portal" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {/* Application form + Bridge widget live inside the preview iframe (user view).
          A single iframe element persists across the form → bridge hash navigation. */}
      {showDeviceFrame && (
        <DeviceFrame url="benefits.example.gov">
          <iframe
            ref={iframeRef}
            src="/preview.html"
            title="Demo preview"
            class="w-full h-full block border-0 bg-white"
          />
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
      {/* Default screen: product picker intro (the application form itself renders
          inside the device frame above) */}
      {!screen && !selectedProduct && <CPIntroScreen onStart={setSelectedProduct} />}
    </Layout>
  );
}
