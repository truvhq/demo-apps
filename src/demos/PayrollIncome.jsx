/**
 * FILE SUMMARY: Consumer Credit: Payroll Income Verification demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, data_sources: payroll).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token               : create user + bridge token (payroll)
 *   2. TruvBridge modal opens inside the preview iframe, deeplinked to employer
 *   3. Webhook: task-status-updated with status "done"
 *   4. GET /api/users/:userId/reports/income : fetch VOIE report
 *
 * Follows the same Bridge flow as SmartRouting.jsx but restricted to payroll providers.
 * Uses GET /v1/company-mappings-search/ for employer search and company_mapping_id for
 * deeplinking Bridge. Returns a VOIE report with income and employment data.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; waiting/review screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/payroll-income.jsx
 * Diagrams:    ../diagrams/payroll-income.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token
 *   - TruvBridge.init()   : opens the Bridge widget (see preview/components/BridgePreview.jsx)
 *   - useReportFetch()    : watches webhooks and fetches income reports
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display component ---
import { VoieReport } from '../components/reports/VoieReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/payroll-income.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/payroll-income.jsx';

// --- Component: PayrollIncomeDemo ---
export function PayrollIncomeDemo() {
  // Component state: screen phase, form visibility, form data, Truv user ID, loading flag
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for task completion, fetches VOIE income report.
  // The webhook only fills report data in the background — it must NOT advance the
  // screen, or results would appear before the user finishes the widget. The forward
  // move off the widget is driven by Bridge's onSuccess (see the preview channel below).
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: ['income'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => setCurrentStep(3),
    onError: () => setCurrentStep(3),
  });

  // Once past the widget (on 'waiting'), advance to the report as soon as it's ready.
  const reportReady = reports != null || reportError != null;
  useEffect(() => {
    if (screen === 'waiting' && reportReady) setScreen('review');
  }, [screen, reportReady]);

  // Handler: create bridge token via POST /api/bridge-token; the Bridge widget
  // itself opens inside the preview iframe once bridgeToken lands in state.
  // Uses data_sources: ['payroll'] and company_mapping_id for employer deeplinking.
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: ['payroll'], company_mapping_id: data.company_mapping_id, first_name: data.first_name, last_name: data.last_name }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);
      setBridgeToken(result.bridge_token);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Preview iframe channel: maps user/SDK events from inside the iframe back to
  // host state changes. The iframe never closes over host functions — events
  // travel as plain { name, args } messages and the host re-binds them here.
  const sendPreview = usePreviewIframe(iframeRef, {
    'form:submit': (data) => handleFormSubmit(data),
    'bridge:onLoad': () => addBridgeEvent('onLoad()', null),
    'bridge:onEvent': (type, payload) => {
      const payloadStr = payload ? 'payload' : 'undefined';
      addBridgeEvent(`onEvent("${type}", ${payloadStr})`, payload ? [{ label: 'payload', value: payload }] : null);
    },
    'bridge:onSuccess': (publicToken, meta) => {
      addBridgeEvent('onSuccess(publicToken, meta)', [
        { label: 'publicToken', value: publicToken },
        { label: 'meta', value: meta },
      ]);
      setCurrentStep(2);
      // Single-bridge rule: onSuccess (widget completion) is what advances the flow.
      // Forward-only guard in case the report already advanced us to 'review'.
      setScreen(curr => curr === 'review' ? curr : 'waiting');
    },
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      setBridgeToken(null);
    },
  });

  // Drive the preview iframe from host state: form as the base view, Bridge modal
  // layered on top once a token exists.
  useEffect(() => {
    if (screen === 'select' && showForm) {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken });
      } else {
        sendPreview('application-form', { sessionId, productType: 'income', submitting: loading });
      }
    }
  }, [screen, showForm, bridgeToken, loading, sessionId, sendPreview]);

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    resetReports();
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setUserId(null);
    setBridgeToken(null);
  }

  // Derived state: layout flags
  const isIntro = screen === 'select' && !showForm;
  const showDeviceFrame = screen === 'select' && showForm;

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Payroll Income" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {/* Intro slide: architecture diagram */}
      {screen === 'select' && !showForm && (
        <div class="flex-1 flex flex-col">
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={INTRO_SLIDE_CONFIG.title}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors text-center">Get started</button>}
          />
        </div>
      )}

      {/* Application form + Bridge widget live inside the preview iframe (user view).
          The host swaps the iframe's content via postMessage as state evolves. */}
      {showDeviceFrame && (
        <DeviceFrame url="payroll-income.example.com">
          <iframe
            ref={iframeRef}
            src="/preview.html"
            title="Demo preview"
            class="w-full h-full block border-0 bg-white"
          />
        </DeviceFrame>
      )}

      {/* Waiting screen: webhook polling spinner until task completes */}
      {screen === 'waiting' && (
        <div class="sm:max-w-lg sm:mx-auto w-full">
          <WaitingScreen webhooks={panel.webhooks} />
        </div>
      )}

      {/* Review screen: VOIE income report from payroll, or an error message with
          Start Over when the report fetch failed (matches SmartRouting's docsError pattern) */}
      {screen === 'review' && (
        <div class="sm:max-w-lg sm:mx-auto w-full">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">{REPORT_HEADER.title}</h2>
          <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">{REPORT_HEADER.subtitle}</p>
          {reports?.income && !reportLoading ? (
            <div>
              <VoieReport report={reports.income} />
              <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={resetDemo}>Start Over</button>
              </div>
            </div>
          ) : reportError ? (
            <div>
              <p class="text-sm text-red-500 mb-4">Income report unavailable. Try starting over.</p>
              <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={resetDemo}>Start Over</button>
              </div>
            </div>
          ) : (
            <div class="text-center py-10"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
          )}
        </div>
      )}
    </Layout>
  );
}
