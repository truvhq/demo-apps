/**
 * FILE SUMMARY: Public Sector: Renewals & Data Refresh demo.
 * INTEGRATION PATTERN: Orders flow, then data refresh on the connections they made.
 *
 * DATA FLOW:
 *   1. POST /api/orders                          : one order per applicant (intake)
 *   2. Bridge in the preview iframe              : applicant connects payroll or bank
 *   3. POST /api/renewals/refresh/:orderId       : recertification, server-side
 *   4. GET  /api/renewals/outcome/:refreshOrderId: resolve silent-success vs re-auth
 *   5. Bridge again, only for the failures       : applicant clears MFA, order completes
 *   6. GET  /api/users/:userId/reports/:type     : refreshed report
 *
 * WHY THIS DEMO EXISTS: a refresh has two outcomes that look nothing alike on the
 * wire. When the authenticated session is still valid, the refresh order completes by
 * itself and emits `order-status-updated: completed`. When it needs the applicant,
 * the refresh TASK fails and the order's `completed_at` stays null, so no
 * completion arrives for that connection. `order-refresh-failed` is the webhook
 * that reports the failure (the reason and the stable link_id are on the task).
 *
 * Careful with the general claim, though: `order-status-updated` is emitted PER
 * SUBORDER and carries an `employer_id` (verified 2026-09-17, see
 * REFRESH-FINDINGS.md). Each applicant here has a single connection, so a failure
 * does look like silence. On an order with several employers you still receive
 * `completed` for each one that worked — so "watch for silence" is the wrong
 * detector, and a `completed` does not mean the refresh as a whole succeeded.
 *
 * TIMING NOTE (measured in sandbox, 2026-08-19/20): failures arrive 0.2-5.5s after
 * the refresh POST, silent successes take ~13-15s. The failure therefore usually
 * resolves before the screen that wants to show it has even mounted. So the watch
 * screen renders from recorded state (see classifyRefreshOutcome on the server) and
 * reveals rows on a timer, instead of trying to observe live transitions.
 *
 * Scaffolding: ./scaffolding/renewals-refresh.jsx
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - refreshCase()        : POST to the order's own path to create a refresh
 *   - pollOutcomes()       : resolve a refresh without relying on webhooks alone
 *   - the reauth screen    : reuse the FAILED refresh order's own bridge_token
 *   - OUTCOME_DISPLAY      : branch on `status`, not on the event type
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WebhookFeed, usePanel, API_BASE, Walkthrough } from '../components/index.js';
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display components ---
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';

// --- Imports: scaffolding (caseload, guide steps, walkthrough stages, copy) ---
import { CASELOAD, STEPS, WALKTHROUGH_STAGES, OUTCOME_DISPLAY, REASON_COPY } from './scaffolding/renewals-refresh.jsx';

const DEMO_ID = 'renewals-refresh';

// Screen order. Forward-only in practice, but the presenter can step back to the
// renewals desk from the results screen via Start Over.
const SCREENS = ['walkthrough', 'setup', 'renewals', 'watch', 'reauth', 'results'];

// How often the watch screen asks the server to resolve each refresh.
const OUTCOME_POLL_MS = 3000;
// Gap between revealing one resolved row and the next, so the divergence reads as
// a sequence on screen instead of everything flipping at once.
const REVEAL_STAGGER_MS = 900;
// Truv rejects a refresh for a short while after Bridge finishes, because the order
// reads complete before its connections are refresh-eligible. Retry instead of
// asking the presenter to do it by hand.
const REFRESH_RETRY_MS = 4000;
const REFRESH_RETRY_MAX = 12;
// After this many outcome polls with no result, say so instead of spinning silently.
const SLOW_AFTER_POLLS = 60;

const STAGES = WALKTHROUGH_STAGES;

// --- Helper: small status pill used across the renewals and watch tables ---
function StatusPill({ tone, children }) {
  const cls = {
    good: 'text-[#167A50] bg-green-50',
    warn: 'text-[#8A6200] bg-amber-50',
    pending: 'text-[#666670] bg-[#f5f5f7]',
    neutral: 'text-[#5b5b60] bg-[#f5f5f7]',
  }[tone] || 'text-[#666670] bg-[#f5f5f7]';
  return <span class={`text-[13px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>{children}</span>;
}

// --- Helper: copy-to-clipboard chip for the scripted sandbox credentials ---
function CredentialChip({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      class="inline-flex items-center gap-1.5 font-mono text-[12px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#000000] px-2 py-0.5 rounded border border-[#d2d2d7] transition-colors"
      title={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }).catch(() => {});
      }}
    >
      {value}
      <span class="text-[10px] text-[#666670]">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

// --- Helper: the callout that names the anti-pattern this demo is about ---
function StuckAtSentCallout() {
  const code = 'font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]';
  return (
    <div class="border border-[#8A6200]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] leading-[1.55] text-[#000000]">
      <div class="font-semibold mb-1">For your IT team: why a failed refresh is easy to miss</div>
      <p class="text-[#5b5b60]">
        A refresh that needs the applicant does not announce itself. The case just stays unfinished. The webhook
        that reports it is <code class={code}>order-refresh-failed</code>, which carries a status such as{' '}
        <code class={code}>mfa_error</code> (the error text is on the task). On a case with several employers, the
        connections that worked still send <code class={code}>completed</code>, so silence is the wrong thing to
        watch for. Branch on the status: <code class={code}>no_data</code> and <code class={code}>unavailable</code> fire
        the same event but cannot be fixed by the applicant signing in again, so do not ask them to do anything.
      </p>
    </div>
  );
}

// Survive a page reload mid-demo. Cleared when the demo unmounts (leaving for the
// hub, breadcrumb restart) or on Start Over, so re-entering always starts fresh.
const STORE_KEY = 'truv_renewals_refresh_state';
const RUNTIME_FIELDS = ['order', 'refresh', 'outcome', 'revealed', 'refreshDetail', 'reauthDone', 'failedReason', 'connectedAt', 'slow'];

function loadSaved() {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    return v && Array.isArray(v.cases) ? v : null;
  } catch { return null; }
}

function seedCases(saved) {
  return CASELOAD.map(c => {
    const base = { ...c, order: null, refresh: null, outcome: null, revealed: false };
    const prev = saved?.cases.find(x => x.id === c.id);
    if (!prev) return base;
    const merged = { ...base };
    for (const k of RUNTIME_FIELDS) if (prev[k] !== undefined) merged[k] = prev[k];
    // Anything already resolved was revealed before the reload; the queue that
    // reveals rows one at a time does not survive it.
    if (merged.outcome && merged.outcome.state !== 'refreshing') merged.revealed = true;
    return merged;
  });
}

// What actually told us how this refresh ended, in words a reader can follow.
function detectedBy(c) {
  if (c.reauthDone && c.outcome?.state === 'refreshed') {
    return `failed${c.failedReason ? ` (${c.failedReason})` : ''}, then the applicant cleared the challenge`;
  }
  switch (c.outcome?.source) {
    case 'order-refresh-failed': return 'order-refresh-failed';
    case 'task': return 'refresh task status';
    case 'suborder': return 'connection status (last_task_status)';
    default: return 'order status';
  }
}

// --- Component: RenewalsRefreshDemo ---
export function RenewalsRefreshDemo() {
  const [saved] = useState(loadSaved);
  const [screen, setScreen] = useState(saved?.screen && saved.screen !== 'walkthrough' ? saved.screen : 'walkthrough');
  const [showOptional, setShowOptional] = useState(!!saved?.showOptional);

  // Runtime state per applicant, keyed by the seed id. Seeded from CASELOAD and
  // extended with order ids, refresh ids and resolved outcomes as the demo runs.
  const [cases, setCases] = useState(() => seedCases(saved));

  // Which case is currently inside Bridge, and for which purpose.
  const [active, setActive] = useState(null); // { id, mode: 'connect' | 'reauth', bridgeToken }
  const [busy, setBusy] = useState(null);     // case id with an in-flight request
  const [error, setError] = useState(null);
  const [reports, setReports] = useState({}); // caseId -> { income?, assets? }

  const iframeRef = useRef(null);
  const completedRef = useRef(false);
  const revealQueueRef = useRef([]);
  const pollCountRef = useRef({});
  const runRef = useRef(0); // bumped on Start Over so a pending retry cannot touch the fresh state

  // Panel hook: sidebar (Guide / API / Bridge / Webhooks) + per-user polling.
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset: resetPanel } = usePanel();

  const visibleCases = cases.filter(c => !c.optional || showOptional);
  // Connected means the applicant finished Bridge, not merely that an order exists.
  const connected = visibleCases.filter(c => c.order && c.connectedAt);
  const refreshed = visibleCases.filter(c => c.refresh);
  const needsReauth = refreshed.filter(c => c.revealed && c.outcome?.state === 'reauth_required');
  const allResolved = refreshed.length > 0 && refreshed.every(c => c.revealed && c.outcome && c.outcome.state !== 'refreshing');

  useEffect(() => {
    try {
      if (screen === 'walkthrough' && !cases.some(c => c.order)) { sessionStorage.removeItem(STORE_KEY); return; }
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        screen, showOptional,
        cases: cases.map(c => ({ id: c.id, ...Object.fromEntries(RUNTIME_FIELDS.map(k => [k, c[k]])) })),
      }));
    } catch { /* storage unavailable: the demo still works, it just will not survive a reload */ }
  }, [screen, showOptional, cases]);

  useEffect(() => () => { try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }, []);

  useEffect(() => {
    document.title = 'Renewals & Data Refresh | Truv Demo Apps';
  }, []);

  // When the view swaps (screen change, Bridge closing), put keyboard focus on the new heading.
  useEffect(() => {
    if (!active && screen !== 'walkthrough') document.querySelector('[data-screen-heading]')?.focus({ preventScroll: true });
  }, [screen, active]);

  // Keep the sidebar step indicator in step with the screen.
  useEffect(() => {
    const stepMap = { walkthrough: 0, setup: 0, renewals: 1, watch: 2, reauth: 3, results: 4 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen, setCurrentStep]);

  // Point the panel's webhook feed at the most instructive user for the current
  // screen. The panel inspects one Truv user at a time, and this demo creates one
  // per applicant, so during the watch and reauth screens we follow whichever
  // applicant's refresh failed. That is the feed where `order-refresh-failed`
  // actually shows up.
  useEffect(() => {
    if (screen !== 'watch' && screen !== 'reauth') return;
    const focus = needsReauth[0] || refreshed[0];
    if (focus?.order?.user_id) startPolling(focus.order.user_id);
  }, [screen, needsReauth.length, refreshed.length, startPolling]);

  // Update one case by id.
  const patchCase = useCallback((id, patch) => {
    setCases(prev => prev.map(c => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)));
  }, []);

  // --- Step 1: intake. Create the applicant's original order, then open Bridge. ---
  async function connectCase(c) {
    // An order exists but Bridge was not finished: reopen it rather than create another.
    if (c.order?.bridge_token && !c.connectedAt) {
      completedRef.current = false;
      if (c.order.user_id) startPolling(c.order.user_id);
      setActive({ id: c.id, mode: 'connect', bridgeToken: c.order.bridge_token });
      return;
    }
    setBusy(c.id);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: c.products,
          demo_id: DEMO_ID,
          first_name: c.firstName,
          last_name: c.lastName,
          // Pre-selects the employer for payroll connections so the applicant lands
          // straight on the login screen. Bank connections have no equivalent
          // pre-selection, so the applicant searches for "Truv Bank" in Bridge.
          ...(c.connectorKind === 'payroll' ? { employer: c.connector } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Could not create the order'); setBusy(null); return; }
      patchCase(c.id, { order: data });
      if (data.user_id) startPolling(data.user_id);
      completedRef.current = false;
      setActive({ id: c.id, mode: 'connect', bridgeToken: data.bridge_token });
    } catch (e) {
      console.error(e);
      setError('Network error while creating the order.');
    }
    setBusy(null);
  }

  // --- Step 3: recertification. Refresh one applicant's existing connection. ---
  // Returns true when a refresh order was created.
  async function refreshCase(c) {
    if (!c.order || c.refresh) return false;
    const run = runRef.current;
    setBusy(c.id);
    setError(null);
    try {
      for (let attempt = 0; ; attempt++) {
        const resp = await fetch(`${API_BASE}/api/renewals/refresh/${encodeURIComponent(c.order.order_id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: c.products }),
        });
        const data = await resp.json();
        if (run !== runRef.current) return false;
        if (resp.ok) {
          patchCase(c.id, { refresh: data, outcome: { state: 'refreshing' }, revealed: false, waiting: false });
          setBusy(null);
          return true;
        }
        if (data.error === 'no_connections_yet' && attempt < REFRESH_RETRY_MAX) {
          patchCase(c.id, { waiting: true });
          await new Promise(r => setTimeout(r, REFRESH_RETRY_MS));
          if (run !== runRef.current) return false;
          continue;
        }
        patchCase(c.id, { waiting: false });
        // The per-order cap is its own signal, not a generic failure.
        const name = `${c.firstName} ${c.lastName}`;
        const message = data.error === 'no_connections_yet'
          ? 'Still not ready to refresh after about a minute. Check that the applicant clicked Submit connected accounts in the connection window, then try again.'
          : data.error === 'refresh_cap_reached' || data.error === 'refresh_in_progress'
            ? data.message
            : (data.error || 'Could not create the refresh order');
        setError(`${name}: ${message}`);
        setBusy(null);
        return false;
      }
    } catch (e) {
      console.error(e);
      if (run === runRef.current) {
        patchCase(c.id, { waiting: false });
        setError('Network error while refreshing.');
        setBusy(null);
      }
      return false;
    }
  }

  // Refresh everyone who has a connection and has not been refreshed yet. Only move
  // on to the watch screen if at least one refresh exists to watch.
  async function refreshAll() {
    const targets = connected.filter(c => !c.refresh);
    let created = connected.some(c => c.refresh);
    for (const c of targets) created = (await refreshCase(c)) || created;
    if (created) setScreen('watch');
  }

  // --- Step 4: resolve outcomes. Server consults the webhook, then the refresh
  // task, then the order. Runs until every refresh has a terminal state. ---
  const pollOutcomes = useCallback(async () => {
    const pending = cases.filter(c => c.refresh && (!c.outcome || c.outcome.state === 'refreshing'));
    if (!pending.length) return;
    await Promise.all(pending.map(async (c) => {
      pollCountRef.current[c.id] = (pollCountRef.current[c.id] || 0) + 1;
      if (pollCountRef.current[c.id] === SLOW_AFTER_POLLS) patchCase(c.id, { slow: true });
      try {
        const resp = await fetch(`${API_BASE}/api/renewals/outcome/${encodeURIComponent(c.refresh.order_id)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data.outcome || data.outcome.state === 'refreshing') return;
        // Resolved. Queue it for a staggered reveal rather than flipping instantly:
        // failures land in under a second and would otherwise all appear at once,
        // before the viewer has read the row.
        patchCase(c.id, { outcome: data.outcome, refreshDetail: data });
        if (!revealQueueRef.current.includes(c.id)) revealQueueRef.current.push(c.id);
      } catch { /* transient, next tick retries */ }
    }));
  }, [cases, patchCase]);

  useEffect(() => {
    if (screen !== 'watch' && screen !== 'reauth') return;
    pollOutcomes();
    const t = setInterval(pollOutcomes, OUTCOME_POLL_MS);
    return () => clearInterval(t);
  }, [screen, pollOutcomes]);

  // Drain the reveal queue one row at a time.
  useEffect(() => {
    if (screen !== 'watch' && screen !== 'reauth') return;
    const t = setInterval(() => {
      const next = revealQueueRef.current.shift();
      if (next) patchCase(next, { revealed: true });
    }, REVEAL_STAGGER_MS);
    return () => clearInterval(t);
  }, [screen, patchCase]);

  // --- Step 5: re-engage. Reuse the FAILED refresh order's own bridge_token.
  // Bridge skips username and password (the connection is already authorized) and
  // resumes at the challenge that broke the silent refresh. ---
  function reauthCase(c) {
    if (!c.refresh?.bridge_token) return;
    patchCase(c.id, { failedReason: c.outcome?.reason || null });
    completedRef.current = false;
    if (c.order?.user_id) startPolling(c.order.user_id);
    setActive({ id: c.id, mode: 'reauth', bridgeToken: c.refresh.bridge_token });
  }

  // --- Step 6: read the refreshed report for one applicant. ---
  async function loadReport(c) {
    const userId = c.refresh?.user_id || c.order?.user_id;
    if (!userId) return;
    const type = c.products.includes('assets') ? 'assets' : 'income';
    try {
      const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/${type}`);
      const data = await resp.json();
      if (resp.ok) setReports(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [type]: data } }));
    } catch (e) { console.error(e); }
    pollOnceAndStop();
  }

  // Preview-iframe channel. Bridge runs inside /preview.html, never the host page.
  const sendPreview = usePreviewIframe(iframeRef, {
    'bridge:onLoad': () => addBridgeEvent('onLoad()', null),
    'bridge:onEvent': (type, payload, source) => {
      addBridgeEvent(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
      // Order-level COMPLETED is the only safe advance signal: a per-link SUCCESS
      // fires once per product and would advance a multi-product order early.
      if (type === 'COMPLETED' && source === 'order') {
        completedRef.current = true;
        const finishedId = active?.id;
        const mode = active?.mode;
        setActive(null);
        if (!finishedId) return;
        if (mode === 'connect') {
          patchCase(finishedId, { connectedAt: Date.now() });
        } else {
          // A re-authorized refresh completes the refresh order itself. Clear the
          // resolved outcome so the poller re-reads it and the row flips to
          // "Refreshed" from the same state machine as the silent path.
          patchCase(finishedId, { outcome: { state: 'refreshing' }, revealed: false, reauthDone: true });
        }
      }
    },
    'bridge:onSuccess': () => addBridgeEvent('onSuccess()', null),
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      if (!completedRef.current) setActive(null);
    },
  });

  // Drive the iframe from host state.
  useEffect(() => {
    if (!active) return;
    if (active.bridgeToken) sendPreview('bridge', { bridgeToken: active.bridgeToken, isOrder: true, inline: true });
    else sendPreview('loading', { label: 'Preparing verification…' });
  }, [active, sendPreview]);

  function resetDemo() {
    resetPanel();
    revealQueueRef.current = [];
    pollCountRef.current = {};
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    runRef.current += 1;
    setBusy(null);
    setCases(CASELOAD.map(c => ({ ...c, order: null, refresh: null, outcome: null, revealed: false })));
    setActive(null);
    setReports({});
    setError(null);
    setShowOptional(false);
    setScreen('walkthrough');
  }

  // The walkthrough owns the full viewport, so the demo chrome is suppressed there.
  if (screen === 'walkthrough') {
    return (
      <Walkthrough
        stages={STAGES}
        brand={{ product: 'truv', partner: 'Public Sector', dept: 'Renewals and recertification' }}
        onLaunch={() => setScreen('setup')}
        launchLabel="Start the renewal cycle"
        returnKey="truv_twt_renewals_refresh"
      />
    );
  }

  return (
    <Layout badge="Public Sector · Renewals & Data Refresh" steps={STEPS} panel={panel}>

      {/* Bridge lives in the device frame whenever an applicant is acting. */}
      {active && (
        <div class="px-4 pt-3 sm:px-8">
          <button class="text-[13px] text-primary font-medium hover:underline" onClick={() => setActive(null)}>
            &larr; Back without finishing
          </button>
        </div>
      )}
      {active && (
        <DeviceFrame url="benefits.example.gov">
          <iframe
            ref={iframeRef}
            src="/preview.html"
            title="Demo preview"
            class="w-full h-full border-0"
            data-session={sessionId}
          />
        </DeviceFrame>
      )}

      {!active && (
        <div class="max-w-4xl w-full min-w-0 mx-auto px-4 py-6 sm:px-8 sm:py-10">

          {error && (
            <div role="alert" class="mb-5 border border-red-200 bg-red-50 rounded-xl p-4 text-[13px] text-[#7f1d1d]">{error}</div>
          )}

          {/* ---------------- Setup: connect the applicants ---------------- */}
          {screen === 'setup' && (
            <>
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">Connect the applicants</h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-2">
                Each applicant connects an employer or bank, the way they would at intake. Use the test
                login shown on their row. The login decides what happens when the connection is refreshed
                later, so you will see both outcomes.
              </p>
              <p class="text-[13px] text-[#666670] leading-[1.5] mb-5">
                In the window that opens, finish the connection, then click <strong>Submit connected accounts</strong>.
                On a projector or small laptop screen, choose <strong>Desktop</strong> at the top right so every button fits.
              </p>

              <p class="text-[12px] text-[#666670] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#666670] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
                      <th scope="col" class="text-left px-4 py-3">Case</th>
                      <th scope="col" class="text-left px-4 py-3">Connect to</th>
                      <th scope="col" class="text-left px-4 py-3">Test login (sandbox)</th>
                      <th scope="col" class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCases.map(c => (
                      <tr key={c.id} class="border-b border-[#f5f5f7] align-top">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#666670]">{c.program}</div>
                        </td>
                        <td class="px-4 py-3 font-mono text-[12px] text-[#000000]">{c.caseNumber}</td>
                        <td class="px-4 py-3">
                          <div class="text-[#000000]">{c.connector}</div>
                          <div class="text-[12px] text-[#666670]">{c.connectorKind === 'bank' ? 'assets' : 'income'}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1.5 mb-1">
                            <CredentialChip label="username" value={c.credential.username} />
                            <CredentialChip label="password" value={c.credential.password} />
                          </div>
                          <div class="text-[12px] text-[#666670] leading-[1.45] max-w-[260px]">{c.credentialNote}</div>
                        </td>
                        <td class="px-4 py-3 text-right">
                          {c.connectedAt
                            ? <StatusPill tone="good">connected</StatusPill>
                            : (
                              <button
                                class="px-3 py-1.5 text-[13px] font-medium bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
                                disabled={busy === c.id}
                                onClick={() => connectCase(c)}
                              >
                                {busy === c.id ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (c.order ? 'Resume' : 'Connect')}
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                {!showOptional && (
                  <button class="px-4 py-2 text-[13px] font-medium border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] transition-colors" onClick={() => setShowOptional(true)}>
                    Add a third applicant
                  </button>
                )}
                <button
                  class="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
                  disabled={connected.length === 0}
                  onClick={() => setScreen('renewals')}
                >
                  {connected.length === 0 ? 'Connect at least one applicant' : `Continue with ${connected.length} connected`}
                </button>
                {connected.length === 0 && (
                  <span class="text-[13px] text-[#666670]">Click Connect on a row to start.</span>
                )}
              </div>
            </>
          )}

          {/* ---------------- Renewals desk ---------------- */}
          {screen === 'renewals' && (
            <>
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-[#8A6200] bg-amber-50 px-2 py-0.5 rounded">Renewal time</span>
              </div>
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">Recertification is due</h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-5">
                No one has contacted these applicants. Refresh the connections they already made
                and see which ones update without any action from them.
              </p>

              <p class="text-[12px] text-[#666670] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#666670] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
                      <th scope="col" class="text-left px-4 py-3">Connection</th>
                      <th scope="col" class="text-left px-4 py-3">Connected at intake</th>
                      <th scope="col" class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connected.map(c => (
                      <tr key={c.id} class="border-b border-[#f5f5f7]">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#666670] font-mono">{c.caseNumber}</div>
                        </td>
                        <td class="px-4 py-3 text-[#000000]">{c.connector}</td>
                        <td class="px-4 py-3"><StatusPill tone="neutral">{new Date(c.connectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</StatusPill></td>
                        <td class="px-4 py-3 text-right">
                          {c.refresh
                            ? <StatusPill tone="pending">refresh requested</StatusPill>
                            : c.waiting
                            ? <StatusPill tone="pending">waiting for the connection to be ready</StatusPill>
                            : (
                              <button
                                class="px-3 py-1.5 text-[13px] font-medium border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] transition-colors disabled:opacity-40"
                                disabled={busy === c.id}
                                onClick={() => refreshCase(c)}
                              >
                                Refresh
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div class="border border-[#d2d2d7] rounded-xl p-4 mb-5 bg-[#f5f5f7]">
                <div class="text-[13px] font-semibold text-[#666670] uppercase tracking-wide mb-2">What the agency backend sends</div>
                <pre class="text-[12px] font-mono text-[#000000] whitespace-pre-wrap m-0">{[...new Set(connected.map(c => c.products.includes('assets') ? 'assets' : 'income'))]
  .map(p => `POST /v1/orders/{order_id}/\n{ "products": ["${p}"] }   // ${p === 'assets' ? 'bank connections' : 'payroll connections'}`)
  .join('\n\n') || 'POST /v1/orders/{order_id}/\n{ "products": ["income"] }'}</pre>
                <p class="text-[12px] text-[#666670] mt-2 mb-0">
                  Server-side, no applicant contact. Truv returns a new order and refreshes through the
                  applicant's authenticated session. Limited to 3 refreshes per order per 24 hours. If Bridge only just
                  finished, the first attempt can be rejected for a few seconds, so this demo retries.
                </p>
              </div>

              <button
                class="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
                disabled={connected.length === 0 || busy !== null}
                onClick={refreshAll}
              >
                {refreshed.length ? 'Watch the outcomes' : `Refresh all ${connected.length}`}
              </button>
            </>
          )}

          {/* ---------------- Watch: the divergence ---------------- */}
          {(screen === 'watch' || screen === 'reauth') && (
            <>
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">
                {screen === 'watch' ? 'Two outcomes' : 'Re-engage only who needs it'}
              </h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-5">
                {screen === 'watch'
                  ? 'Same call for every applicant. The authenticated session decides what happens next.'
                  : (needsReauth.length
                    ? 'Everyone else is already done. These applicants only need to clear one challenge. For a security challenge they do not re-enter their login.'
                    : 'Every refresh is done. Nobody else needs to be contacted.')}
              </p>

              <div class="space-y-3 mb-6" aria-live="polite">
                {refreshed.map(c => {
                  const state = c.revealed ? (c.outcome?.state || 'refreshing') : 'refreshing';
                  const display = OUTCOME_DISPLAY[state] || OUTCOME_DISPLAY.refreshing;
                  const reason = c.outcome?.reason;
                  const detail = state === 'refreshed' && c.reauthDone
                    ? 'Fresh data returned after the applicant cleared the challenge.'
                    : display.detail;
                  return (
                    <div key={c.id} class="border border-[#d2d2d7] rounded-xl p-4 bg-white">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-medium text-[#000000] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#666670] font-mono">{c.caseNumber}</span>
                            <span class="text-[12px] text-[#666670]">·</span>
                            <span class="text-[12px] text-[#666670]">{c.products.includes('assets') ? 'assets' : 'income'} · {c.connector}</span>
                          </div>
                          <div class="text-[13px] text-[#5b5b60] mt-1.5">
                            {state === 'refreshing'
                              ? detail
                              : <>{detail}{reason ? <> <span class="text-[#666670]">Reason:</span> <code class="font-mono text-[12px] bg-[#f5f5f7] px-1 py-0.5 rounded border border-[#d2d2d7]">{reason}</code>{REASON_COPY[reason] ? `. ${REASON_COPY[reason]}` : ''}</> : null}</>}
                          </div>
                          {c.slow && state === 'refreshing' && (
                            <div class="text-[12px] text-[#8A6200] mt-1">This is taking longer than usual. Still checking.</div>
                          )}
                          {c.outcome?.errorMessage && c.revealed && (
                            <div class="text-[12px] text-[#5b5b60] mt-1 italic">Provider said: “{c.outcome.errorMessage}”</div>
                          )}
                          {c.outcome?.source && c.revealed && (
                            <div class="text-[12px] text-[#666670] mt-1">How we found out: {detectedBy(c)}</div>
                          )}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          {state === 'refreshing' && <span class="inline-block w-3.5 h-3.5 border-2 border-[#d2d2d7] border-t-[#666670] rounded-full animate-spin" />}
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                        </div>
                      </div>

                      {/* Re-auth affordances appear once the row has resolved that way. */}
                      {c.revealed && c.outcome?.state === 'reauth_required' && (
                        <div class="mt-3 pt-3 border-t border-[#f5f5f7]">
                          <div class="text-[12px] font-semibold text-[#666670] uppercase tracking-wide mb-1.5">Link to send the applicant</div>
                          {c.refresh?.share_url && (
                            <a href={c.refresh.share_url} target="_blank" rel="noopener noreferrer" class="text-[12px] text-primary font-mono break-all hover:underline">{c.refresh.share_url}</a>
                          )}
                          <div class="mt-3">
                            <button
                              class="px-3 py-1.5 text-[13px] font-medium bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors"
                              onClick={() => reauthCase(c)}
                            >
                              Complete as the applicant
                            </button>
                            <span class="text-[12px] text-[#666670] ml-2">Demo shortcut: mounts this refresh order's bridge token here so you can act as the applicant. Bridge resumes at the challenge.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {connected.some(c => !c.refresh) && (
                <div class="mb-6 border border-[#8A6200]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] text-[#000000]">
                  {connected.filter(c => !c.refresh).map(c => c.firstName).join(', ')} {connected.filter(c => !c.refresh).length === 1 ? 'was' : 'were'} not refreshed.{' '}
                  <button class="text-primary font-medium hover:underline" onClick={() => setScreen('renewals')}>Back to the renewals list</button>
                </div>
              )}

              {(() => {
                const unexpected = refreshed.filter(c => c.expect === 'reauth' && c.outcome?.state === 'refreshed' && !c.reauthDone);
                if (!allResolved || needsReauth.length > 0 || !unexpected.length) return null;
                return (
                  <div class="mb-6 border border-[#8A6200]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] text-[#000000]">
                    {unexpected.map(c => c.firstName).join(' and ')} refreshed without needing re-authorization. If you expected a
                    failure, they probably kept the pre-filled password (<code class="font-mono text-[12px]">goodpassword</code>),
                    which connects a healthy account. Click Start Over and connect again, this time replacing the password with
                    the test login shown on the setup screen.
                  </div>
                );
              })()}

              {allResolved && needsReauth.length > 0 && <div class="mb-6"><StuckAtSentCallout /></div>}

              {/* Live webhook feed: order-refresh-failed shows up here. */}
              <div class="mb-6">
                <div class="text-[13px] font-medium text-[#000000] mb-1">Webhook events</div>
                <p class="text-[12px] text-[#666670] mb-3">
                  Webhooks only appear here when Truv can reach this server. The outcomes above are read from
                  the order and task records, so they do not depend on them.
                </p>
                <WebhookFeed webhooks={panel.webhooks} />
              </div>

              <div class="flex flex-wrap gap-3">
                {allResolved && needsReauth.length > 0 && screen === 'watch' && (
                  <button class="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors" onClick={() => setScreen('reauth')}>
                    Re-engage {needsReauth.length} applicant{needsReauth.length === 1 ? '' : 's'}
                  </button>
                )}
                {allResolved && (
                  <button
                    class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors"
                    onClick={() => setScreen('results')}
                  >
                    {needsReauth.length ? 'Skip ahead to results' : 'See the refreshed data'}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ---------------- Results ---------------- */}
          {screen === 'results' && (
            <>
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">Refresh results</h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-2">
                {(() => {
                  const alone = refreshed.filter(c => c.outcome?.state === 'refreshed' && !c.reauthDone).length;
                  const after = refreshed.filter(c => c.outcome?.state === 'refreshed' && c.reauthDone).length;
                  const not = refreshed.length - alone - after;
                  return `${alone + after} of ${refreshed.length} refreshed: ${alone} on their own, ${after} after the applicant cleared a challenge${not ? `, ${not} not refreshed` : ''}.`;
                })()}
              </p>
              <p class="text-[13px] text-[#666670] leading-[1.5] mb-5">
                Each completed refresh creates its own order and report. The original order keeps its own report.
                The sandbox returns fixed sample data, so names and figures in the reports will not match the applicants above.
                This demo shows the mechanics with test data. It does not show how often refreshes succeed in production.
              </p>

              <p class="text-[12px] text-[#666670] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-6">
                <table class="w-full min-w-[600px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#666670] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
                      <th scope="col" class="text-left px-4 py-3">How it resolved</th>
                      <th scope="col" class="text-left px-4 py-3">How we found out</th>
                      <th scope="col" class="text-right px-4 py-3">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refreshed.map(c => {
                      const display = OUTCOME_DISPLAY[c.outcome?.state] || OUTCOME_DISPLAY.refreshing;
                      return (
                        <tr key={c.id} class="border-b border-[#f5f5f7]">
                          <td class="px-4 py-3">
                            <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                            <div class="text-[12px] text-[#666670]">{c.products.includes('assets') ? 'assets' : 'income'}</div>
                          </td>
                          <td class="px-4 py-3">
                            <StatusPill tone={display.tone}>{display.label}</StatusPill>
                            {c.reauthDone && c.outcome?.state === 'refreshed' && <div class="text-[12px] text-[#666670] mt-1">after the applicant cleared a challenge</div>}
                          </td>
                          <td class="px-4 py-3 text-[12px] text-[#5b5b60]">{detectedBy(c)}</td>
                          <td class="px-4 py-3 text-right">
                            {c.outcome?.state === 'refreshed'
                              ? (
                                <button class="px-3 py-1.5 text-[13px] font-medium border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] transition-colors" onClick={() => loadReport(c)}>
                                  Load
                                </button>
                              )
                              : <span class="text-[12px] text-[#666670]">not refreshed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {Object.entries(reports).map(([caseId, byType]) => {
                const c = cases.find(x => x.id === caseId);
                return (
                  <div key={caseId} class="border border-[#d2d2d7] rounded-xl p-6 bg-white mb-4">
                    <h3 class="text-lg font-semibold text-[#000000] mb-4">Refreshed report for {c?.firstName} {c?.lastName}</h3>
                    {byType.income && <VoieReport report={byType.income} />}
                    {byType.assets && <AssetsReport report={byType.assets} />}
                  </div>
                );
              })}

              <div class="mb-6"><StuckAtSentCallout /></div>
            </>
          )}

          {screen !== 'setup' && (
            <div class="mt-6 pt-5 border-t border-[#d2d2d7] flex gap-3">
              <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={resetDemo}>Start Over</button>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
