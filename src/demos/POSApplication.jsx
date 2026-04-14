/**
 * FILE SUMMARY: Mortgage: Point of Sale Application demo.
 * INTEGRATION PATTERN: Orders flow (PII submitted via form, order created server-side).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : create order with borrower PII + selected product
 *   2. BridgeScreen opens with order_id (deeplinked via company_mapping_id)
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * Borrower fills out an application form, selects income or assets verification,
 * and completes Bridge inline. The backend creates an order at Truv, and once the
 * webhook signals completion the frontend fetches and displays the report.
 *
 * Scaffolding: ./scaffolding/pos-application.jsx
 * Diagrams:    ../diagrams/pos-application.js
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

// --- Imports: scaffolding (steps config, intro screen, report results) ---
import { STEPS, IntroScreen, ReportResults } from './scaffolding/pos-application.jsx';


// --- Component: POSApplicationDemo ---
export function POSApplicationDemo({ screen, param }) {
  // Component state: selected product, Truv user ID, form submission flag
  const [productType, setProductType] = useState(null);
  const [userId, setUserId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for order completion, then fetches reports
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: productType ? [productType] : [],
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

  // Derived state: layout flags and URL param parsing
  const isBridge = screen === 'bridge';
  const isIntro = !screen && !productType;
  const [orderId, companyMappingId] = (param || '').split('/');

  // --- Render: screen routing ---
  return (
    <Layout badge="POS Application" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {/* Bridge screen: inline TruvBridge widget for order verification */}
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="mortgage/pos-application" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
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
      {/* Default screen: product picker intro or application form */}
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
