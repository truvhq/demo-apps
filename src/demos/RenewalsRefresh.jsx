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
import { $ } from '../utils/formatters.js';

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
      <div class="font-semibold mb-1">Why a failed refresh is easy to miss</div>
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

// --- Helper: four-step progress strip shown above every screen heading ---
const FLOW = ['Connect', 'Renew', 'Outcomes', 'Results'];
function Stepper({ current }) {
  return (
    <ol aria-label="Progress" class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-[12px] font-medium list-none p-0">
      {FLOW.map((label, i) => {
        const st = i < current ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={label} aria-current={st === 'now' ? 'step' : undefined} class="flex items-center gap-2">
            <span class={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] ${st === 'now' ? 'bg-primary text-white' : st === 'done' ? 'bg-green-100 text-[#167A50]' : 'bg-[#f5f5f7] text-[#666670]'}`}>{st === 'done' ? '✓' : i + 1}</span>
            <span class={st === 'now' ? 'text-[#000000]' : 'text-[#666670]'}>{label}</span>
            {i < FLOW.length - 1 && <span aria-hidden="true" class="w-6 h-px bg-[#d2d2d7]" />}
          </li>
        );
      })}
    </ol>
  );
}

// --- Helper: copies the applicant link instead of printing a very long URL ---
function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={url}
      class="px-3 py-1.5 text-[13px] font-medium border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] transition-colors"
      onClick={() => {
        Promise.resolve(navigator.clipboard?.writeText(url)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
      }}
    >
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}

// --- Helper: the technical material for an IT audience, collapsed by default ---
function ItDetails({ webhooks }) {
  return (
    <details class="mb-6 border border-[#d2d2d7] rounded-xl bg-white">
      <summary class="cursor-pointer px-4 py-3 text-[13px] font-medium text-[#000000]">For your IT team: how a failure shows up</summary>
      <div class="px-4 pb-4">
        <StuckAtSentCallout />
        <div class="text-[13px] font-medium text-[#000000] mt-4 mb-1">Webhook events</div>
        <p class="text-[12px] text-[#666670] mb-3">
          Webhooks only appear here when Truv can reach this server. The outcomes above are read from
          the order and task records, so they do not depend on them.
        </p>
        <WebhookFeed webhooks={webhooks} />
      </div>
    </details>
  );
}

// --- Helper: the few facts worth reading first from a refreshed report ---
function reportFacts(c, data) {
  if (!data) return [];
  if (c.products.includes('assets')) {
    const accounts = (data.links || []).flatMap(l => l.accounts || []);
    return [
      ['Total balance', data.summary?.balance != null ? $(data.summary.balance) : '-'],
      ['Accounts', String(accounts.length)],
      ['As of', data.as_of_date || '-'],
    ];
  }
  const emp = (data.links || []).flatMap(l => l.employments || [])[0];
  if (!emp) return [];
  const stmts = emp.statements || [];
  return [
    ['Employer', emp.company?.name || data.links?.[0]?.provider_name || '-'],
    ['Job title', emp.job_title || '-'],
    ['Annual income', emp.income != null ? $(emp.income) : '-'],
    ['Latest pay date', stmts[0]?.pay_date || '-'],
    ['Pay statements', String(stmts.length)],
  ];
}

function ReportPanel({ c, ui, data }) {
  if (ui.loading) {
    return (
      <div class="flex items-center gap-2 text-[13px] text-[#666670]" aria-live="polite">
        <span class="inline-block w-3.5 h-3.5 border-2 border-[#d2d2d7] border-t-[#666670] rounded-full animate-spin" />
        Generating the report. This can take a few seconds.
      </div>
    );
  }
  if (ui.error) return <div role="alert" class="text-[13px] text-[#7f1d1d]">{ui.error}</div>;
  const facts = reportFacts(c, data);
  return (
    <div>
      {facts.length > 0 && (
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mb-3 m-0">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt class="text-[11px] uppercase tracking-wide text-[#666670]">{k}</dt>
              <dd class="text-[15px] font-semibold text-[#000000] m-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p class="text-[12px] text-[#666670] mb-2">Sandbox sample data. The name and figures will not match {c.firstName}.</p>
      <details>
        <summary class="cursor-pointer text-[13px] text-primary font-medium">Show the full report</summary>
        <div class="mt-3">{c.products.includes('assets') ? <AssetsReport report={data} /> : <VoieReport report={data} />}</div>
      </details>
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
  const [screen, setScreen] = useState(saved?.screen && saved.screen !== 'walkthrough' ? (saved.screen === 'reauth' ? 'watch' : saved.screen) : 'walkthrough');
  const [showOptional, setShowOptional] = useState(!!saved?.showOptional);

  // Runtime state per applicant, keyed by the seed id. Seeded from CASELOAD and
  // extended with order ids, refresh ids and resolved outcomes as the demo runs.
  const [cases, setCases] = useState(() => seedCases(saved));

  // Which case is currently inside Bridge, and for which purpose.
  const [active, setActive] = useState(null); // { id, mode: 'connect' | 'reauth', bridgeToken }
  const [busy, setBusy] = useState(null);     // case id with an in-flight request
  const [error, setError] = useState(null);
  const [reports, setReports] = useState({}); // caseId -> { income?, assets? }
  const [reportUi, setReportUi] = useState({}); // caseId -> { open, loading, error }

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
  // Everyone has an answer and someone still needs to act: the watch screen shows their next step.
  const reengage = allResolved && needsReauth.length > 0;

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
    const stepMap = { walkthrough: 0, setup: 0, renewals: 1, watch: reengage ? 3 : 2, results: 4 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen, reengage, setCurrentStep]);

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
        // The per-connection refresh limit is its own signal, not a generic failure.
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
  async function toggleReport(c) {
    const ui = reportUi[c.id];
    if (ui?.open) { setReportUi(prev => ({ ...prev, [c.id]: { ...ui, open: false } })); return; }
    const type = c.products.includes('assets') ? 'assets' : 'income';
    const have = reports[c.id]?.[type];
    setReportUi(prev => ({ ...prev, [c.id]: { open: true, loading: !have, error: null } }));
    if (have) return;
    const userId = c.refresh?.user_id || c.order?.user_id;
    const fail = (error) => setReportUi(prev => ({ ...prev, [c.id]: { open: true, loading: false, error } }));
    if (!userId) { fail('There is no user to load a report for.'); return; }
    try {
      const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/${type}`);
      const data = await resp.json();
      if (!resp.ok) { fail('Could not load the report. Try again.'); return; }
      setReports(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [type]: data } }));
      setReportUi(prev => ({ ...prev, [c.id]: { open: true, loading: false, error: null } }));
    } catch (e) {
      console.error(e);
      fail('Could not load the report. Try again.');
    }
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
    setReportUi({});
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
              <Stepper current={0} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">Connect the applicants</h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-4">
                Each applicant connects an employer or bank, the way they would at intake. The test login on
                each row decides what happens at renewal, so you will see both outcomes.
              </p>
              <ol class="mb-5 text-[13px] text-[#444450] leading-[1.6] list-decimal pl-5 space-y-0.5">
                <li>Click <strong>Connect</strong> on a row and use that row's test login.</li>
                <li>Sign in. If you change the password, press <strong>Enter</strong> to sign in.</li>
                <li>When it says done, click <strong>Submit connected accounts</strong>.</li>
              </ol>

              <p class="text-[12px] text-[#666670] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#666670] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
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
                          <div class="text-[12px] text-[#666670]">{c.caseNumber} · {c.program}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="text-[#000000]">{c.connector}</div>
                          <div class="text-[12px] text-[#666670]">{c.connectorKind === 'bank' ? 'assets' : 'income'}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1.5 mb-1">
                            <CredentialChip label="username" value={c.credential.username} />
                            <CredentialChip label="password" value={c.credential.password} />
                          </div>
                          <div class="text-[12px] text-[#666670] leading-[1.45] max-w-[300px]">{c.credentialNote}</div>
                          {c.credentialWarn && <div class="text-[12px] text-[#8A6200] font-medium leading-[1.45] max-w-[300px] mt-1">{c.credentialWarn}</div>}
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
              <p class="text-[12px] text-[#666670] mt-4">On a projector or small laptop screen, choose Desktop at the top right so every button in the connection window fits.</p>
            </>
          )}

          {/* ---------------- Renewals desk ---------------- */}
          {screen === 'renewals' && (
            <>
              <Stepper current={1} />
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
                  applicant's authenticated session. Limited to 3 refreshes per connection per 24 hours.
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

          {/* ---------------- Outcomes: watch, then re-engage on the same screen ---------------- */}
          {screen === 'watch' && (
            <>
              <Stepper current={2} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2 outline-none">Refresh outcomes</h2>
              <p class="text-[15px] text-[#666670] leading-[1.5] mb-5">
                {!allResolved
                  ? 'Truv is refreshing each connection. In the sandbox this takes a few seconds to about half a minute.'
                  : (reengage
                    ? `${needsReauth.length} of ${refreshed.length} needs the applicant. The rest are done and nobody else is contacted.`
                    : 'Every refresh finished and nobody needed to act.')}
              </p>

              <div class="space-y-3 mb-6" aria-live="polite">
                {refreshed.map(c => {
                  const shown = c.revealed ? (c.outcome?.state || 'refreshing') : 'refreshing';
                  const display = OUTCOME_DISPLAY[shown] || OUTCOME_DISPLAY.refreshing;
                  const resolved = shown !== 'refreshing';
                  const reason = c.outcome?.reason;
                  const plain = shown === 'refreshed'
                    ? (c.reauthDone ? 'Fresh data returned after the applicant answered the challenge.' : 'Fresh data returned. The applicant did nothing.')
                    : shown === 'reauth_required'
                      ? 'Needs the applicant to answer a security challenge.'
                      : display.detail;
                  return (
                    <div key={c.id} class="border border-[#d2d2d7] rounded-xl p-4 bg-white">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                            <span class="font-medium text-[#000000] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#666670]">{c.caseNumber} · {c.products.includes('assets') ? 'assets' : 'income'} · {c.connector}</span>
                          </div>
                          <div class="text-[14px] text-[#444450] mt-1.5">{plain}</div>
                          {c.slow && !resolved && (
                            <div class="text-[12px] text-[#8A6200] mt-1">This is taking longer than usual. Still checking.</div>
                          )}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          {!resolved && <span class="inline-block w-3.5 h-3.5 border-2 border-[#d2d2d7] border-t-[#666670] rounded-full animate-spin" />}
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                        </div>
                      </div>

                      {resolved && (reason || c.outcome?.errorMessage || c.outcome?.source) && (
                        <details class="mt-2">
                          <summary class="cursor-pointer text-[12px] text-[#666670]">Details</summary>
                          <div class="mt-1.5 text-[12px] text-[#5b5b60] leading-[1.6]">
                            {reason && <div>Reason: <code class="font-mono text-[12px] bg-[#f5f5f7] px-1 py-0.5 rounded border border-[#d2d2d7]">{reason}</code>{REASON_COPY[reason] ? `. ${REASON_COPY[reason]}` : ''}</div>}
                            {c.outcome?.errorMessage && <div class="italic">Provider said: “{c.outcome.errorMessage}”</div>}
                            <div>How we found out: {detectedBy(c)}</div>
                          </div>
                        </details>
                      )}

                      {/* The applicant's next step appears once the row has resolved that way. */}
                      {c.revealed && c.outcome?.state === 'reauth_required' && (
                        <div class="mt-3 pt-3 border-t border-[#f5f5f7]">
                          <div class="text-[13px] font-medium text-[#000000]">Next step: the applicant answers the challenge</div>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              class="px-3 py-1.5 text-[13px] font-medium bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors"
                              onClick={() => reauthCase(c)}
                            >
                              Act as the applicant
                            </button>
                            {c.refresh?.share_url && <CopyLinkButton url={c.refresh.share_url} />}
                          </div>
                          <p class="text-[12px] text-[#666670] mt-2 mb-0">
                            In production you send them this link by text or email. Acting as the applicant opens the same screen here, and it asks only for the challenge.
                          </p>
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

              {allResolved ? (
                <div class="flex flex-wrap items-center gap-3 mb-6">
                  <button
                    class={reengage
                      ? 'px-5 py-2.5 text-sm font-semibold border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors'
                      : 'px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors'}
                    onClick={() => setScreen('results')}
                  >
                    {reengage ? 'Skip ahead to results' : 'See the refreshed data'}
                  </button>
                  {reengage && <span class="text-[13px] text-[#666670]">Or finish the step above first.</span>}
                </div>
              ) : (
                <p class="text-[13px] text-[#666670] mb-6">Checking each connection. This page updates on its own.</p>
              )}

              <ItDetails webhooks={panel.webhooks} />
            </>
          )}

          {/* ---------------- Results ---------------- */}
          {screen === 'results' && (
            <>
              <Stepper current={3} />
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
                Each completed refresh creates its own order and report, and the original order keeps its own.
                This demo shows the mechanics with test data, not how often refreshes succeed in production.
              </p>

              <div class="space-y-3 mb-6">
                {refreshed.map(c => {
                  const display = OUTCOME_DISPLAY[c.outcome?.state] || OUTCOME_DISPLAY.refreshing;
                  const type = c.products.includes('assets') ? 'assets' : 'income';
                  const ui = reportUi[c.id] || {};
                  return (
                    <div key={c.id} class="border border-[#d2d2d7] rounded-xl bg-white">
                      <div class="p-4 flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                            <span class="font-medium text-[#000000] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#666670]">{type} · {c.connector}</span>
                          </div>
                          <div class="text-[13px] text-[#5b5b60] mt-1.5">How we found out: {detectedBy(c)}</div>
                        </div>
                        <div class="flex flex-col items-end gap-2 shrink-0">
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                          {c.outcome?.state === 'refreshed' && (
                            <button
                              class="px-3 py-1.5 text-[13px] font-medium border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] transition-colors disabled:opacity-60 whitespace-nowrap"
                              aria-expanded={!!ui.open}
                              disabled={!!ui.loading}
                              onClick={() => toggleReport(c)}
                            >
                              {ui.loading ? 'Loading…' : ui.open ? 'Hide report' : 'View report'}
                            </button>
                          )}
                        </div>
                      </div>
                      {ui.open && (
                        <div class="px-4 py-4 border-t border-[#f0f0f3] bg-[#fafafb] rounded-b-xl">
                          <ReportPanel c={c} ui={ui} data={reports[c.id]?.[type]} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
