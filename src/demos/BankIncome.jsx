/**
 * FILE SUMMARY: Consumer Credit: Bank Income Verification demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, data_sources: financial_accounts).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token                : create user + bridge token (financial_accounts)
 *   2. TruvBridge modal opens inside the preview iframe for bank login
 *   3. Webhook: task-status-updated with status "done"
 *   4. GET /api/users/:userId/reports/income_insights : fetch income insights report
 *
 * Follows the same Bridge flow as SmartRouting.jsx but restricted to bank connections.
 * Uses GET /v1/providers/ for financial institution search. Returns an income insights
 * report derived from bank transaction analysis.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; waiting/review screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/bank-income.jsx
 * Diagrams:    ../diagrams/bank-income.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token
 *   - TruvBridge.init()   : opens the Bridge widget (see preview/components/BridgePreview.jsx)
 *   - useReportFetch()    : watches webhooks and fetches income_insights reports
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display component ---
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/bank-income.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/bank-income.jsx';

// --- Component: BankIncomeDemo ---
export function BankIncomeDemo() {
  // Component state: screen phase, form visibility, form data, Truv user ID, loading flag
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  // Set when Bridge fires onSuccess — verification succeeded, but we keep the
  // widget on screen until the user dismisses it (onClose), so they see the
  // widget's own success screen and press Done before we advance.
  const succeededRef = useRef(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for task completion, fetches income_insights report.
  // The report is fetched in the background; the screen only advances to it once
  // the user has dismissed the widget (see onClose + the waiting→review effect),
  // so the widget's success screen is never torn down before the user presses Done.
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId,
    products: ['income_insights'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => setCurrentStep(3),
    onError: () => setCurrentStep(3),
  });

  // Once the user has dismissed the widget onto the waiting screen, move to the
  // report as soon as it (or an error) is ready.
  useEffect(() => {
    if (screen === 'waiting' && (reports?.income_insights || reportError)) setScreen('review');
  }, [screen, reports, reportError]);

  // Handler: create bridge token via POST /api/bridge-token; the Bridge widget
  // itself opens inside the preview iframe once bridgeToken lands in state.
  // Uses data_sources: ['financial_accounts'] and provider_id for bank deeplinking.
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: ['financial_accounts'], provider_id: data.provider_id, first_name: data.first_name, last_name: data.last_name }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);
      succeededRef.current = false;
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
      // Verification succeeded, but keep the widget up so the user sees its
      // success screen and presses Done — the screen advances on onClose.
      succeededRef.current = true;
    },
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      // Done pressed. If verification succeeded, advance to the report (or the
      // waiting spinner until it arrives); otherwise the user bailed — drop the
      // token to fall back to the form.
      if (succeededRef.current) {
        setScreen(reports?.income_insights || reportError ? 'review' : 'waiting');
      } else {
        setBridgeToken(null);
      }
    },
  });

  // Drive the preview iframe from host state: form as the base view, Bridge modal
  // layered on top once a token exists.
  useEffect(() => {
    if (screen === 'select' && showForm) {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken });
      } else {
        sendPreview('application-form', { sessionId, productType: 'income', submitting: loading, employerLabel: 'Financial institution', dataSource: 'financial_accounts' });
      }
    }
  }, [screen, showForm, bridgeToken, loading, sessionId, sendPreview]);

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    resetReports();
    succeededRef.current = false;
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
    <Layout badge="Bank Income" steps={STEPS} panel={panel} hidePanel={isIntro}>
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
        <DeviceFrame url="bank-income.example.com">
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

      {/* Review screen: income insights report from bank transactions, or an error
          message with Start Over when the report fetch failed (matches SmartRouting's
          docsError pattern) */}
      {screen === 'review' && (
        <div class="sm:max-w-lg sm:mx-auto w-full">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">{REPORT_HEADER.title}</h2>
          <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">{REPORT_HEADER.subtitle}</p>
          {reports?.income_insights && !reportLoading ? (
            <div>
              <IncomeInsightsReport report={reports.income_insights} />
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
