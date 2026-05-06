/**
 * FILE SUMMARY: Consumer Credit: Smart Routing demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token) with routing recommendation.
 *
 * DATA FLOW:
 *   1. GET /api/companies?q=...                 : check employer success_rate for routing
 *   2. POST /api/bridge-token                   : create user + bridge token with data_sources
 *   3. TruvBridge.init().open()                 : Bridge popup (deeplinked for payroll)
 *   4. Webhook: task-status-updated "done"      : payload carries link_id for the task
 *   5a. payroll/bank: GET /api/users/:userId/reports/:type
 *   5b. documents:    GET /api/links/:linkId/income (link-based, link_id from webhook)
 *
 * The DeviceFrame contents (form, method picker, Bridge widget) are rendered
 * inside an isolated iframe (`/preview.html`) and driven over postMessage. This
 * lets Bridge run in its native modal mode without `position: 'inline'` and
 * keeps the demo viewport visually independent from the host shell.
 *
 * Scaffolding: ./scaffolding/smart-routing.jsx
 * Diagrams:    ../diagrams/smart-routing.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()    : checks employer coverage via GET /api/companies for routing
 *   - handleMethodSelect()  : creates a bridge token via POST /api/bridge-token
 *   - TruvBridge.init()     : opens the Bridge widget with data_sources (see preview/components/BridgePreview.jsx)
 *   - useReportFetch()      : watches webhooks and fetches reports
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch, parsePayload } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display components ---
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/smart-routing.js';

// --- Imports: scaffolding (steps, method definitions, intro config, picker components) ---
import { STEPS, METHODS, INTRO_SLIDE_CONFIG, MethodCards } from './scaffolding/smart-routing.jsx';

// Screens form a forward-only flow: never roll back from a later phase to an earlier one.
const SCREEN_FLOW = ['select', 'choose', 'waiting', 'review'];
const atLeastScreen = (current, target) =>
  SCREEN_FLOW.indexOf(current) >= SCREEN_FLOW.indexOf(target) ? current : target;

// --- Component: SmartRoutingDemo ---
export function SmartRoutingDemo() {
  // Component state: screen phase, form visibility, form data, routing recommendation
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Documents-method state: link-based report fetched via link_id from the webhook.
  // Document uploads go through Truv as a docs-only link, so no payroll/bank task
  // exists on the user. The user-level VOIE create endpoint returns 400 in that case;
  // the report has to be retrieved per-link instead.
  const [docsReport, setDocsReport] = useState(null);
  const [docsError, setDocsError] = useState(false);
  // Bridge widget lives inside the preview iframe; the host only tracks the token.
  // The iframe initializes TruvBridge with this token and forwards SDK events back.
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const docsFetchedRef = useRef(false);
  const docsRetryRef = useRef(0);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  const isDocumentsMethod = selectedMethod?.id === 'documents';

  // Report fetching for payroll/bank: uses reportType (not productType) because bank
  // method needs income_insights reports. Documents method is excluded — it fetches
  // the link-based income report directly in the effect below.
  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: selectedMethod && !isDocumentsMethod ? [selectedMethod.reportType || 'income'] : [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => setScreen('review'),
  });

  // Derive sidebar Guide step from screen + userId so step never desyncs from the actual
  // phase. 'choose' covers two steps because Bridge opens over that screen:
  // userId presence is the signal that the widget is up.
  useEffect(() => {
    const stepByScreen = { select: 0, choose: userId ? 2 : 1, waiting: 3, review: 4 };
    setCurrentStep(stepByScreen[screen] ?? 0);
  }, [screen, userId]);

  // Effect: documents method only. When task-status-updated:done arrives, extract
  // link_id and fetch GET /api/links/{linkId}/income. Retries up to 3 times on
  // transient failures (report may briefly 404 right after the webhook fires).
  useEffect(() => {
    if (!isDocumentsMethod || !userId || docsFetchedRef.current) return;
    const doneWh = panel.webhooks.find(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (!doneWh) return;
    const p = parsePayload(doneWh.payload);
    const linkId = p.link_id || doneWh.link_id;
    if (!linkId) return;
    docsFetchedRef.current = true;
    setDocsLoading(true);
    fetch(`${API_BASE}/api/links/${encodeURIComponent(linkId)}/income?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          // Wrap single link payload in { links: [...] } so VoieReport (which iterates
          // report.links[].employments[]) renders the same way as the user-level VOIE
          // response used by payroll/bank methods.
          setDocsReport({ links: [data] });
          setDocsLoading(false);
          setScreen('review');
          pollOnceAndStop();
        } else if (++docsRetryRef.current < 3) {
          docsFetchedRef.current = false;
        } else {
          setDocsError(true);
          setDocsLoading(false);
          setScreen('review');
          pollOnceAndStop();
        }
      })
      .catch(e => {
        console.error('Docs income report fetch failed:', e);
        if (++docsRetryRef.current < 3) {
          docsFetchedRef.current = false;
        } else {
          setDocsError(true);
          setDocsLoading(false);
          setScreen('review');
          pollOnceAndStop();
        }
      });
  }, [panel.webhooks, userId, isDocumentsMethod]);

  // Handler: check employer payroll coverage via GET /api/companies to determine recommendation.
  // success_rate "high" recommends payroll, otherwise bank, no results falls back to documents.
  // See: https://docs.truv.com/reference/company_autocomplete_search
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setScreen('choose');

    try {
      const employer = data.employer || '';
      const resp = await fetch(`${API_BASE}/api/companies?q=${encodeURIComponent(employer)}&product_type=income&session_id=${encodeURIComponent(sessionId)}`);
      const companies = await resp.json();
      const top = Array.isArray(companies) && companies.length > 0 ? companies[0] : null;

      if (!top) {
        setRecommended('documents');
      } else if (top.success_rate === 'high') {
        setRecommended('payroll');
      } else {
        setRecommended('bank');
      }
    } catch (e) {
      console.error(e);
      setRecommended('documents');
    }
    setLoading(false);
  }

  // Handler: create bridge token via POST /api/bridge-token and hand it to the
  // preview iframe to open the Bridge widget. data_sources restricts which
  // providers Bridge shows (payroll, financial_accounts, or docs).
  // See: https://docs.truv.com/reference/users_tokens
  async function handleMethodSelect(method) {
    setSelectedMethod(method);
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only pass company_mapping_id for payroll methods. It deeplinks Bridge to that employer.
        // Bank and document methods don't use it (Bridge shows its own provider search).
        body: JSON.stringify({
          product_type: method.productType,
          data_sources: method.dataSources,
          ...(method.id === 'payroll' && formData?.company_mapping_id ? { company_mapping_id: formData.company_mapping_id } : {}),
          first_name: formData?.first_name,
          last_name: formData?.last_name,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }

      setUserId(data.user_id);
      startPolling(data.user_id);
      setBridgeToken(data.bridge_token);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Preview iframe channel: maps user/SDK events from inside the iframe back to
  // host state changes. The iframe never closes over host functions — events
  // travel as plain { name, args } messages and the host re-binds them here.
  const sendPreview = usePreviewIframe(iframeRef, {
    'form:submit': (data) => handleFormSubmit(data),
    'method:select': (id) => {
      const method = METHODS.find(m => m.id === id);
      if (method) handleMethodSelect(method);
    },
    'nav:back': () => {
      setFormData(null);
      setRecommended(null);
      setScreen('select');
      setShowForm(true);
    },
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
      // Bridge's onSuccess can race with the docs webhook handler that already advanced
      // the flow to 'review' — keep the latest phase instead of rolling back.
      setScreen(prev => atLeastScreen(prev, 'waiting'));
    },
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      setBridgeToken(null);
    },
  });

  // Drive the preview iframe from host state. A single source of truth: whenever
  // any of these inputs change, the host issues a render command and the iframe
  // swaps in the matching component.
  useEffect(() => {
    if (screen === 'select' && showForm) {
      sendPreview('application-form', { sessionId, productType: 'income', submitting: loading });
      return;
    }
    if (screen === 'choose') {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken });
      } else if (loading && !recommended) {
        sendPreview('loading', { label: 'Checking coverage...', subtitle: 'Evaluating payroll coverage for the employer' });
      } else {
        sendPreview('method-picker', { recommended, loading });
      }
    }
  }, [screen, showForm, bridgeToken, loading, recommended, sessionId, sendPreview]);

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    resetReports();
    docsFetchedRef.current = false;
    docsRetryRef.current = 0;
    setDocsReport(null);
    setDocsError(false);
    setDocsLoading(false);
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setRecommended(null);
    setBridgeToken(null);
    setSelectedMethod(null);
    setUserId(null);
  }

  // Derived state: layout flag
  const isIntro = screen === 'select' && !showForm;
  const showDeviceFrame = (screen === 'select' && showForm) || screen === 'choose';

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Smart Routing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {/* Intro slide: method cards overview + architecture diagram */}
      {screen === 'select' && !showForm && (
        <div class="flex-1 flex flex-col">
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={<>Find the fastest<br />verification path</>}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={
              <button onClick={() => setShowForm(true)} class="w-full block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                Get started
              </button>
            }
          >
            <MethodCards />
          </IntroSlide>
        </div>
      )}

      {/* Application form + method picker + Bridge widget all live inside the preview
          iframe. The host swaps the iframe's content via postMessage as state evolves;
          a single iframe element persists across the select → choose transition. */}
      {showDeviceFrame && (
        <DeviceFrame url="smart-routing.example.com">
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
        <div class="max-w-lg mx-auto w-full">
          <WaitingScreen webhooks={panel.webhooks} />
        </div>
      )}

      {/* Review screen: displays income or income_insights report based on method.
          Documents method renders the link-based VoieReport from docsReport state. */}
      {screen === 'review' && (
        <div class="max-w-lg mx-auto w-full">
          <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
          <p class="text-sm text-gray-500 mb-7">{selectedMethod?.name} verification</p>
          {isDocumentsMethod ? (
            docsLoading ? (
              <div class="text-center py-10"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
            ) : (
              <div>
                {docsReport && <VoieReport report={docsReport} />}
                {docsError && <p class="text-sm text-red-500 mb-4">Income report unavailable. Try starting over.</p>}
                <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                  <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
                </div>
              </div>
            )
          ) : reports && !reportLoading ? (
            <div>
              {reports.income_insights && <IncomeInsightsReport report={reports.income_insights} />}
              {reports.income && <VoieReport report={reports.income} />}
              <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
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
