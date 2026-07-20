/**
 * FILE SUMMARY: Retail Banking: Direct Deposit Switch demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, product_type: deposit_switch).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token                             : create user + bridge token (deposit_switch)
 *   2. TruvBridge modal opens inside the preview iframe for payroll login + switch
 *   3. Webhook: task-status-updated with status "done"
 *   4. GET /api/users/:userId/reports/deposit_switch       : fetch deposit switch confirmation
 *
 * A new customer connects their payroll provider and switches direct deposit routing
 * to your bank. Follows the same Bridge flow as SmartRouting.jsx but uses product_type
 * "deposit_switch". The report confirms the deposit was switched.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; waiting/review screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/direct-deposit-switch.jsx
 * Diagrams:    ../diagrams/direct-deposit-switch.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token (product_type: deposit_switch)
 *   - TruvBridge.init()   : opens the Bridge widget (see preview/components/BridgePreview.jsx)
 *   - useReportFetch()    : watches webhooks and fetches deposit_switch reports
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display component ---
import { DDSReport } from '../components/reports/DDSReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/direct-deposit-switch.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/direct-deposit-switch.jsx';

// --- Component: DirectDepositSwitchDemo ---
export function DirectDepositSwitchDemo() {
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

  // Report fetching: watches webhooks for task completion, fetches deposit_switch report.
  // onError also advances to the review screen so the waiting screen never hangs
  // when the report fetch fails after the task-done webhook.
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: ['deposit_switch'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => { setCurrentStep(3); setScreen('review'); },
    onError: () => { setCurrentStep(3); setScreen('review'); },
  });

  // Handler: create bridge token via POST /api/bridge-token (deposit_switch); the
  // Bridge widget itself opens inside the preview iframe once bridgeToken lands in
  // state. Uses company_mapping_id for employer deeplinking.
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'deposit_switch', company_mapping_id: data.company_mapping_id, first_name: data.first_name, last_name: data.last_name }),
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
      // In the iframe's modal mode a user exit surfaces as onEvent CLOSE — the
      // SDK's onClose callback does not fire — so drop the token here to fall
      // back to the form as the base view.
      if (type === 'CLOSE') setBridgeToken(null);
    },
    'bridge:onSuccess': (publicToken, meta) => {
      addBridgeEvent('onSuccess(publicToken, meta)', [
        { label: 'publicToken', value: publicToken },
        { label: 'meta', value: meta },
      ]);
      setCurrentStep(2);
      // Guard: Bridge's onSuccess can fire after the "done" webhook, so useReportFetch
      // may have already transitioned the screen to 'review'. Don't clobber it back to
      // 'waiting' — deposit_switch has no create step so its report resolves fast,
      // making this race the common case (matches PaycheckLinkedLoans).
      setScreen(curr => curr === 'review' ? curr : 'waiting');
    },
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      setBridgeToken(null);
    },
  });

  // Drive the preview iframe from host state: form as the base view, Bridge modal
  // layered on top once a token exists. requireEmployer because deposit_switch
  // deeplinks Bridge via company_mapping_id with a sandbox account (see
  // server/truv.js) — without an employer selection the flow cannot proceed.
  useEffect(() => {
    if (screen === 'select' && showForm) {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken });
      } else {
        sendPreview('application-form', { sessionId, productType: 'deposit_switch', submitting: loading, requireEmployer: true });
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
    <Layout badge="Retail Banking . Deposit Switch" steps={STEPS} panel={panel} hidePanel={isIntro}>
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
        <DeviceFrame url="deposit-switch.example.com">
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

      {/* Review screen: deposit switch confirmation report, or an error message
          with Start Over when the report fetch failed (matches SmartRouting's
          docsError pattern) */}
      {screen === 'review' && (
        <div class="sm:max-w-lg sm:mx-auto w-full">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">{REPORT_HEADER.title}</h2>
          <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">{REPORT_HEADER.subtitle}</p>
          {reports?.deposit_switch && !reportLoading ? (
            <div>
              <DDSReport report={reports.deposit_switch} />
              <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={resetDemo}>Start Over</button>
              </div>
            </div>
          ) : reportError ? (
            <div>
              <p class="text-sm text-red-500 mb-4">Deposit switch report unavailable. Try starting over.</p>
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
