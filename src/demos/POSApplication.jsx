/**
 * FILE SUMMARY: Mortgage: Point of Sale Application demo.
 * INTEGRATION PATTERN: Orders flow (PII submitted via form, order created server-side).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : create order with borrower PII + selected product
 *   2. GET /api/orders/:id/info   : fetch bridge_token; Bridge modal opens inside the preview iframe
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * Borrower fills out an application form, selects income or assets verification,
 * and completes Bridge. The backend creates an order at Truv, and once the
 * webhook signals completion the frontend fetches and displays the report.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; intro/waiting/results screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/pos-application.jsx
 * Diagrams:    ../diagrams/pos-application.js
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

// --- Imports: scaffolding (steps config, intro screen, report results) ---
import { STEPS, IntroScreen, ReportResults } from './scaffolding/pos-application.jsx';


// --- Component: POSApplicationDemo ---
export function POSApplicationDemo({ screen, param }) {
  // Component state: selected product, Truv user ID, form submission flag, bridge token
  const [productType, setProductType] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  // Set when Bridge fires COMPLETED (source: order) — a trailing onClose from the
  // SDK's auto-close-after-completion must not abort the successful session.
  const completedRef = useRef(false);
  // Set when Bridge fires SUCCESS: the user finished verification, but the
  // order-level COMPLETED event may lag behind (or never arrive before the
  // widget closes). A CLOSE after SUCCESS is a completion, not an abort — the
  // waiting screen's webhook watch confirms the order server-side.
  const successRef = useRef(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, stopPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for order completion, then fetches reports
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: productType ? [productType] : [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  // Session restore: when the user re-enters the results URL (refresh/back-forward)
  // the component remounts with no userId/productType, so the results screen would
  // spin forever. Restore both from GET /api/orders/:id/info and restart polling so
  // the persisted completion webhook re-triggers the report fetch.
  useOrderRestore({
    active: screen === 'results',
    orderId: param,
    userId,
    startPolling,
    onRestore: ({ userId: restoredUserId, products }) => {
      setUserId(restoredUserId);
      if (products[0]) setProductType(products[0]);
    },
  });

  // Step sync: update sidebar step indicator when URL-driven screen changes
  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Derived state: URL param parsing and layout flags
  const isIntro = !screen && !productType;
  const [orderId, companyMappingId] = (param || '').split('/');

  // Effect: on the bridge screen, fetch order info to get bridge_token and user_id
  // (also covers a refresh directly on /bridge/:orderId). The backend proxies
  // GET /api/orders/:id/info to Truv's API. Once we have user_id, start polling
  // for API logs and webhooks. Leaving the bridge screen clears the token so a
  // remounted iframe never replays a stale 'bridge' command.
  useEffect(() => {
    if (screen !== 'bridge' || !orderId) {
      setBridgeToken(null);
      completedRef.current = false;
      successRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); return; }
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) { console.error(e); }
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
      if (type === 'SUCCESS') successRef.current = true;
      if (type === 'COMPLETED' && source === 'order') {
        completedRef.current = true;
        navigate(`mortgage/pos-application/waiting/${orderId}`);
      }
      // In the iframe's modal mode a user exit surfaces as onEvent CLOSE — the
      // SDK's onClose callback does not fire — so the close paths live here.
      if (type === 'CLOSE') handleBridgeClose();
    },
    'bridge:onSuccess': () => addBridgeEvent('onSuccess()', null),
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      handleBridgeClose();
    },
  });

  // Close: already navigated on COMPLETED — ignore. Closed after SUCCESS — the
  // verification finished but the order event lagged; go wait for the webhook.
  // Closed with no success — a genuine abort.
  function handleBridgeClose() {
    if (completedRef.current) return;
    if (successRef.current) {
      completedRef.current = true;
      navigate(`mortgage/pos-application/waiting/${orderId}`);
      return;
    }
    abortBridge();
  }

  // Abort: stop polling the abandoned order and clear the stale userId so a
  // later webhook can't hijack a restarted flow.
  function abortBridge() {
    stopPolling();
    setUserId(null);
    navigate('mortgage/pos-application');
  }

  // Drive the preview iframe from host state: application form before an order
  // exists, Bridge modal (or a spinner while the token loads) on the bridge screen.
  useEffect(() => {
    if (!screen && productType) {
      sendPreview('application-form', { sessionId, productType, submitting });
    } else if (screen === 'bridge') {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken, isOrder: true, companyMappingId });
      } else {
        sendPreview('loading', { label: 'Preparing verification…' });
      }
    }
  }, [screen, productType, submitting, bridgeToken, companyMappingId, sessionId, sendPreview]);

  // Derived state: the device frame spans the borrower-facing screens (form + Bridge)
  const showDeviceFrame = (!screen && productType) || screen === 'bridge';

  // --- Render: screen routing ---
  return (
    <Layout badge="POS Application" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {/* Application form + Bridge widget live inside the preview iframe (user view).
          A single iframe element persists across the form → bridge hash navigation. */}
      {showDeviceFrame && (
        <DeviceFrame url="pos.example.com">
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
        <OrderWaitingScreen orderId={param} demoPath="mortgage/pos-application" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {/* Results screen: displays fetched verification report */}
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
      {/* Default screen: product picker intro (the application form itself renders
          inside the device frame above) */}
      {!screen && !productType && <IntroScreen onStart={setProductType} />}
    </Layout>
  );
}
