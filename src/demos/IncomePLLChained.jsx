/**
 * FILE SUMMARY: Consumer Credit: Income + Paycheck-Linked Loans (chained orders) demo.
 * INTEGRATION PATTERN: Orders flow with two linked orders (VOIE then PLL) sharing
 *                     order_number + company_mapping_id so the borrower's payroll
 *                     auth carries forward and they don't re-authenticate.
 *
 * DATA FLOW:
 *   1. GET /api/voie-pll/coverage/:cmid          : pre-check PLL coverage + max_number
 *   2. POST /api/voie-pll/voie-order             : create VOIE order, return bridge_token
 *   3. TruvBridge.init().open()                  : Bridge popup for payroll login
 *   4. Webhook: task-status-updated (done)       : VOIE task completed
 *   5. GET /api/voie-pll/decision/:voieOrderId   : read bank_accounts + is_dds_supported
 *   6. POST /api/voie-pll/pll-order/:voieOrderId : create linked PLL order
 *   7. TruvBridge.init().open()                  : Bridge popup for PLL confirmation
 *   8. Webhook: task-status-updated (done)       : PLL task completed
 *   9. GET /api/voie-pll/pll-report/:pllOrderId  : final deposit-switch report
 *
 * Decision gates that send the borrower to a manual path before stranding them:
 *   - coverage: low/unsupported/null
 *   - bank_accounts: any deposit_type === "percent"
 *   - bank_accounts.length >= features.deposit_switch.max_number
 *   - is_dds_supported === false
 *
 * Scaffolding: ./scaffolding/income-pll-chained.jsx
 * Diagrams:    ../diagrams/income-pll-chained.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - checkCoverage()    : GET /v1/companies/{cmid}?product_type=pll for the first decision gate
 *   - startVoieOrder()   : creates a VOIE order with a stable order_number + company_mapping_id
 *   - fetchDecision()    : reads bank_accounts and is_dds_supported for the remaining gates
 *   - startPllOrder()    : creates the linked PLL order with the SAME order_number + company_mapping_id
 *   - openBridge()       : opens TruvBridge with isOrder=true for both VOIE and PLL bridge tokens
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API utilities ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, parsePayload } from '../components/index.js';

// --- Imports: report display component (re-used from the standalone PLL demo) ---
import { PLLReport } from '../components/reports/PLLReport.jsx';

// --- Imports: reusable form component ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/income-pll-chained.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/income-pll-chained.jsx';

// Screens form a forward-only flow: never roll back from a later phase to an earlier one.
const SCREEN_FLOW = ['select', 'coverage', 'voie-waiting', 'decision', 'pll-waiting', 'review', 'manual'];
const atLeastScreen = (current, target) =>
  SCREEN_FLOW.indexOf(current) >= SCREEN_FLOW.indexOf(target) ? current : target;

// --- Component: IncomePLLChainedDemo ---
export function IncomePLLChainedDemo() {
  // Component state: screen phase + each step's persisted result
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [voieOrder, setVoieOrder] = useState(null);
  const [decision, setDecision] = useState(null);
  const [pllOrder, setPllOrder] = useState(null);
  const [pllReport, setPllReport] = useState(null);
  const [pllError, setPllError] = useState(null);
  const [manualReason, setManualReason] = useState(null);
  const [loading, setLoading] = useState(false);

  // Refs: idempotency guards so webhook polling doesn't re-trigger fetches.
  // bridgeInstanceRef holds the active TruvBridge instance so onSuccess can close it.
  const decisionFetchedRef = useRef(false);
  const reportFetchedRef = useRef(false);
  const bridgeInstanceRef = useRef(null);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Derive sidebar Guide step from screen so the panel never desyncs.
  useEffect(() => {
    const stepByScreen = { select: 0, coverage: 0, 'voie-waiting': 2, decision: 3, 'pll-waiting': 4, review: 5, manual: 0 };
    setCurrentStep(stepByScreen[screen] ?? 0);
  }, [screen]);

  // Start polling as soon as the user opens the form so pre-order calls
  // (employer search, coverage pre-check) appear in the API panel in real time.
  // Uses a sentinel userId — the SQL fallback `user_id IS NULL AND session_id = ?`
  // returns session-scoped logs even though the sentinel never matches a real row.
  // startPolling gets called again later with the real userId once VOIE creates one.
  useEffect(() => {
    if (showForm) startPolling('_pre_order_');
  }, [showForm]);

  // Effect: when task-status-updated:done arrives during voie-waiting, fetch the
  // decision payload and either advance to the decision screen or to manual route.
  useEffect(() => {
    if (screen !== 'voie-waiting' || !voieOrder?.order_id || decisionFetchedRef.current) return;
    const doneWh = panel.webhooks.find(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (!doneWh) return;
    decisionFetchedRef.current = true;
    fetchDecision(voieOrder.order_id);
  }, [panel.webhooks, screen, voieOrder]);

  // Effect: when task-status-updated:done arrives during pll-waiting, fetch the
  // final PLL report and advance to the review screen.
  useEffect(() => {
    if (screen !== 'pll-waiting' || !pllOrder?.order_id || reportFetchedRef.current) return;
    // PLL completes with a *second* task-status-updated:done webhook for the new
    // PLL link. Pick the latest one — earlier "done" entries belong to the VOIE task.
    const doneEvents = panel.webhooks.filter(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (doneEvents.length < 2) return;
    reportFetchedRef.current = true;
    fetchPllReport(pllOrder.order_id);
  }, [panel.webhooks, screen, pllOrder]);

  // Step 1: pre-check coverage. The result is advisory — the user can always
  // proceed. If no employer was selected on the form, skip the API call entirely
  // and let Bridge prompt the borrower to pick one during VOIE auth.
  async function checkCoverage(data) {
    setFormData(data);
    setScreen('coverage');
    if (!data.company_mapping_id) {
      setCoverage({ skipped: true, name: data.employer || null });
      return;
    }
    setLoading(true);
    try {
      const url = `${API_BASE}/api/voie-pll/coverage/${encodeURIComponent(data.company_mapping_id)}?session_id=${encodeURIComponent(sessionId)}`;
      const resp = await fetch(url);
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setCoverage(result);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Step 2 + 3: create the VOIE order and immediately open Bridge. Bridge's
  // onSuccess callback drives the transition to the decision screen — the
  // webhook-based useEffect remains as a backup if onSuccess doesn't fire.
  async function startVoieOrder() {
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/voie-pll/voie-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData?.first_name,
          last_name: formData?.last_name,
          company_mapping_id: formData?.company_mapping_id,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }
      setVoieOrder(data);
      startPolling(data.user_id);
      openBridge(data.bridge_token, () => {
        decisionFetchedRef.current = true;
        // Truv needs a moment after onSuccess to populate link_id + bank_accounts.
        setTimeout(() => fetchDecision(data.order_id), 1500);
      });
      setScreen('voie-waiting');
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Step 5: read decision-gate fields from the VOIE order + link. The result is
  // shown on the handoff screen as supporting data with warnings — never blocks.
  // The user always lands on 'decision' so they can choose to pause or continue.
  // Retries with backoff because Truv may not have populated link_id or
  // bank_accounts on the order in the first second or two after Bridge succeeds.
  async function fetchDecision(voieOrderId, attempt = 0) {
    try {
      const resp = await fetch(`${API_BASE}/api/voie-pll/decision/${encodeURIComponent(voieOrderId)}`);
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); return; }
      // If link_id isn't on the order yet, the order is still being processed.
      // Retry up to 6 times (~12s total) before showing whatever we have.
      if (!data.link_id && attempt < 6) {
        setTimeout(() => fetchDecision(voieOrderId, attempt + 1), 2000);
        return;
      }
      setDecision(data);
      setScreen(prev => atLeastScreen(prev, 'decision'));
    } catch (e) { console.error(e); }
  }

  // Step 6 + 7: create the linked PLL order (sharing order_number + cmid with VOIE)
  // and open Bridge again. Same payroll session — borrower confirms without re-auth.
  async function startPllOrder() {
    if (!voieOrder?.order_id) return;
    setLoading(true);
    try {
      // Pass the cmid from the decision payload — covers the case where VOIE was
      // created without an employer and the borrower picked one inside Bridge.
      const resp = await fetch(`${API_BASE}/api/voie-pll/pll-order/${encodeURIComponent(voieOrder.order_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_mapping_id: decision?.company_mapping_id || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }
      setPllOrder(data);
      openBridge(data.bridge_token, () => {
        reportFetchedRef.current = true;
        setTimeout(() => fetchPllReport(data.order_id), 1500);
      });
      setScreen('pll-waiting');
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Step 9: fetch the final PLL deposit-switch report and stop polling.
  // Retries until the underlying PLL link's report is ready (link_id has been
  // attached to the order). This avoids any dependency on webhook delivery.
  async function fetchPllReport(pllOrderId, attempt = 0) {
    try {
      const resp = await fetch(`${API_BASE}/api/voie-pll/pll-report/${encodeURIComponent(pllOrderId)}`);
      const data = await resp.json();
      if (resp.ok && !data.link_id && attempt < 6) {
        setTimeout(() => fetchPllReport(pllOrderId, attempt + 1), 2000);
        return;
      }
      if (resp.ok) {
        setPllReport(data);
      } else {
        // Surface the error instead of advancing to review with a null report,
        // which would render an endless spinner. The user sees what failed and
        // can restart, contact support, or check the API panel.
        setPllError(data?.error || `Failed to load PLL report (${resp.status})`);
      }
    } catch (e) {
      console.error(e);
      setPllError(e?.message || 'Network error while loading PLL report');
    }
    setScreen(prev => atLeastScreen(prev, 'review'));
    pollOnceAndStop();
  }

  // Reusable Bridge popup launcher. Used for both the VOIE and PLL bridge tokens.
  // isOrder=true tells Bridge the token is order-scoped. The instance reference is
  // held in a ref so onSuccess can call .close() and dismiss the success screen.
  // onSuccessCallback drives the next step directly off the SDK callback so the
  // flow doesn't depend on webhook delivery (which may not reach this backend).
  function openBridge(bridgeToken, onSuccessCallback) {
    if (!bridgeToken || !window.TruvBridge) return;
    const opts = {
      bridgeToken,
      isOrder: true,
      onLoad: () => addBridgeEvent('onLoad()', null),
      onSuccess: (publicToken, meta) => {
        addBridgeEvent('onSuccess(publicToken, meta)', [
          { label: 'publicToken', value: publicToken },
          { label: 'meta', value: meta },
        ]);
        // Close the popup so the borrower returns to the demo immediately
        // instead of staring at the "verification completed" success screen.
        try { bridgeInstanceRef.current?.close(); } catch {}
        if (onSuccessCallback) onSuccessCallback();
      },
      onEvent: (type, payload) => {
        const payloadStr = payload ? 'payload' : 'undefined';
        addBridgeEvent(`onEvent("${type}", ${payloadStr})`, payload ? [{ label: 'payload', value: payload }] : null);
      },
      onClose: () => addBridgeEvent('onClose()', null),
    };
    bridgeInstanceRef.current = window.TruvBridge.init(opts);
    bridgeInstanceRef.current.open();
  }

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    decisionFetchedRef.current = false;
    reportFetchedRef.current = false;
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setCoverage(null);
    setVoieOrder(null);
    setDecision(null);
    setPllOrder(null);
    setPllReport(null);
    setPllError(null);
    setManualReason(null);
  }

  // Derived state: layout flag
  const isIntro = screen === 'select' && !showForm;

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Income + PLL" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro slide: architecture diagram on the right */}
        {screen === 'select' && !showForm && (
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={INTRO_SLIDE_CONFIG.title}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        )}

        {/* Application form: collects PII + employer with product_type=pll for ranking */}
        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={checkCoverage} submitting={loading} productType="pll" />
        )}

        {/* Coverage screen: pre-check result + button to proceed to VOIE order */}
        {screen === 'coverage' && (
          <CoverageScreen coverage={coverage} loading={loading} onContinue={startVoieOrder} />
        )}

        {/* VOIE waiting: webhook polling spinner until VOIE task completes */}
        {screen === 'voie-waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Decision review: bank_accounts + is_dds_supported, button to proceed to PLL */}
        {screen === 'decision' && (
          <DecisionScreen decision={decision} onContinue={startPllOrder} loading={loading} />
        )}

        {/* PLL waiting: webhook polling spinner until PLL task completes */}
        {screen === 'pll-waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review screen: PLL deposit allocation report */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">{REPORT_HEADER.title}</h2>
            <p class="text-sm text-gray-500 mb-7">{REPORT_HEADER.subtitle}</p>
            <ReviewBody report={pllReport} error={pllError} userId={pllOrder?.user_id || voieOrder?.user_id} onReset={resetDemo} />
          </div>
        )}

        {/* Manual route: shown when any decision gate fails */}
        {screen === 'manual' && <ManualRouteScreen reason={manualReason} onReset={resetDemo} />}
      </div>
    </Layout>
  );
}

// --- Sub-components ---

function CoverageBadge({ coverage }) {
  const colors = {
    high: 'bg-success-bg text-success',
    medium: 'bg-warning-bg text-warning',
    low: 'bg-red-50 text-red-500',
    unsupported: 'bg-red-50 text-red-500',
  };
  const cls = colors[coverage] || 'bg-gray-100 text-gray-500';
  return <span class={`text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${cls}`}>{coverage || 'unknown'}</span>;
}

function InternalCallout() {
  return (
    <div class="bg-[#f5f5f7] border border-[#e8e8ed] rounded-2xl p-4 mb-6 flex gap-3 items-start">
      <svg class="w-4 h-4 text-[#86868b] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <div class="text-xs text-gray-600 leading-relaxed">
        <span class="font-semibold text-gray-700">Internal-only step.</span> The borrower wouldn't see this in production — it represents the backend coverage pre-check that decides whether to create a Truv order or route to a manual path.
      </div>
    </div>
  );
}

function CoverageScreen({ coverage, loading, onContinue }) {
  if (!coverage) {
    return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /><p class="text-sm text-gray-500 mt-4">Checking PLL coverage...</p></div>;
  }

  // No employer was selected — skip the coverage card and let Bridge prompt for one.
  if (coverage.skipped) {
    return (
      <div>
        <h2 class="text-2xl font-bold tracking-tight mb-1.5">No employer selected</h2>
        <p class="text-sm text-gray-500 mb-7">The borrower will search for and pick their employer inside Bridge during the VOIE step. Coverage will be evaluated after they connect.</p>
        <InternalCallout />
        <button onClick={onContinue} disabled={loading} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
          {loading ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create VOIE order & open Bridge'}
        </button>
      </div>
    );
  }

  // Coverage is "bad" only when it's an explicit low/unsupported. Null = Truv has
  // no data on this combo yet, treated as unknown — the order can still proceed.
  const isBadCoverage = coverage.success_rate === 'low' || coverage.success_rate === 'unsupported';
  const depositTypes = Array.isArray(coverage.deposit_types) ? coverage.deposit_types.join(', ') : null;

  return (
    <div>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Coverage pre-check</h2>
      <p class="text-sm text-gray-500 mb-5">Truv's PLL support for <strong>{coverage.name || 'this employer'}</strong>:</p>

      <InternalCallout />

      <div class="border border-gray-200 rounded-2xl p-5 mb-4 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 uppercase tracking-wide">Coverage</span>
          <CoverageBadge coverage={coverage.success_rate} />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 uppercase tracking-wide">Deposit types</span>
          <span class="text-sm font-mono text-gray-900">{depositTypes || '—'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 uppercase tracking-wide">Amount precision</span>
          <span class="text-sm font-mono text-gray-900">{coverage.amount_precision ?? '—'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 uppercase tracking-wide">Percent precision</span>
          <span class="text-sm font-mono text-gray-900">{coverage.percent_precision ?? '—'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 uppercase tracking-wide">Max allocations</span>
          <span class="text-sm font-mono text-gray-900">{coverage.max_number ?? '—'}</span>
        </div>
      </div>

      {isBadCoverage && (
        <div class="bg-warning-bg border border-warning/30 rounded-2xl p-4 mb-6">
          <div class="text-sm font-semibold text-warning mb-1">Production would route to manual</div>
          <div class="text-xs text-gray-600 leading-relaxed">
            Coverage came back as <code class="font-mono">{coverage.success_rate}</code>. In a live integration the recommendation is to send the borrower down a manual path here — but you can proceed for the sandbox demo.
          </div>
        </div>
      )}

      <button onClick={onContinue} disabled={loading} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
        {loading ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (isBadCoverage ? 'Continue anyway' : 'Create VOIE order & open Bridge')}
      </button>
    </div>
  );
}

function DecisionScreen({ decision, onContinue, loading }) {
  if (!decision) {
    return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /><p class="text-sm text-gray-500 mt-4">Reading bank accounts and link info...</p></div>;
  }
  const ddsLabel = decision.is_dds_supported === true ? 'true' : decision.is_dds_supported === false ? 'false' : 'null';
  const ddsClass = decision.is_dds_supported === false ? 'text-red-500' : decision.is_dds_supported === true ? 'text-success' : 'text-gray-500';
  const wouldRouteManual = !decision.decision?.proceed;

  return (
    <div>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Income verification complete</h2>
      <p class="text-sm text-gray-500 mb-5 leading-relaxed">
        The borrower authenticated with their payroll provider. That session is now linked to <code class="font-mono text-xs bg-[#f5f5f7] px-1 py-0.5 rounded">order_number</code> — when you create the PLL order with the same value, they'll confirm the deduction without re-authenticating.
      </p>

      {/* Two-path handoff callout — emphasizes integrator flexibility */}
      <div class="border border-primary/30 bg-[#f5f8ff] rounded-2xl p-5 mb-5">
        <div class="text-[12px] font-bold uppercase tracking-[0.08em] text-primary mb-3">What's next is up to you</div>
        <div class="space-y-3 text-sm text-[#1d1d1f] leading-relaxed">
          <div class="flex gap-2.5">
            <span class="text-primary font-bold mt-0.5">→</span>
            <div>
              <span class="font-semibold">Continue straight into PLL.</span> Click below to create the linked PLL order, reopen Bridge, and have the borrower confirm the deduction now.
            </div>
          </div>
          <div class="flex gap-2.5">
            <span class="text-primary font-bold mt-0.5">→</span>
            <div>
              <span class="font-semibold">Or pause here in your own UI.</span> Collect more borrower info, run underwriting, fetch the income report, send a notification — then create the PLL order whenever you're ready. Same <code class="font-mono text-xs bg-white px-1 py-0.5 rounded border border-[#e8e8ed]">order_number</code> + <code class="font-mono text-xs bg-white px-1 py-0.5 rounded border border-[#e8e8ed]">company_mapping_id</code> keep the payroll session linked.
            </div>
          </div>
        </div>
      </div>

      {/* Decision-gate data — supporting info, the backend's check before proceeding */}
      <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">Decision-gate data (backend pre-check)</div>
      <div class="border border-gray-200 rounded-2xl p-5 mb-4">
        <div class="text-xs text-gray-400 uppercase tracking-wide mb-3">Bank accounts on file</div>
        {decision.bank_accounts?.length ? (
          <div class="space-y-2">
            {decision.bank_accounts.map((a, i) => (
              <div key={i} class="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                <span class="font-mono text-gray-500">{a.account_number_mask || `account_${i + 1}`}</span>
                <span class={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${a.deposit_type === 'percent' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
                  {a.deposit_type}{a.deposit_value ? ` · ${a.deposit_value}` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div class="text-sm text-gray-400">No allocations returned.</div>
        )}
        {typeof decision.max_number === 'number' && (
          <div class="text-xs text-gray-400 mt-3">Provider max: {decision.max_number} allocations</div>
        )}
      </div>

      <div class="border border-gray-200 rounded-2xl p-5 mb-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs text-gray-400 uppercase tracking-wide mb-1">is_dds_supported</div>
            <div class="text-xs text-gray-500">Truv's verdict on this borrower + provider combo</div>
          </div>
          <span class={`text-sm font-mono font-semibold ${ddsClass}`}>{ddsLabel}</span>
        </div>
      </div>

      {wouldRouteManual && (
        <div class="bg-warning-bg border border-warning/30 rounded-2xl p-4 mb-6">
          <div class="text-sm font-semibold text-warning mb-1">Production would route to manual</div>
          <div class="text-xs text-gray-600 leading-relaxed">
            One of the gates flagged: <code class="font-mono">{(decision.decision?.reasons || []).filter(r => r && !r.endsWith('_ok') && !r.endsWith('_supported') && r !== 'dds_unknown').join(', ') || 'unknown'}</code>. In a live integration this is where you'd send the borrower down a manual path — proceed for the demo.
          </div>
        </div>
      )}

      {decision._raw?.order && (
        <details class="mb-6">
          <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Raw GET /v1/orders/{`{id}`}/ response</summary>
          <pre class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-72 whitespace-pre-wrap mt-2">{JSON.stringify(decision._raw.order, null, 2)}</pre>
        </details>
      )}

      <button onClick={onContinue} disabled={loading} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
        {loading ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (wouldRouteManual ? 'Continue to PLL anyway' : 'Continue to PLL')}
      </button>
    </div>
  );
}

function ReviewBody({ report, error, userId, onReset }) {
  if (error) {
    return (
      <div>
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div class="text-sm font-semibold text-red-500 mb-1">Couldn't load PLL report</div>
          <div class="text-xs text-gray-600 mb-2">{error}</div>
          {userId && <a href={`${API_BASE}/api/voie-pll/tasks/${userId}`} target="_blank" class="text-xs text-primary font-medium">View raw tasks →</a>}
        </div>
        <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
          <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={onReset}>Start Over</button>
        </div>
      </div>
    );
  }
  if (!report) {
    return <div class="text-center py-10"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;
  }
  const failedTask = (report.tasks || []).find(t => t.status && t.status !== 'done');
  return (
    <div>
      {report.pll_report && <PLLReport report={report.pll_report} />}
      {failedTask && (
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 mt-4">
          <div class="text-sm font-semibold text-red-500 mb-1">Task failed: {failedTask.status}</div>
          <div class="text-xs text-gray-500 mb-2">{failedTask.error_message || 'See task list for details.'}</div>
          {userId && <a href={`${API_BASE}/api/voie-pll/tasks/${userId}`} target="_blank" class="text-xs text-primary font-medium">View raw tasks →</a>}
        </div>
      )}
      {!report.pll_report && !failedTask && <p class="text-sm text-gray-500 mt-4">PLL report unavailable. Try starting over.</p>}
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={onReset}>Start Over</button>
      </div>
    </div>
  );
}

function ManualRouteScreen({ reason, onReset }) {
  return (
    <div class="text-center py-12">
      <div class="w-12 h-12 mx-auto mb-5 rounded-full bg-warning-bg flex items-center justify-center">
        <svg class="w-6 h-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
      </div>
      <h2 class="text-2xl font-bold tracking-tight mb-2">Route to manual path</h2>
      <p class="text-sm text-gray-500 max-w-md mx-auto mb-2">
        Truv either can't support this employer for PLL or the borrower's payroll config blocks an auto-deposit-switch.
      </p>
      <p class="text-xs text-gray-400 font-mono mb-7">Reason: {reason || 'unknown'}</p>
      <p class="text-xs text-gray-500 max-w-md mx-auto mb-8">
        Failing here (instead of in Bridge) is the whole point of the pre-checks — you don't strand the borrower mid-flow.
      </p>
      <button onClick={onReset} class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary">Start Over</button>
    </div>
  );
}
