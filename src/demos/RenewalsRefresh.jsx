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
 * wire. When the stored session is still good, the refresh order completes by
 * itself and emits `order-status-updated: completed`. When it needs the applicant,
 * the refresh TASK fails and the order's `completed_at` stays null, so no
 * completion arrives for that connection. `order-refresh-failed` is the only signal
 * that it failed.
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
 * screen renders from STORED state (see classifyRefreshOutcome on the server) and
 * reveals rows on a timer, instead of trying to observe live transitions.
 *
 * Scaffolding: ./scaffolding/renewals-refresh.jsx
 * Diagrams:    ../diagrams/renewals-refresh.js
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

// --- Imports: diagrams ---
import { RENEWALS_DIAGRAM, REFRESH_FORK_DIAGRAM } from '../diagrams/renewals-refresh.js';

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

// Attach the walkthrough's Mermaid definitions to the stages that render them.
const STAGES = WALKTHROUGH_STAGES.map(s => {
  if (s.kind === 'diagram' && s.name === 'Both products') return { ...s, diagram: RENEWALS_DIAGRAM };
  if (s.name === 'The fork') return { ...s, forkDiagram: REFRESH_FORK_DIAGRAM };
  return s;
});

// --- Helper: small status pill used across the renewals and watch tables ---
function StatusPill({ tone, children }) {
  const cls = {
    good: 'text-[#1C8F60] bg-green-50',
    warn: 'text-[#C18D10] bg-amber-50',
    pending: 'text-[#808080] bg-[#f5f5f7]',
    neutral: 'text-[#5b5b60] bg-[#f5f5f7]',
  }[tone] || 'text-[#808080] bg-[#f5f5f7]';
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
      <span class="text-[10px] text-[#808080]">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

// --- Helper: the callout that names the anti-pattern this demo is about ---
function StuckAtSentCallout() {
  return (
    <div class="border border-[#C18D10]/30 bg-amber-50/60 rounded-xl p-4 text-[13px] leading-[1.55] text-[#000000]">
      <div class="font-semibold mb-1">Why a failed refresh looks like a hang</div>
      <p class="text-[#5b5b60]">
        The rows above that need re-authorization will <strong>never</strong> emit another{' '}
        <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">order-status-updated</code>.
        Their order status stays <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">sent</code> indefinitely,
        because the task failed rather than the order changing state. The only signal is{' '}
        <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">order-refresh-failed</code>,
        which carries the reason in its <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">status</code> field.
        Branch on that status: <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">no_data</code> and{' '}
        <code class="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[#d2d2d7]">unavailable</code> fire the same event but are not
        credential problems and should not prompt anyone.
      </p>
    </div>
  );
}

// --- Component: RenewalsRefreshDemo ---
export function RenewalsRefreshDemo() {
  const [screen, setScreen] = useState('walkthrough');
  const [showOptional, setShowOptional] = useState(false);

  // Runtime state per applicant, keyed by the seed id. Seeded from CASELOAD and
  // extended with order ids, refresh ids and resolved outcomes as the demo runs.
  const [cases, setCases] = useState(() => CASELOAD.map(c => ({ ...c, order: null, refresh: null, outcome: null, revealed: false })));

  // Which case is currently inside Bridge, and for which purpose.
  const [active, setActive] = useState(null); // { id, mode: 'connect' | 'reauth', bridgeToken }
  const [busy, setBusy] = useState(null);     // case id with an in-flight request
  const [error, setError] = useState(null);
  const [reports, setReports] = useState({}); // caseId -> { income?, assets? }

  const iframeRef = useRef(null);
  const completedRef = useRef(false);
  const revealQueueRef = useRef([]);

  // Panel hook: sidebar (Guide / API / Bridge / Webhooks) + per-user polling.
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset: resetPanel } = usePanel();

  const visibleCases = cases.filter(c => !c.optional || showOptional);
  const connected = visibleCases.filter(c => c.order);
  const refreshed = visibleCases.filter(c => c.refresh);
  const needsReauth = refreshed.filter(c => c.revealed && c.outcome?.state === 'reauth_required');
  const allResolved = refreshed.length > 0 && refreshed.every(c => c.revealed && c.outcome && c.outcome.state !== 'refreshing');

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
  async function refreshCase(c) {
    if (!c.order || c.refresh) return;
    setBusy(c.id);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/renewals/refresh/${encodeURIComponent(c.order.order_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: c.products }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        // The per-order cap is its own signal, not a generic failure.
        setError(data.error === 'refresh_cap_reached'
          ? `${c.firstName} ${c.lastName}: ${data.message}`
          : (data.error || 'Could not create the refresh order'));
        setBusy(null);
        return;
      }
      patchCase(c.id, { refresh: data, outcome: { state: 'refreshing' }, revealed: false });
    } catch (e) {
      console.error(e);
      setError('Network error while refreshing.');
    }
    setBusy(null);
  }

  // Refresh everyone who has a connection and has not been refreshed yet.
  async function refreshAll() {
    const targets = connected.filter(c => !c.refresh);
    for (const c of targets) await refreshCase(c);
    setScreen('watch');
  }

  // --- Step 4: resolve outcomes. Server consults the webhook, then the refresh
  // task, then the order. Runs until every refresh has a terminal state. ---
  const pollOutcomes = useCallback(async () => {
    const pending = cases.filter(c => c.refresh && (!c.outcome || c.outcome.state === 'refreshing'));
    if (!pending.length) return;
    await Promise.all(pending.map(async (c) => {
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
  // Bridge skips username and password (credentials are stored on the link) and
  // resumes at the challenge that broke the silent refresh. ---
  function reauthCase(c) {
    if (!c.refresh?.bridge_token) return;
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
        <div class="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">

          {error && (
            <div class="mb-5 border border-red-200 bg-red-50 rounded-xl p-4 text-[13px] text-[#7f1d1d]">{error}</div>
          )}

          {/* ---------------- Setup: certification day ---------------- */}
          {screen === 'setup' && (
            <>
              <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2">Certification day</h2>
              <p class="text-[15px] text-[#808080] leading-[1.5] mb-5">
                Connect each applicant the way they would at intake. The credential decides what their
                renewal does months later, so both outcomes are guaranteed rather than left to chance.
              </p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#808080] text-[13px] font-medium uppercase tracking-wide">
                      <th class="text-left px-4 py-3">Applicant</th>
                      <th class="text-left px-4 py-3">Case</th>
                      <th class="text-left px-4 py-3">Connect to</th>
                      <th class="text-left px-4 py-3">Sandbox credential</th>
                      <th class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCases.map(c => (
                      <tr key={c.id} class="border-b border-[#f5f5f7] align-top">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#808080]">{c.program}</div>
                        </td>
                        <td class="px-4 py-3 font-mono text-[12px] text-[#000000]">{c.caseNumber}</td>
                        <td class="px-4 py-3">
                          <div class="text-[#000000]">{c.connector}</div>
                          <div class="text-[12px] text-[#808080]">{c.connectorKind === 'bank' ? 'assets' : 'income'}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1.5 mb-1">
                            <CredentialChip label="username" value={c.credential.username} />
                            <CredentialChip label="password" value={c.credential.password} />
                          </div>
                          <div class="text-[12px] text-[#808080] leading-[1.45] max-w-[260px]">{c.credentialNote}</div>
                        </td>
                        <td class="px-4 py-3 text-right">
                          {c.order
                            ? <StatusPill tone="good">connected</StatusPill>
                            : (
                              <button
                                class="px-3 py-1.5 text-[13px] font-medium bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
                                disabled={busy === c.id}
                                onClick={() => connectCase(c)}
                              >
                                {busy === c.id ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Connect'}
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
                    Add a third case
                  </button>
                )}
                <button
                  class="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
                  disabled={connected.length === 0}
                  onClick={() => setScreen('renewals')}
                >
                  {connected.length === 0 ? 'Connect at least one applicant' : `Continue with ${connected.length} connected`}
                </button>
              </div>
            </>
          )}

          {/* ---------------- Renewals desk ---------------- */}
          {screen === 'renewals' && (
            <>
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-[#C18D10] bg-amber-50 px-2 py-0.5 rounded">12 months later</span>
              </div>
              <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2">Recertification is due</h2>
              <p class="text-[15px] text-[#808080] leading-[1.5] mb-5">
                Nobody has been contacted. Refresh the connections these applicants already made
                and see which ones answer on their own.
              </p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden overflow-x-auto bg-white mb-5">
                <table class="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#808080] text-[13px] font-medium uppercase tracking-wide">
                      <th class="text-left px-4 py-3">Applicant</th>
                      <th class="text-left px-4 py-3">Connection</th>
                      <th class="text-left px-4 py-3">Verified</th>
                      <th class="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connected.map(c => (
                      <tr key={c.id} class="border-b border-[#f5f5f7]">
                        <td class="px-4 py-3">
                          <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                          <div class="text-[12px] text-[#808080] font-mono">{c.caseNumber}</div>
                        </td>
                        <td class="px-4 py-3 text-[#000000]">{c.connector}</td>
                        <td class="px-4 py-3"><StatusPill tone="warn">stale · {c.verifiedOn}</StatusPill></td>
                        <td class="px-4 py-3 text-right">
                          {c.refresh
                            ? <StatusPill tone="pending">refresh requested</StatusPill>
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
                <div class="text-[13px] font-semibold text-[#808080] uppercase tracking-wide mb-2">What the agency backend sends</div>
                <pre class="text-[12px] font-mono text-[#000000] whitespace-pre-wrap m-0">{`POST /v1/orders/{order_id}/
{ "products": ${JSON.stringify(connected[0]?.products || ['income'])} }`}</pre>
                <p class="text-[12px] text-[#808080] mt-2 mb-0">
                  Server-side, no applicant contact. Truv returns a new order and reconnects with the
                  stored credentials. Capped at 3 refreshes per order per 24 hours.
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
              <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2">
                {screen === 'watch' ? 'Two outcomes' : 'Re-engage only who needs it'}
              </h2>
              <p class="text-[15px] text-[#808080] leading-[1.5] mb-5">
                {screen === 'watch'
                  ? 'Same call for every applicant. The stored session decides what happens next.'
                  : 'Everyone else is already done. These applicants need to clear one challenge, and they do not re-enter credentials.'}
              </p>

              <div class="space-y-3 mb-6">
                {refreshed.map(c => {
                  const state = c.revealed ? (c.outcome?.state || 'refreshing') : 'refreshing';
                  const display = OUTCOME_DISPLAY[state] || OUTCOME_DISPLAY.refreshing;
                  const reason = c.outcome?.reason;
                  return (
                    <div key={c.id} class="border border-[#d2d2d7] rounded-xl p-4 bg-white">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-medium text-[#000000] text-[15px]">{c.firstName} {c.lastName}</span>
                            <span class="text-[12px] text-[#808080] font-mono">{c.caseNumber}</span>
                            <span class="text-[12px] text-[#808080]">·</span>
                            <span class="text-[12px] text-[#808080]">{c.products.includes('assets') ? 'assets' : 'income'} · {c.connector}</span>
                          </div>
                          <div class="text-[13px] text-[#5b5b60] mt-1.5">
                            {state === 'refreshing'
                              ? display.detail
                              : <>{display.detail}{reason ? <> <span class="text-[#808080]">Reason:</span> <code class="font-mono text-[12px] bg-[#f5f5f7] px-1 py-0.5 rounded border border-[#d2d2d7]">{reason}</code>{REASON_COPY[reason] ? ` — ${REASON_COPY[reason]}` : ''}</> : null}</>}
                          </div>
                          {c.outcome?.errorMessage && c.revealed && (
                            <div class="text-[12px] text-[#5b5b60] mt-1 italic">Provider said: “{c.outcome.errorMessage}”</div>
                          )}
                          {c.outcome?.source && c.revealed && (
                            <div class="text-[12px] text-[#808080] mt-1">
                              Detected via {c.outcome.source === 'order-refresh-failed'
                                ? <code class="font-mono bg-[#f5f5f7] px-1 rounded border border-[#d2d2d7]">order-refresh-failed</code>
                                : c.outcome.source === 'task' ? 'the refresh task status (no webhook tunnel on localhost)'
                                : c.outcome.source === 'suborder' ? 'the suborder\'s last_task_status'
                                : 'the order status'}
                            </div>
                          )}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          {state === 'refreshing' && <span class="inline-block w-3.5 h-3.5 border-2 border-[#d2d2d7] border-t-[#808080] rounded-full animate-spin" />}
                          <StatusPill tone={display.tone}>{display.label}</StatusPill>
                        </div>
                      </div>

                      {/* Re-auth affordances appear once the row has resolved that way. */}
                      {c.revealed && c.outcome?.state === 'reauth_required' && (
                        <div class="mt-3 pt-3 border-t border-[#f5f5f7]">
                          <div class="text-[12px] font-semibold text-[#808080] uppercase tracking-wide mb-1.5">Link sent to the applicant</div>
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
                            <span class="text-[12px] text-[#808080] ml-2">Bridge resumes at the challenge, no credentials re-entered</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {allResolved && needsReauth.length > 0 && <div class="mb-6"><StuckAtSentCallout /></div>}

              {/* Live webhook feed: order-refresh-failed shows up here. */}
              <div class="mb-6">
                <div class="text-[13px] font-medium text-[#000000] mb-3">Webhook events</div>
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
              <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2">Refreshed and current</h2>
              <p class="text-[15px] text-[#808080] leading-[1.5] mb-5">
                Each refresh produced its own order and its own report, so "current as of" moves
                forward while the original order stays intact as the historical record.
              </p>

              <div class="border border-[#d2d2d7] rounded-xl overflow-hidden bg-white mb-6">
                <table class="w-full min-w-[600px] text-[13px]">
                  <thead>
                    <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#808080] text-[13px] font-medium uppercase tracking-wide">
                      <th class="text-left px-4 py-3">Applicant</th>
                      <th class="text-left px-4 py-3">How it resolved</th>
                      <th class="text-left px-4 py-3">Told us by</th>
                      <th class="text-right px-4 py-3">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refreshed.map(c => {
                      const display = OUTCOME_DISPLAY[c.outcome?.state] || OUTCOME_DISPLAY.refreshing;
                      return (
                        <tr key={c.id} class="border-b border-[#f5f5f7]">
                          <td class="px-4 py-3">
                            <div class="font-medium text-[#000000]">{c.firstName} {c.lastName}</div>
                            <div class="text-[12px] text-[#808080]">{c.products.includes('assets') ? 'assets' : 'income'}</div>
                          </td>
                          <td class="px-4 py-3">
                            <StatusPill tone={display.tone}>{display.label}</StatusPill>
                            {c.reauthDone && <div class="text-[12px] text-[#808080] mt-1">after one applicant action</div>}
                          </td>
                          <td class="px-4 py-3 font-mono text-[12px] text-[#5b5b60]">
                            {c.outcome?.source === 'order-refresh-failed' ? 'order-refresh-failed' : c.outcome?.source === 'task' ? 'task status' : 'order-status-updated'}
                          </td>
                          <td class="px-4 py-3 text-right">
                            <button class="px-3 py-1.5 text-[13px] font-medium border border-[#d2d2d7] rounded-lg hover:border-[#c0c0c5] transition-colors" onClick={() => loadReport(c)}>
                              Load
                            </button>
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
                    <h3 class="text-lg font-semibold text-[#000000] mb-4">{c?.firstName} {c?.lastName} — refreshed report</h3>
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
