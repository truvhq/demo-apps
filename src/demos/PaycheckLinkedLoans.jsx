/**
 * FILE SUMMARY: Consumer Credit: Paycheck-Linked Loans demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, product_type: pll).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token              : create user + bridge token (pll)
 *   2. TruvBridge modal opens inside the preview iframe for payroll + deduction
 *   3. Webhook: task-status-updated (done) : carries link_id for the completed task
 *   4. GET /api/links/:linkId/pll          : fetch PLL report (deposit allocation + provider)
 *
 * Only the PLL link-level report is fetched. The VOIE income report is not applicable
 * to the PLL product, since PLL tasks do not produce payroll-backed income data.
 *
 * The user-facing screens (application form, Bridge widget) render inside an
 * isolated iframe (`/preview.html`) wrapped in DeviceFrame and driven over
 * postMessage; waiting/review screens are the manager view and render bare.
 *
 * Scaffolding: ./scaffolding/paycheck-linked-loans.jsx
 * Diagrams:    ../diagrams/paycheck-linked-loans.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token (product_type: pll)
 *   - TruvBridge.init()   : opens the Bridge widget (see preview/components/BridgePreview.jsx)
 *   - PLL report fetch    : extracts link_id from the task-status-updated webhook, fetches
 *                           GET /api/links/:linkId/pll
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API utilities ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, parsePayload } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display component ---
import { PLLReport } from '../components/reports/PLLReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/paycheck-linked-loans.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/paycheck-linked-loans.jsx';

// --- Component: PaycheckLinkedLoansDemo ---
export function PaycheckLinkedLoansDemo() {
  // Component state: screen phase, form visibility, form data, Truv user ID, loading flag
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  // Set when Bridge fires onSuccess — the verification succeeded, but we keep the
  // widget on screen until the user dismisses it (onClose), so they see the
  // widget's own success screen and press Done before we advance.
  const succeededRef = useRef(false);

  // PLL report state: fetched via link_id from the task-status-updated webhook
  const [pllReport, setPllReport] = useState(null);
  const [pllError, setPllError] = useState(false);
  const [pllLoading, setPllLoading] = useState(false);
  const pllFetchedRef = useRef(false);
  const pllRetryRef = useRef(0);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Effect: when task-status-updated:done webhook arrives, extract link_id and fetch
  // the PLL report. The PLL report is the only report needed for this product.
  // Retries up to 3 times on failure before surfacing an error to the user.
  useEffect(() => {
    if (!userId || pllFetchedRef.current) return;
    const doneWh = panel.webhooks.find(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (!doneWh) return;
    const p = parsePayload(doneWh.payload);
    const linkId = p.link_id || doneWh.link_id;
    if (!linkId) return;
    pllFetchedRef.current = true;
    setPllLoading(true);
    // Fetch and store the report in the background. Do NOT advance the screen
    // here — the transition to the report happens on onClose (Done) or, if the
    // widget was already dismissed, via the waiting→review effect below — so the
    // widget's success screen is never torn down before the user presses Done.
    fetch(`${API_BASE}/api/links/${encodeURIComponent(linkId)}/pll?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPllReport(data);
          setPllLoading(false);
          setCurrentStep(3);
          pollOnceAndStop();
        } else if (++pllRetryRef.current < 3) {
          pllFetchedRef.current = false;
        } else {
          setPllError(true);
          setPllLoading(false);
          setCurrentStep(3);
          pollOnceAndStop();
        }
      })
      .catch(e => {
        console.error('PLL report fetch failed:', e);
        if (++pllRetryRef.current < 3) {
          pllFetchedRef.current = false;
        } else {
          setPllError(true);
          setPllLoading(false);
          setCurrentStep(3);
          pollOnceAndStop();
        }
      });
  }, [panel.webhooks, userId]);

  // Once the user has dismissed the widget onto the waiting screen, move to the
  // report as soon as it (or an error) is ready.
  useEffect(() => {
    if (screen === 'waiting' && (pllReport || pllError)) setScreen('review');
  }, [screen, pllReport, pllError]);

  // Handler: create bridge token via POST /api/bridge-token (product_type: pll); the
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
        body: JSON.stringify({ product_type: 'pll', company_mapping_id: data.company_mapping_id, first_name: data.first_name, last_name: data.last_name }),
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
        setScreen(pllReport || pllError ? 'review' : 'waiting');
      } else {
        setBridgeToken(null);
      }
    },
  });

  // Drive the preview iframe from host state: form as the base view, Bridge modal
  // layered on top once a token exists. requireEmployer because PLL token creation
  // deeplinks Bridge via company_mapping_id — without an employer selection Truv
  // rejects the request (see server/truv.js sandbox account setup).
  useEffect(() => {
    if (screen === 'select' && showForm) {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken });
      } else {
        sendPreview('application-form', { sessionId, productType: 'pll', submitting: loading, requireEmployer: true });
      }
    }
  }, [screen, showForm, bridgeToken, loading, sessionId, sendPreview]);

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    succeededRef.current = false;
    pllFetchedRef.current = false;
    pllRetryRef.current = 0;
    setPllReport(null);
    setPllError(false);
    setPllLoading(false);
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
    <Layout badge="Paycheck-Linked Loans" steps={STEPS} panel={panel} hidePanel={isIntro}>
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
        <DeviceFrame url="paycheck-loans.example.com">
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

      {/* Review screen: PLL deposit allocation report */}
      {screen === 'review' && (
        <div class="sm:max-w-lg sm:mx-auto w-full">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">{REPORT_HEADER.title}</h2>
          <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">{REPORT_HEADER.subtitle}</p>
          {pllLoading ? (
            <div class="text-center py-10"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
          ) : (
            <div>
              {pllReport && <PLLReport report={pllReport} />}
              {pllError && <p class="text-sm text-red-500 mb-4">PLL report unavailable. Try starting over.</p>}
              <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={resetDemo}>Start Over</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
