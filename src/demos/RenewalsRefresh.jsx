/**
 * FILE SUMMARY: Public Sector: Renewals & Data Refresh demo.
 * INTEGRATION PATTERN: Orders flow, then a data refresh on the connections those orders made.
 *
 * DATA FLOW:
 *   1. POST /api/orders                          : one order per applicant (intake)
 *   2. Bridge in the preview iframe              : applicant connects payroll or bank
 *   3. POST /api/renewals/refresh/:orderId       : recertification, server-side
 *   4. GET  /api/renewals/outcome/:refreshOrderId: get each refresh's result
 *   5. Bridge again, only for the failures       : applicant clears MFA, order completes
 *   6. GET  /api/renewals/report/:refreshOrderId/:type : the refresh order's own report (read, never created)
 *
 * HOW A REFRESH ENDS: there are two outcomes and they look very different on the wire.
 * If the applicant's session is still valid, the refresh order completes by itself and
 * Truv sends `order-status-updated: completed`. If it needs the applicant, the refresh
 * task fails, the order's `completed_at` stays null, and that connection never gets a
 * completed event. `order-refresh-failed` is the webhook that reports the failure (the
 * reason and the stable link_id are on the task).
 *
 * One caveat: `order-status-updated` is sent per suborder and carries an `employer_id`
 * (tested 2026-09-17, see REFRESH-FINDINGS.md). With a single connection a failure looks
 * like silence. With several connections you still get `completed` for each one that
 * worked, so waiting for silence does not work, and a `completed` does not mean the whole
 * refresh succeeded. Applicants with more than one connection are resolved per connection.
 *
 * TIMING (measured in sandbox, 2026-08-19/20): failures come back 0.2-5.5s after the
 * refresh POST, and successful refreshes take about 13-15s. A failure is usually done
 * before the watch screen has loaded, so that screen reads the recorded result from the
 * server (see classifyRefreshOutcome) and shows rows one at a time on a timer, instead of
 * trying to catch changes live.
 *
 * Scaffolding: ./scaffolding/renewals-refresh.jsx
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - refreshCase()        : POST to the order's own path to create a refresh
 *   - pollOutcomes()       : get a refresh's result without relying only on webhooks
 *   - the reauth screen    : reuse the FAILED refresh order's own bridge_token
 *   - OUTCOME_DISPLAY      : branch on `status`, not on the event type
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, Walkthrough } from '../components/index.js';
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: report display components ---
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';
import { $ } from '../utils/formatters.js';
import './renewals-refresh.css';

// --- Imports: scaffolding (caseload, guide steps, walkthrough stages, copy) ---
import { CASELOAD, extraApplicant, STEPS, WALKTHROUGH_STAGES, OUTCOME_DISPLAY, REASON_COPY } from './scaffolding/renewals-refresh.jsx';

const DEMO_ID = 'renewals-refresh';

// Screens in order. The flow mostly moves forward; Start Over goes back to the walkthrough.
const SCREENS = ['walkthrough', 'setup', 'renewals', 'watch', 'reauth', 'results'];

// How often the watch screen asks the server for each refresh's result.
const OUTCOME_POLL_MS = 3000;
// Pause between showing one finished row and the next, so results appear one at a
// time instead of all at once.
const REVEAL_STAGGER_MS = 900;
// Truv rejects a refresh for a short while after Bridge finishes: the order shows
// complete before its connections can be refreshed. Retry automatically instead of
// making the presenter click again.
const REFRESH_RETRY_MS = 4000;
const REFRESH_RETRY_MAX = 12;
// After this many checks with no result, say it is slow instead of spinning forever.
const SLOW_AFTER_POLLS = 60;

const STAGES = WALKTHROUGH_STAGES;

// --- Helper: small status pill used across the renewals and watch tables ---
function StatusPill({ tone, children }) {
  const cls = {
    good: 'text-[#167A50] bg-green-50',
    warn: 'text-[#8A6200] bg-amber-50',
    pending: 'text-[#474c52] bg-[#f0f2f5]',
    neutral: 'text-[#474c52] bg-[#f0f2f5]',
  }[tone] || 'text-[#474c52] bg-[#f0f2f5]';
  return <span class={`text-[13px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>{children}</span>;
}

// --- Helper: click-to-copy chip for the sandbox test logins ---
function CredentialChip({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      class="inline-flex items-center gap-1.5 font-mono text-[12px] bg-[#f0f2f5] hover:bg-[#e5e8ec] text-[#1b1c1f] px-2 py-0.5 rounded border border-[#d8dee5] transition-colors"
      title={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }).catch(() => {});
      }}
    >
      {value}
      <span class="text-[10px] text-[#474c52]">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

// --- Helpers: labels for a case ---
const KIND_LABEL = { payroll: 'income', bank: 'assets', any: 'income and assets' };
const productsLabel = (c) => c.products.map(p => (p === 'assets' ? 'assets' : 'income')).join(' and ');

// --- Helper: four-step progress strip shown above every screen heading ---
const FLOW = ['Connect', 'Renew', 'Outcomes', 'Results'];
function Stepper({ current }) {
  return (
    <ol aria-label="Progress" class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-[12px] font-medium list-none p-0">
      {FLOW.map((label, i) => {
        const st = i < current ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={label} aria-current={st === 'now' ? 'step' : undefined} class="flex items-center gap-2">
            <span class={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] ${st === 'now' ? 'bg-primary text-white' : st === 'done' ? 'bg-green-100 text-[#167A50]' : 'bg-[#f0f2f5] text-[#474c52]'}`}>{st === 'done' ? '✓' : i + 1}</span>
            <span class={st === 'now' ? 'text-[#1b1c1f]' : 'text-[#474c52]'}>{label}</span>
            {i < FLOW.length - 1 && <span aria-hidden="true" class="w-6 h-px bg-[#d8dee5]" />}
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
      class="px-3 py-1.5 text-[13px] font-medium ck-btn ghost"
      onClick={() => {
        Promise.resolve(navigator.clipboard?.writeText(url)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
      }}
    >
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}

// --- Helper: the main facts from a refreshed report ---
// Returns one group for a bank report, and one group per employer for an income report,
// so two payroll connections show as two blocks.
function reportGroups(type, data) {
  if (!data) return [];
  if (type === 'assets') {
    const accounts = (data.links || []).flatMap(l => l.accounts || []);
    return [{
      title: null,
      facts: [
        ['Total balance', data.summary?.balance != null ? $(data.summary.balance) : '-'],
        ['Accounts', String(accounts.length)],
        ['As of', data.as_of_date || '-'],
      ],
    }];
  }
  const emps = (data.links || []).flatMap(l => (l.employments || []).map(e => ({ e, link: l })));
  return emps.map(({ e, link }) => {
    const stmts = e.statements || [];
    const name = e.company?.name || link.provider_name || '-';
    return {
      title: emps.length > 1 ? (link.provider_name || name) : null,
      facts: [
        ['Employer', name],
        ['Job title', e.job_title || '-'],
        ['Annual income', e.income != null ? $(e.income) : '-'],
        ['Latest pay date', stmts[0]?.pay_date || '-'],
        ['Pay statements', String(stmts.length)],
      ],
    };
  });
}

const REPORT_TITLE = { income: 'Income report', assets: 'Assets report' };
const reportTypes = (c) => c.products.map(p => (p === 'assets' ? 'assets' : 'income'));

function ReportPanel({ c, ui, data }) {
  if (ui.loading) {
    return (
      <div class="flex items-center gap-2 text-[13px] text-[#474c52]" aria-live="polite">
        <span class="inline-block w-3.5 h-3.5 border-2 border-[#d8dee5] border-t-[#474c52] rounded-full animate-spin" />
        Loading the report.
      </div>
    );
  }
  if (ui.error) return <div role="alert" class="text-[13px] text-[#7f1d1d]">{ui.error}</div>;
  const types = reportTypes(c);
  return (
    <div class="space-y-5">
      {types.map(type => {
        const groups = reportGroups(type, data?.[type]);
        return (
          <div key={type}>
            {types.length > 1 && <h3 class="text-[13px] font-semibold text-[#1b1c1f] uppercase tracking-wide m-0 mb-3">{REPORT_TITLE[type]}</h3>}
            {groups.map((g, gi) => (
              <div key={gi} class="mb-3">
                {g.title && <div class="text-[14px] font-medium text-[#1b1c1f] mb-1.5">{g.title}</div>}
                <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 m-0">
                  {g.facts.map(([k, v]) => (
                    <div key={k}>
                      <dt class="text-[11px] uppercase tracking-wide text-[#474c52]">{k}</dt>
                      <dd class="text-[15px] font-semibold text-[#1b1c1f] m-0">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <details>
              <summary class="cursor-pointer text-[13px] ck-link">Show the full {type === 'assets' ? 'assets' : 'income'} report</summary>
              <div class="mt-3">{type === 'assets' ? <AssetsReport report={data?.[type]} /> : <VoieReport report={data?.[type]} />}</div>
            </details>
          </div>
        );
      })}
      <p class="text-[12px] text-[#474c52] m-0">Sandbox sample data. The name and figures will not match {c.firstName}.</p>
    </div>
  );
}

// Keeps progress through a page reload or remount. Cleared when the presenter leaves the
// demo, restarts from the breadcrumb, or clicks Start Over, so coming back starts fresh.
// Not cleared on unmount, because a hot code update would otherwise wipe the connected
// applicants and send the presenter back to the walkthrough.
const STORE_KEY = 'truv_renewals_refresh_state';
const UNMOUNT_KEY = 'truv_renewals_refresh_unmounted_at';
const RUNTIME_FIELDS = ['order', 'refresh', 'outcome', 'revealed', 'refreshDetail', 'reauthDone', 'failedReason', 'connectedAt', 'slow'];

function loadSaved() {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    return v && Array.isArray(v.cases) ? v : null;
  } catch { return null; }
}

const MAX_EXTRAS = 24;
const savedExtras = (saved) => Math.min(MAX_EXTRAS, Math.max(0, Math.floor(Number(saved?.extras) || 0)));

function seedCases(saved) {
  const extras = Array.from({ length: savedExtras(saved) }, (_, i) => extraApplicant(i));
  return [...CASELOAD, ...extras].map(c => {
    const base = { ...c, order: null, refresh: null, outcome: null, revealed: false };
    const prev = saved?.cases.find(x => x.id === c.id);
    if (!prev) return base;
    const merged = { ...base };
    for (const k of RUNTIME_FIELDS) if (prev[k] !== undefined) merged[k] = prev[k];
    // Rows that already had a result were shown before the reload. The queue that
    // shows rows one at a time is lost on reload.
    if (merged.outcome && merged.outcome.state !== 'refreshing') merged.revealed = true;
    return merged;
  });
}

// Plain-words description of how we found out how this refresh ended.
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
  useEffect(() => {
    document.documentElement.classList.add('ck-brand');
    return () => document.documentElement.classList.remove('ck-brand');
  }, []);
  const [saved] = useState(loadSaved);
  // True when this instance replaced one that was unmounted moments ago, with progress to restore.
  const [remounted] = useState(() => {
    try {
      const at = Number(sessionStorage.getItem(UNMOUNT_KEY));
      sessionStorage.removeItem(UNMOUNT_KEY);
      return !!(saved && at && Date.now() - at < 15000);
    } catch { return false; }
  });
  const [screen, setScreen] = useState(saved?.screen && saved.screen !== 'walkthrough' ? (saved.screen === 'reauth' ? 'watch' : saved.screen) : 'walkthrough');
  // How many sample applicants have been added with "Add more applicants".
  const [extras, setExtras] = useState(() => savedExtras(saved));
  const [addedNote, setAddedNote] = useState('');

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

  const visibleCases = cases;
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
        screen, extras,
        cases: cases.map(c => ({ id: c.id, ...Object.fromEntries(RUNTIME_FIELDS.map(k => [k, c[k]])) })),
      }));
    } catch { /* storage unavailable: the demo still works, it just will not survive a reload */ }
  }, [screen, extras, cases]);

  useEffect(() => {
    const clear = () => { try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } };
    window.addEventListener('truv:restart-view', clear);
    return () => {
      window.removeEventListener('truv:restart-view', clear);
      try {
        // Decide at unmount, not in a hashchange listener: the browser runs the app's own listener
        // first, which re-renders and removes this one before it gets its turn. If the URL no longer
        // points at this demo the presenter has left, so start fresh next time. Otherwise this is a
        // remount (a code update, say): keep the progress and note when it happened.
        if (!window.location.hash.startsWith('#public-sector/renewals-refresh')) sessionStorage.removeItem(STORE_KEY);
        else sessionStorage.setItem(UNMOUNT_KEY, String(Date.now()));
      } catch { /* ignore */ }
    };
  }, []);

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

  // Point the panel's webhook feed at the most useful user for each screen. The panel
  // follows one Truv user at a time and this demo creates one per applicant, so on the
  // watch screen we follow the first applicant whose refresh failed. That is where
  // `order-refresh-failed` shows up.
  useEffect(() => {
    if (screen !== 'watch' && screen !== 'reauth') return;
    const focus = needsReauth[0] || refreshed[0];
    if (focus?.order?.user_id) startPolling(focus.order.user_id);
  }, [screen, needsReauth.length, refreshed.length, startPolling]);

  // Update one case by id.
  const patchCase = useCallback((id, patch) => {
    setCases(prev => prev.map(c => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)));
  }, []);

  // Appends one sample applicant who verifies income and assets and connects whatever the presenter picks.
  function addApplicant() {
    const n = extras;
    const added = extraApplicant(n);
    setExtras(n + 1);
    setCases(prev => [...prev, { ...added, order: null, refresh: null, outcome: null, revealed: false }]);
    setAddedNote(`Added ${added.firstName} ${added.lastName}.`);
    // The new row is usually below the visible area, so scroll to it and focus its button.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = document.querySelector(`[data-case="${added.id}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.querySelector('[data-connect]')?.focus({ preventScroll: true });
    }));
  }

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
          // Pre-selects the payroll employers so Bridge opens on their login screen.
          // Banks are not pre-selected: the applicant picks any bank in Bridge.
          ...(c.employers?.length ? { employers: c.employers } : {}),
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
        // Hitting the per-connection refresh limit gets its own message, not a generic error.
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

  // --- Step 4: get each refresh's result. The server checks the webhook, then the
  // refresh task, then the order. Keeps polling until every refresh is finished. ---
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
        // Got a result. Queue it so rows appear one at a time. Failures come back in
        // under a second and would otherwise all show at once, before anyone has read them.
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

  // Show queued rows one at a time.
  useEffect(() => {
    if (screen !== 'watch' && screen !== 'reauth') return;
    const t = setInterval(() => {
      const next = revealQueueRef.current.shift();
      if (next) patchCase(next, { revealed: true });
    }, REVEAL_STAGGER_MS);
    return () => clearInterval(t);
  }, [screen, patchCase]);

  // --- Step 5: send the applicant back to Bridge. Use the FAILED refresh order's own
  // bridge_token. Bridge skips the username and password (the connection is already
  // authorized) and goes straight to the challenge that stopped the refresh. ---
  function reauthCase(c) {
    if (!c.refresh?.bridge_token) return;
    patchCase(c.id, { failedReason: c.outcome?.reason || null });
    completedRef.current = false;
    if (c.order?.user_id) startPolling(c.order.user_id);
    setActive({ id: c.id, mode: 'reauth', bridgeToken: c.refresh.bridge_token });
  }

  // --- Step 6: read the refreshed report(s) for one applicant: one per product. ---
  async function toggleReport(c) {
    const ui = reportUi[c.id];
    if (ui?.open) { setReportUi(prev => ({ ...prev, [c.id]: { ...ui, open: false } })); return; }
    const missing = reportTypes(c).filter(t => !reports[c.id]?.[t]);
    setReportUi(prev => ({ ...prev, [c.id]: { open: true, loading: missing.length > 0, error: null } }));
    if (!missing.length) return;
    const fail = (error) => setReportUi(prev => ({ ...prev, [c.id]: { open: true, loading: false, error } }));
    if (!c.refresh?.order_id) { fail('There is no refresh to load a report for.'); return; }
    try {
      const results = await Promise.all(missing.map(async (type) => {
        const resp = await fetch(`${API_BASE}/api/renewals/report/${encodeURIComponent(c.refresh.order_id)}/${type}`);
        return { type, ok: resp.ok, data: await resp.json() };
      }));
      const failed = results.find(r => !r.ok);
      if (failed) { fail(`Could not load the ${failed.type} report. Try again.`); return; }
      setReports(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), ...Object.fromEntries(results.map(r => [r.type, r.data])) } }));
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
          // Once the applicant clears the challenge the refresh order completes. Clear the
          // stored result so polling reads it again and the row changes to "Refreshed"
          // the same way an automatic refresh does.
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

  // Send the current state to the iframe.
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
    setExtras(0);
    setAddedNote('');
    setActive(null);
    setReports({});
    setReportUi({});
    setError(null);
    setScreen('walkthrough');
  }

  // The walkthrough fills the whole page, so the demo header and side panel are hidden there.
  if (screen === 'walkthrough') {
    return (
      <Walkthrough
        stages={STAGES}
        theme="checkr"
        ambient={false}
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
          <button class="text-[13px] ck-link" onClick={() => setActive(null)}>
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

          {remounted && screen !== 'walkthrough' && (
            <div role="status" class="mb-4 text-[12px] text-[#474c52]">
              The demo reloaded itself (usually a code update while the page was open) and picked up where you left off.
            </div>
          )}

          {error && (
            <div role="alert" class="mb-5 border border-red-200 bg-red-50 rounded-xl p-4 text-[13px] text-[#7f1d1d]">{error}</div>
          )}

          {/* ---------------- Setup: connect the applicants ---------------- */}
          {screen === 'setup' && (
            <>
              <Stepper current={0} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#1b1c1f] mb-2 outline-none">Connect the applicants</h2>
              <p class="text-[15px] text-[#474c52] leading-[1.5] mb-4">
                Each applicant connects an employer, a bank, or both, like they would at intake. The test login on
                each row decides what happens at renewal: some refresh on their own, some need the applicant, and
                some need them for only one of their connections.
              </p>
              <ol class="mb-5 text-[13px] text-[#2e3035] leading-[1.6] list-decimal pl-5 space-y-0.5">
                <li>Click <strong>Connect</strong> on a row and use that row's test login.</li>
                <li>Sign in. If you change the password, press <strong>Enter</strong> to sign in.</li>
                <li>When it says done, click <strong>Submit connected accounts</strong>. With two connections the buttons are <strong>Review connected accounts</strong>, then <strong>Verify and submit</strong>.</li>
              </ol>

              <p class="text-[12px] text-[#474c52] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d8dee5] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d8dee5] bg-[#f0f2f5] text-[#474c52] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
                      <th scope="col" class="text-left px-4 py-3">Connect to</th>
                      <th scope="col" class="text-left px-4 py-3">Test login (sandbox)</th>
                      <th scope="col" class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCases.map(c => (
                      <tr key={c.id} data-case={c.id} class="border-b border-[#f0f2f5] align-top">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#1b1c1f]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#474c52]">{c.scenario}</div>
                        </td>
                        <td class="px-4 py-3">
                          {c.connections.map(x => (
                            <div key={x.name} class="mb-2 last:mb-0">
                              <div class="text-[#1b1c1f]">{x.name}</div>
                              <div class="text-[12px] text-[#474c52]">{KIND_LABEL[x.kind]}</div>
                            </div>
                          ))}
                        </td>
                        <td class="px-4 py-3">
                          {c.connections.map(x => (
                            <div key={x.name} class="mb-3 last:mb-0">
                              {c.connections.length > 1 && <div class="text-[12px] font-medium text-[#1b1c1f] mb-1">{x.name}</div>}
                              <div class="flex flex-wrap gap-1.5 mb-1">
                                <CredentialChip label="username" value={x.username} />
                                <CredentialChip label="password" value={x.password} />
                              </div>
                              <div class="text-[12px] text-[#474c52] leading-[1.45] max-w-[300px]">{x.note}</div>
                              {x.warn && <div class="text-[12px] text-[#8A6200] font-medium leading-[1.45] max-w-[300px] mt-1">{x.warn}</div>}
                            </div>
                          ))}
                        </td>
                        <td class="px-4 py-3 text-right">
                          {c.connectedAt
                            ? <StatusPill tone="good">connected</StatusPill>
                            : (
                              <button
                                data-connect
                                class="px-3 py-1.5 text-[13px] font-medium ck-btn primary disabled:opacity-40"
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
                <button class="px-4 py-2 text-[13px] font-medium ck-btn ghost" onClick={addApplicant}>
                  Add more Applicants
                </button>
                <span class="sr-only" role="status" aria-live="polite">{addedNote}</span>
                <button
                  class="px-5 py-2.5 text-sm font-semibold ck-btn primary disabled:opacity-40"
                  disabled={connected.length === 0}
                  onClick={() => setScreen('renewals')}
                >
                  {connected.length === 0 ? 'Connect at least one applicant' : `Continue with ${connected.length} connected`}
                </button>
                {connected.length === 0 && (
                  <span class="text-[13px] text-[#474c52]">Click Connect on a row to start.</span>
                )}
              </div>
              <p class="text-[12px] text-[#474c52] mt-4">On a projector or small laptop screen, choose Desktop at the top right so every button in the connection window fits.</p>
            </>
          )}

          {/* ---------------- Renewals desk ---------------- */}
          {screen === 'renewals' && (
            <>
              <Stepper current={1} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#1b1c1f] mb-2 outline-none">Recertification is due</h2>
              <p class="text-[15px] text-[#474c52] leading-[1.5] mb-5">
                No one has contacted these applicants. Refresh the connections they already made
                and see which ones update without any action from them.
              </p>

              <p class="text-[12px] text-[#474c52] mb-2 md:hidden">Scroll the table sideways to reach the action buttons.</p>

              <div class="border border-[#d8dee5] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d8dee5] bg-[#f0f2f5] text-[#474c52] text-[13px] font-medium uppercase tracking-wide">
                      <th scope="col" class="text-left px-4 py-3">Applicant</th>
                      <th scope="col" class="text-left px-4 py-3">Connection</th>
                      <th scope="col" class="text-left px-4 py-3">Connected at intake</th>
                      <th scope="col" class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connected.map(c => (
                      <tr key={c.id} class="border-b border-[#f0f2f5]">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#1b1c1f]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#474c52]">{c.scenario}</div>
                        </td>
                        <td class="px-4 py-3 text-[#1b1c1f]">
                          {c.connections.map(x => <div key={x.name}>{x.name === 'Any employer and any bank' ? 'What they connected' : x.name}</div>)}
                        </td>
                        <td class="px-4 py-3"><StatusPill tone="neutral">{new Date(c.connectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</StatusPill></td>
                        <td class="px-4 py-3 text-right">
                          {c.refresh
                            ? <StatusPill tone="pending">refresh requested</StatusPill>
                            : c.waiting
                            ? <StatusPill tone="pending">waiting for the connection to be ready</StatusPill>
                            : (
                              <button
                                class="px-3 py-1.5 text-[13px] font-medium ck-btn ghost disabled:opacity-40"
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

              <div class="border border-[#d8dee5] rounded-xl p-4 mb-5 bg-[#f0f2f5]">
                <div class="text-[13px] font-semibold text-[#474c52] uppercase tracking-wide mb-2">What your system sends</div>
                <pre class="text-[12px] font-mono text-[#1b1c1f] whitespace-pre-wrap m-0">{[...new Set(connected.map(c => JSON.stringify(c.products)))]
  .map(ps => {
    const list = JSON.parse(ps);
    const what = list.length > 1 ? 'payroll and bank connections' : list[0] === 'assets' ? 'bank connections' : 'payroll connections';
    return `POST /v1/orders/{order_id}/\n{ "products": ${ps.replace(/","/g, '", "')} }   // ${what}`;
  })
  .join('\n\n') || 'POST /v1/orders/{order_id}/\n{ "products": ["income"] }'}</pre>
                <p class="text-[12px] text-[#474c52] mt-2 mb-0">
                  Sent from your server with no applicant contact. Truv returns a new order and refreshes using the
                  session the applicant already set up. Each connection can be refreshed 3 times per 24 hours.
                </p>
              </div>

              <button
                class="px-5 py-2.5 text-sm font-semibold ck-btn primary disabled:opacity-40"
                disabled={connected.length === 0 || busy !== null}
                onClick={refreshAll}
              >
                {refreshed.length ? 'Watch the outcomes' : `Refresh all ${connected.length}`}
              </button>
            </>
          )}

          {/* ---------------- Outcomes: watch, then send applicants back on the same screen ---------------- */}
          {screen === 'watch' && (
            <>
              <Stepper current={2} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#1b1c1f] mb-2 outline-none">Refresh outcomes</h2>
              <p class="text-[15px] text-[#474c52] leading-[1.5] mb-5">
                {!allResolved
                  ? 'Truv is refreshing each connection. In the sandbox this takes a few seconds to about half a minute.'
                  : (reengage
                    ? `${needsReauth.length} of ${refreshed.length} ${needsReauth.length === 1 ? 'needs' : 'need'} the applicant. The rest are done and nobody else is contacted.`
                    : refreshed.some(c => c.reauthDone)
                      ? 'Every refresh finished. Applicants who needed to act did, and nobody else was contacted.'
                      : 'Every refresh finished and nobody needed to act.')}
              </p>

              <div class="space-y-3 mb-6" aria-live="polite">
                {refreshed.map(c => {
                  const shown = c.revealed ? (c.outcome?.state || 'refreshing') : 'refreshing';
                  const display = OUTCOME_DISPLAY[shown] || OUTCOME_DISPLAY.refreshing;
                  const resolved = shown !== 'refreshing';
                  const reason = c.outcome?.reason;
                  const conns = c.refreshDetail?.connections || null;
                  const needing = conns ? conns.filter(x => x.state === 'reauth_required').length : 0;
                  const plain = shown === 'refreshed'
                    ? (c.reauthDone
                      ? 'Fresh data returned after the applicant answered the challenge.'
                      : conns ? 'Fresh data returned for every connection. The applicant did nothing.' : 'Fresh data returned. The applicant did nothing.')
                    : shown === 'reauth_required'
                      ? (conns && conns.length > 1
                        ? `${needing} of ${conns.length} connections need the applicant to answer a security challenge. The rest refreshed.`
                        : 'Needs the applicant to answer a security challenge.')
                      : display.detail;
                  return (
                    <div key={c.id} class="border border-[#d8dee5] rounded-xl p-4 bg-white">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                            <span class="font-medium text-[#1b1c1f] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#474c52]">{c.scenario} · {productsLabel(c)}</span>
                          </div>
                          <div class="text-[14px] text-[#2e3035] mt-1.5">{plain}</div>
                          {resolved && c.refreshDetail?.connections?.length > 1 && !c.reauthDone && (
                            <ul class="mt-2 mb-0 p-0 list-none space-y-1">
                              {c.refreshDetail.connections.map((x, i) => {
                                const d = OUTCOME_DISPLAY[x.state] || OUTCOME_DISPLAY.refreshing;
                                return (
                                  <li key={x.id || i} class="flex items-center gap-2 text-[13px] text-[#2e3035]">
                                    <StatusPill tone={d.tone}>{d.label}</StatusPill>
                                    <span>{x.company_name || (x.kind === 'financial_account' ? 'Bank account' : 'Employer')}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {c.slow && !resolved && (
                            <div class="text-[12px] text-[#8A6200] mt-1">This is taking longer than usual. Still checking.</div>
                          )}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          {!resolved && <span class="inline-block w-3.5 h-3.5 border-2 border-[#d8dee5] border-t-[#666670] rounded-full animate-spin" />}
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                        </div>
                      </div>

                      {resolved && (reason || c.outcome?.errorMessage || c.outcome?.source) && (
                        <details class="mt-2">
                          <summary class="cursor-pointer text-[12px] text-[#474c52]">Details</summary>
                          <div class="mt-1.5 text-[12px] text-[#474c52] leading-[1.6]">
                            {reason && <div>Reason: <code class="font-mono text-[12px] bg-[#f0f2f5] px-1 py-0.5 rounded border border-[#d8dee5]">{reason}</code>{REASON_COPY[reason] ? `. ${REASON_COPY[reason]}` : ''}</div>}
                            {c.outcome?.errorMessage && <div class="italic">Provider said: “{c.outcome.errorMessage}”</div>}
                            <div>How we found out: {detectedBy(c)}</div>
                          </div>
                        </details>
                      )}

                      {/* The applicant's next step appears once the row has resolved that way. */}
                      {c.revealed && c.outcome?.state === 'reauth_required' && (
                        <div class="mt-3 pt-3 border-t border-[#f0f2f5]">
                          <div class="text-[13px] font-medium text-[#1b1c1f]">Next step: the applicant answers the challenge</div>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              class="px-3 py-1.5 text-[13px] font-medium ck-btn primary"
                              onClick={() => reauthCase(c)}
                            >
                              Act as the applicant
                            </button>
                            {c.refresh?.share_url && <CopyLinkButton url={c.refresh.share_url} />}
                          </div>
                          <p class="text-[12px] text-[#474c52] mt-2 mb-0">
                            In production you send them this link by text or email. Acting as the applicant opens the same screen here, and it asks only for the challenge.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {connected.some(c => !c.refresh) && (
                <div class="mb-6 border border-[#8A6200]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] text-[#1b1c1f]">
                  {connected.filter(c => !c.refresh).map(c => c.firstName).join(', ')} {connected.filter(c => !c.refresh).length === 1 ? 'was' : 'were'} not refreshed.{' '}
                  <button class="ck-link" onClick={() => setScreen('renewals')}>Back to the renewals list</button>
                </div>
              )}

              {(() => {
                const unexpected = refreshed.filter(c => c.expect === 'reauth' && c.outcome?.state === 'refreshed' && !c.reauthDone);
                if (!allResolved || needsReauth.length > 0 || !unexpected.length) return null;
                return (
                  <div class="mb-6 border border-[#8A6200]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] text-[#1b1c1f]">
                    {unexpected.map(c => c.firstName).join(' and ')} refreshed without needing the applicant. If you expected a
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
                      ? 'px-5 py-2.5 text-sm font-semibold ck-btn ghost'
                      : 'px-5 py-2.5 text-sm font-semibold ck-btn primary'}
                    onClick={() => setScreen('results')}
                  >
                    {reengage ? 'Skip ahead to results' : 'See the refreshed data'}
                  </button>
                  {reengage && <span class="text-[13px] text-[#474c52]">Or finish the step above first.</span>}
                </div>
              ) : (
                <p class="text-[13px] text-[#474c52] mb-6">Checking each connection. This page updates on its own.</p>
              )}

            </>
          )}

          {/* ---------------- Results ---------------- */}
          {screen === 'results' && (
            <>
              <Stepper current={3} />
              <h2 data-screen-heading tabIndex={-1} class="text-[28px] font-semibold tracking-[-0.02em] text-[#1b1c1f] mb-2 outline-none">Refresh results</h2>
              <p class="text-[15px] text-[#474c52] leading-[1.5] mb-2">
                {(() => {
                  const alone = refreshed.filter(c => c.outcome?.state === 'refreshed' && !c.reauthDone).length;
                  const after = refreshed.filter(c => c.outcome?.state === 'refreshed' && c.reauthDone).length;
                  const not = refreshed.length - alone - after;
                  return `${alone + after} of ${refreshed.length} refreshed: ${alone} on their own, ${after} after the applicant cleared a challenge${not ? `, ${not} not refreshed` : ''}.`;
                })()}
              </p>
              <p class="text-[13px] text-[#474c52] leading-[1.5] mb-5">
                Each completed refresh gets its own order and report, and the original order keeps its report.
                This is test data, so it says nothing about how often refreshes succeed in production.
              </p>

              <div class="space-y-3 mb-6">
                {refreshed.map(c => {
                  const display = OUTCOME_DISPLAY[c.outcome?.state] || OUTCOME_DISPLAY.refreshing;
                  const ui = reportUi[c.id] || {};
                  return (
                    <div key={c.id} class="border border-[#d8dee5] rounded-xl bg-white">
                      <div class="p-4 flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                            <span class="font-medium text-[#1b1c1f] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#474c52]">{c.scenario} · {productsLabel(c)}</span>
                          </div>
                          <div class="text-[13px] text-[#474c52] mt-1.5">How we found out: {detectedBy(c)}</div>
                        </div>
                        <div class="flex flex-col items-end gap-2 shrink-0">
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                          {c.outcome?.state === 'refreshed' && (
                            <button
                              class="px-3 py-1.5 text-[13px] font-medium ck-btn ghost disabled:opacity-60 whitespace-nowrap"
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
                        <div class="px-4 py-4 border-t border-[#f0f2f5] bg-[#f8f8f8] rounded-b-xl">
                          <ReportPanel c={c} ui={ui} data={reports[c.id]} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {screen !== 'setup' && (
            <div class="mt-6 pt-5 border-t border-[#d8dee5] flex gap-3">
              <button class="px-5 py-2.5 text-sm font-semibold ck-btn ghost" onClick={resetDemo}>Start Over</button>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
