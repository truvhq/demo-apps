/**
 * FILE SUMMARY: Orders & Refresh — a standalone, externally shareable guide with a
 * live sandbox playground attached.
 *
 * INTEGRATION PATTERN: Orders flow, then a refresh across the connections it made.
 *
 * WHY THIS IS NOT A DEMO-APPS DEMO: it deliberately does not render <Layout>, so it
 * has no Header, no breadcrumb and no side Panel. It is a document you can send to
 * someone outside Truv, on its own URL, with its own chrome — deployed the way the
 * partner demos are. Everything is scoped under `.rg` (refresh-guide.css) so none of
 * that leaks back into the demos that do use the shell.
 *
 * It has two jobs and they are weighted equally:
 *   LEARN / CONVEY — one scrolling document, every section anchored so any part of
 *     it can be linked to directly. Answers, in order: do I refresh or create a new
 *     order, what does a refresh actually return, and what do I do when one
 *     connection comes back broken and the others are fine.
 *   PLAY — the same flow against real sandbox, with every HTTP request and response
 *     visible in a console drawer. Nothing in the playground is simulated.
 *
 * EVIDENCE: the timeline, the status table and every claim about behaviour come from
 * a captured sandbox run on 2026-09-17 (REFRESH-FINDINGS.md, raw payloads in
 * scratchpad/exp/run.json). Where something was not observed, the page says so
 * rather than rounding it up to a fact.
 *
 * Content: ./scaffolding/refresh-builder.jsx    Styles: ./refresh-guide.css
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { API_BASE, RefreshTimeline, RefreshEventLog } from '../components/index.js';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';
import './refresh-guide.css';

import {
  RUN_META, RUN_LANES, CAPTURED_RUN, RUN_SPAN, THE_TRAP, LISTENER_MODES,
  CORRELATION, CORRELATION_EVIDENCE,
  BASICS, REFRESH_VS_NEW, NEW_ORDER_PROOF, SCOPING, GATES, ANTIPATTERN, IDENTITY, LIMITS,
  DELIVERY, REAUTH_NOTE,
  OUTCOMES, OUTCOME_CLASSES, NO_DATA_WARNING,
  ANSWERED, OPEN_QUESTIONS, SCOPE_LIMITS,
  PROGRAM_TABLE, PROGRAM_CALENDAR, PROGRAM_RISKS, PROGRAM_SCRIPTS, UNKNOWN_TO_PROGRAM,
} from './scaffolding/refresh-builder.jsx';

const DEMO_ID = 'refresh-guide';
const POLL_MS = 3000;

const SECTIONS = [
  { id: 'start', label: 'Start here', group: 'Learn' },
  { id: 'basics', label: 'Integration basics', group: 'Learn' },
  { id: 'decide', label: 'Refresh or new order', group: 'Learn' },
  { id: 'returns', label: 'What a refresh returns', group: 'Learn' },
  { id: 'partial', label: 'When one connection fails', group: 'Learn' },
  { id: 'play', label: 'Try it against sandbox', group: 'Play' },
  { id: 'outcomes', label: 'Every outcome', group: 'Reference' },
  { id: 'limits', label: 'Limits & identity', group: 'Reference' },
  { id: 'evidence', label: 'What we did and did not test', group: 'Reference' },
  { id: 'program', label: 'If you are not writing the code', group: 'Reference' },
];

const MODE_EVENTS = {
  naive: new Set(['order-created', 'order-status-updated']),
  both: new Set(['order-created', 'order-status-updated', 'order-refresh-failed']),
  tasks: null,
};

const Chip = ({ v, title }) => {
  const [c, setC] = useState(false);
  return (
    <button type="button" class="rg-chip" title={title || 'Copy'}
      onClick={() => { Promise.resolve(navigator.clipboard?.writeText(v)).then(() => { setC(true); setTimeout(() => setC(false), 1100); }).catch(() => {}); }}>
      {c ? 'copied' : v}
    </button>
  );
};

const GUIDE_PATH = '#public-sector/refresh-guide';

export function RefreshGuide({ screen }) {
  const [active, setActive] = useState('start');
  const [mode, setMode] = useState('naive');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [calls, setCalls] = useState([]);
  const [openCall, setOpenCall] = useState(null);

  // playground
  const [order, setOrder] = useState(null);
  const [refresh, setRefresh] = useState(null);
  const [triage, setTriage] = useState(null);
  const [refreshable, setRefreshable] = useState(false);
  const [dropped, setDropped] = useState([]);   // company names the person says they left
  const [bridge, setBridge] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [report, setReport] = useState(null);

  const iframeRef = useRef(null);
  const bridgeBoxRef = useRef(null);
  const completedRef = useRef(false);
  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const rows = triage?.connections || [];
  const surviving = rows.filter(r => !dropped.includes(r.company_name));
  const seeds = RUN_LANES.filter(l => l.kind === 'conn');

  // --- every request the page makes is logged and inspectable -------------
  const api = useCallback(async (method, path, body) => {
    const started = Date.now();
    const entry = { id: `${started}-${Math.random()}`, method, path, body, status: null, res: null, ms: null };
    setCalls(c => [entry, ...c].slice(0, 60));
    try {
      const r = await fetch(API_BASE + path, body
        ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : { method });
      const text = await r.text();
      let res; try { res = JSON.parse(text); } catch { res = text; }
      const done = { ...entry, status: r.status, res, ms: Date.now() - started };
      setCalls(c => c.map(x => (x.id === entry.id ? done : x)));
      return done;
    } catch (e) {
      const done = { ...entry, status: 0, res: { error: String(e) }, ms: Date.now() - started };
      setCalls(c => c.map(x => (x.id === entry.id ? done : x)));
      return done;
    }
  }, []);

  // The app routes on the URL hash, so a bare "#decide" link would navigate the
  // router away from this page. Scroll instead, and record the section in the
  // route's screen segment with replaceState (no hashchange, no remount).
  const goTo = id => e => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
    history.replaceState(null, '', `${GUIDE_PATH}/${id}`);
  };

  // Opening .../refresh-guide/<section> scrolls straight to that section.
  useEffect(() => {
    if (SECTIONS.some(s => s.id === screen)) document.getElementById(screen)?.scrollIntoView();
  }, []);

  // The console opening reflows the page, so bring the Bridge window back into view.
  useEffect(() => {
    if (!bridge) return;
    const t = setTimeout(() => bridgeBoxRef.current?.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }), 400);
    return () => clearTimeout(t);
  }, [bridge]);

  useEffect(() => {
    document.title = 'Orders & Refresh Lifecycle | Truv Demo Apps';
  }, []);

  // Escape closes the console drawer.
  useEffect(() => {
    if (!consoleOpen) return;
    const onKey = e => { if (e.key === 'Escape') { setConsoleOpen(false); document.querySelector('.rg-console-toggle')?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [consoleOpen]);

  // scroll-spy for the rail
  useEffect(() => {
    const obs = new IntersectionObserver(
      es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); },
      { rootMargin: '-90px 0px -60% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, []);

  // --- playground actions -------------------------------------------------
  async function createOrder() {
    setBusy('order'); setErr(null);
    const r = await api('POST', '/api/orders', {
      products: ['income'], demo_id: DEMO_ID, first_name: 'Marcus', last_name: 'Webb',
      employers: seeds.map(s => ({ company_name: s.label })),
    });
    if (r.status !== 200) { setErr(r.res?.error || 'Could not create the order'); setBusy(null); return; }
    setOrder(r.res); completedRef.current = false;
    setBridge({ token: r.res.bridge_token, why: 'connect' });
    setBusy(null); setConsoleOpen(true);
  }

  async function doRefresh({ scoped = false } = {}) {
    if (!order) return;
    setBusy('refresh'); setErr(null);
    // Scoping is how "I no longer work there" is answered: pass only the employer
    // ids that remain and the dropped one is absent from the refresh order. The ids
    // must come from the ORIGINAL order. The refresh order's own rows carry new ids
    // that Truv does not recognise on the original, and answers 400.
    let employers;
    if (scoped) {
      const keep = new Set(surviving.map(r => r.company_name));
      const orig = await api('GET', `/api/renewals/triage/${encodeURIComponent(order.order_id)}`);
      employers = (orig.res?.connections || [])
        .filter(c => c.kind === 'employer' && c.id && keep.has(c.company_name))
        .map(c => ({ id: c.id }));
    }
    const r = await api('POST', `/api/renewals/refresh/${encodeURIComponent(order.order_id)}`,
      { products: ['income'], ...(employers?.length ? { employers } : {}) });
    if (r.status !== 200) { setErr(r.res?.message || r.res?.error || 'Could not refresh'); setBusy(null); return; }
    setRefresh(r.res); setTriage(null); setBusy(null);
  }

  const pollTriage = useCallback(async () => {
    if (!refresh?.order_id) return;
    const r = await api('GET', `/api/renewals/triage/${encodeURIComponent(refresh.order_id)}`);
    if (r.status === 200) setTriage(r.res);
  }, [refresh, api]);

  useEffect(() => {
    if (!refresh) return;
    if (triage?.rollup && !triage.rollup.pending) return; // settled; stop hitting Truv
    pollTriage();
    const t = setInterval(pollTriage, POLL_MS);
    return () => clearInterval(t);
  }, [refresh, pollTriage, triage?.rollup?.pending]);

  // The order is refresh-eligible a few seconds after Bridge reports it complete.
  useEffect(() => {
    if (!order || refreshable || bridge) return;
    let stop = false;
    const tick = async () => {
      const r = await api('GET', `/api/renewals/triage/${encodeURIComponent(order.order_id)}`);
      if (!stop && r.status === 200 && (r.res.connections || []).some(c => c.access_token && c.status === 'completed')) setRefreshable(true);
    };
    tick();
    const i = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(i); };
  }, [order, refreshable, bridge, api]);

  async function loadReport() {
    if (!refresh?.order_id) return;
    setBusy('report');
    const r = await api('GET', `/api/renewals/report/${encodeURIComponent(refresh.order_id)}/income`);
    if (r.status === 200) setReport(r.res);
    setBusy(null);
  }

  const sendPreview = usePreviewIframe(iframeRef, {
    'bridge:onEvent': (type, _p, source) => {
      // Only the order-level COMPLETED means they are finished; a per-link SUCCESS
      // fires once per employer and would close the frame after the first.
      if (type === 'COMPLETED' && source === 'order') { completedRef.current = true; setBridge(null); if (refresh) pollTriage(); }
    },
    'bridge:onClose': () => { if (!completedRef.current) setBridge(null); },
  });
  useEffect(() => { if (bridge?.token) sendPreview('bridge', { bridgeToken: bridge.token, isOrder: true, inline: true }); }, [bridge, sendPreview]);

  function reset() {
    setOrder(null); setRefresh(null); setTriage(null); setRefreshable(false);
    setDropped([]); setBridge(null); setReport(null); setErr(null);
  }

  const step = !order ? 1 : bridge ? 2 : !refresh ? 3 : !triage ? 4 : 5;
  const visible = MODE_EVENTS[mode];
  const modeSpec = LISTENER_MODES.find(m => m.key === mode);

  return (
    <div class={`rg${consoleOpen ? ' console-open' : ''}`}>
      <div class="rg-top">
        <a class="rg-back" href="#public-sector">&larr; Public Sector</a>
        <h1 class="rg-top-title">Orders &amp; Refresh</h1>
        <span class="rg-top-sub">When to refresh, when to start a new order, and what to do when one connection breaks</span>
        <span class="rg-top-spacer" />
        <span class="rg-top-sub">Captured against Truv sandbox, {RUN_META.when}, with spot checks on 2026-10-21</span>
      </div>

      <div class="rg-body">
        <nav class="rg-rail" aria-label="Sections">
          {SECTIONS.map((s, i) => (
            <>
              {(i === 0 || SECTIONS[i - 1].group !== s.group) && <div class="rg-rail-h" key={s.group}>{s.group}</div>}
              <a key={s.id} href={`${GUIDE_PATH}/${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined} class={active === s.id ? 'on' : ''}>{s.label}</a>
            </>
          ))}
        </nav>

        <main class="rg-main">

          {/* ============ START ============ */}
          <section id="start" class="rg-sec">
            <h2>Reusing a verification you already have</h2>
            <p class="rg-lede">
              When someone verifies their income, they authorize a connection to their payroll or bank. Months later you can refresh it, and when the authenticated session is still valid that needs nothing from the person. This page covers which call to make, what comes back, and what to do when part
              of it fails.
            </p>
            <div class="rg-card">
              <div class="rg-row"><strong>Refresh</strong> an order to re-pull the connections it already has.
                You can narrow it to a subset, but you cannot add to it. <code>POST /v1/orders/{'{id}'}/</code></div>
              <div class="rg-row"><strong>Start a new order</strong> for the same person when their list of
                employers changes. An employer they already connected shows as connected. <code>POST /v1/orders/</code></div>
              <div class="rg-row"><strong>Do not</strong> add an employer to an order that already exists.
                In testing it reset a completed order's <code>completed_at</code> to <code>null</code>.</div>
            </div>
            <div class="rg-note">
              <div class="rg-note-t">Terms used on this page</div>
              <p><strong>Order</strong>: one verification request for one person.{' '}
                <strong>Connection</strong> (Truv calls it a suborder): one employer or bank on that order, identified
                by a stable <code>link_id</code>.{' '}
                <strong>Bridge</strong>: Truv's connection screen, where the person signs in to their employer or bank.{' '}
                <strong>Refresh order</strong>: the new order a refresh creates.{' '}
                <strong>share_url</strong>: the link you send the person.{' '}
                <strong>Case file</strong>: your own record for the household.</p>
            </div>
            <div class="rg-note">
              <div class="rg-note-t">How to read this page</div>
              <p>Everything below was run against Truv's sandbox and captured. Anything that was not
                observed is labeled as such. The playground makes the same calls for real. Open the
                console at the bottom right to watch them.</p>
            </div>
          </section>


          {/* ============ BASICS ============ */}
          <section id="basics" class="rg-sec">
            <h2>{BASICS.title}</h2>
            <p class="rg-lede">{BASICS.lede}</p>
            <div class="rg-card">
              {BASICS.steps.map((b, i) => (
                <div key={b.t} class="rg-row">
                  <div style="font-weight:600;margin-bottom:2px">{i + 1}. {b.t}</div>
                  <div style="color:var(--rg-ink-2);font-size:14px">{b.d}</div>
                </div>
              ))}
            </div>

            <h3>Errors you will meet</h3>
            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th scope="col">Status</th><th scope="col">Code</th><th scope="col">Message</th><th scope="col">What it means</th></tr></thead>
                <tbody>
                  {BASICS.errors.map((e, i) => (
                    <tr key={i}>
                      <td><code>{e.status}</code></td>
                      <td>{e.code ? <code>{e.code}</code> : ''}</td>
                      <td style="color:var(--rg-ink-2)">{e.message}</td>
                      <td style="color:var(--rg-ink-2)">{e.means}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style="font-size:13px;color:var(--rg-ink-2);margin-top:8px">{BASICS.errorNote}</p>

            <h3>Copy and paste</h3>
            <pre><code>{BASICS.curl}</code></pre>
          </section>

          {/* ============ DECIDE ============ */}
          <section id="decide" class="rg-sec">
            <h2>Refresh, or a new order?</h2>
            <p class="rg-lede">Start with what changed about the person's jobs.</p>

            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th scope="col">What changed</th><th scope="col">Do this</th><th scope="col">Why</th></tr></thead>
                <tbody>
                  {GATES.map((g, i) => (
                    <tr key={i}>
                      <td>{g.when}</td>
                      <td><div style="font-weight:600;margin-bottom:4px">{g.then}</div><code>{g.call}</code></td>
                      <td style="color:var(--rg-ink-2)">{g.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div class="rg-note good">
              <div class="rg-note-t">{SCOPING.title}</div>
              <p>{SCOPING.body}</p>
              <pre><code>{SCOPING.code}</code></pre>
              <p style="color:var(--rg-ink-2);font-size:13px;margin-top:8px">{SCOPING.caveat}</p>
            </div>

            <h3>Side by side</h3>
            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th /><th scope="col">Refresh the order</th><th scope="col">New order, same person</th></tr></thead>
                <tbody>
                  {REFRESH_VS_NEW.map((r, i) => (
                    <tr key={i}>
                      <td style="font-weight:600">{r.q}</td>
                      <td style={r.win === 'refresh' ? 'color:var(--rg-good);font-weight:600' : 'color:var(--rg-ink-2)'}>{r.refresh}</td>
                      <td style={r.win === 'new' ? 'color:var(--rg-good);font-weight:600' : 'color:var(--rg-ink-2)'}>{r.neworder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div class="rg-note">
              <div class="rg-note-t">{NEW_ORDER_PROOF.claim}</div>
              <p>{NEW_ORDER_PROOF.body}</p>
              <blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid var(--rg-line-2);background:#fff;border-radius:0 8px 8px 0;font-size:14px;color:var(--rg-ink-2)">“{NEW_ORDER_PROOF.quote}”</blockquote>
              <p style="color:var(--rg-good);font-size:13px">{NEW_ORDER_PROOF.observed}</p>
              <p style="color:var(--rg-bad);font-size:13px">{NEW_ORDER_PROOF.notObserved}</p>
            </div>

            <div class="rg-note bad">
              <div class="rg-note-t">{ANTIPATTERN.title}</div>
              <p>{ANTIPATTERN.body}</p>
              <p><strong>{ANTIPATTERN.instead}</strong></p>
            </div>
          </section>

          {/* ============ RETURNS ============ */}
          <section id="returns" class="rg-sec">
            <h2>What a refresh returns</h2>
            <p class="rg-lede">
              One call, three connections, three different results. This is a real sandbox run
              (<code>{RUN_META.call}</code>) with each event plotted at the time it arrived.
            </p>

            <div class="rg-card" style="padding:20px 18px">
              <RefreshTimeline lanes={RUN_LANES} events={CAPTURED_RUN} span={RUN_SPAN} visible={visible} hideVerdicts={mode === 'naive'} />
            </div>

            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 12px">
              <span style="font-size:13.5px;font-weight:600">What are you subscribed to?</span>
              <div class="rg-seg">
                {LISTENER_MODES.map(m => (
                  <button key={m.key} type="button" class={mode === m.key ? 'on' : ''} aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>{m.label}</button>
                ))}
              </div>
            </div>
            <div class={`rg-note ${modeSpec.tone}`}>
              <div class="rg-note-t">You would conclude: {modeSpec.conclusion}</div>
              <p>{modeSpec.reality}</p>
            </div>

            {mode === 'naive' && (
              <div class="rg-note bad">
                <div class="rg-note-t">{THE_TRAP.headline}</div>
                <p>{THE_TRAP.body}</p>
                <p><strong>{THE_TRAP.soWhat}</strong></p>
              </div>
            )}

            <h3>How to read the result</h3>
            <div class="rg-card">
              {CORRELATION.map(c => (
                <div key={c.n} class="rg-row">
                  <div style="font-weight:600;margin-bottom:3px">{c.n}. {c.title}</div>
                  <p style="font-size:14px;color:var(--rg-ink-2);margin:0 0 8px">{c.body}</p>
                  {c.code && <pre><code>{c.code}</code></pre>}
                </div>
              ))}
            </div>

            <h3>The payloads side by side</h3>
            {[CORRELATION_EVIDENCE.webhook, CORRELATION_EVIDENCE.taskEvent, CORRELATION_EVIDENCE.task].map((e, i) => (
              <div key={i} style="margin-bottom:14px">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--rg-ink-3);font-weight:600;margin-bottom:6px">{e.label}</div>
                <pre><code>{e.json}</code></pre>
              </div>
            ))}

            <h3>Every event, in order</h3>
            <p style="font-size:14px;color:var(--rg-ink-2)">
              Times are seconds after the refresh POST. <code>link-disconnected</code> fires on each
              failure. It does not mean the link is unusable, because re-authorization goes back through it.
            </p>
            <RefreshEventLog events={CAPTURED_RUN} lanes={RUN_LANES} visible={visible} />
          </section>

          {/* ============ PARTIAL ============ */}
          <section id="partial" class="rg-sec">
            <h2>One connection fails, the others are fine</h2>
            <p class="rg-lede">
              In the captured run, three connections came back: one refreshed and two failed. What
              you do next depends on whether the person still works there, and the status cannot
              tell you.
            </p>

            <div class="rg-note warn">
              <div class="rg-note-t">The status cannot tell you whether the job ended</div>
              <p>
                A changed password and a job that ended can look the same from the status alone, so ask the
                person and offer both answers.
              </p>
            </div>

            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th scope="col">Connection came back</th><th scope="col">They still work there</th><th scope="col">The job ended</th></tr></thead>
                <tbody>
                  <tr>
                    <td><span class="rg-pill good">refreshed</span><div style="margin-top:6px;color:var(--rg-ink-2)">Nothing to do.</div></td>
                    <td colspan="2" style="color:var(--rg-ink-2)">Take the data and show when it was refreshed.</td>
                  </tr>
                  <tr>
                    <td><span class="rg-pill warn">needs the applicant</span>
                      <div style="margin-top:6px;color:var(--rg-ink-2)"><code>login_error</code> · <code>mfa_error</code> · <code>session_expired</code></div></td>
                    <td><strong>Send the refresh order's link.</strong><div style="color:var(--rg-ink-2);margin-top:4px">For an MFA challenge it opens on the challenge because the connection is already authorized, so the applicant answers one prompt. For <code>login_error</code> expect them to sign in again.</div></td>
                    <td><strong>Re-refresh, scoped.</strong><div style="color:var(--rg-ink-2);margin-top:4px">Pass only the employer ids that remain. The dropped one is absent from the new refresh order, so it can complete with nobody contacted.</div></td>
                  </tr>
                  <tr>
                    <td><span class="rg-pill mute">provider / no data</span>
                      <div style="margin-top:6px;color:var(--rg-ink-2)"><code>no_data</code> · <code>unavailable</code> · <code>error</code> …</div></td>
                    <td colspan="2" style="color:var(--rg-ink-2)"><strong>Do not send the refresh link.</strong> Nothing the applicant does in Bridge changes the result. Retry later, or route to a document. For <code>account_locked</code> they first have to unlock the account with their provider.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>Getting the applicant to re-authorize</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
              {DELIVERY.map(d => (
                <div key={d.key} class="rg-card" style="padding:16px">
                  <div style="font-weight:650;font-size:16px">{d.label}</div>
                  <div style="color:var(--rg-ink-3);font-size:13.5px;margin-bottom:10px">{d.when}</div>
                  <p style="font-size:14px;margin:0 0 10px">{d.mechanism}</p>
                  <ol style="margin:0;padding-left:16px">
                    {d.calls.map((c, i) => (
                      <li key={i} style="font-size:12.5px;margin-bottom:6px">
                        <code>{c.call}</code>
                        <div style="color:var(--rg-ink-3);margin-top:2px">{c.note}</div>
                      </li>
                    ))}
                  </ol>
                  <div class="rg-note good" style="margin:12px 0 0"><p>{d.pro}</p></div>
                  <div class="rg-note warn" style="margin:8px 0 0"><p>{d.con}</p></div>
                </div>
              ))}
            </div>

            <div class="rg-note">
              <div class="rg-note-t">{REAUTH_NOTE.title}</div>
              <p>{REAUTH_NOTE.body}</p>
            </div>
          </section>

          {/* ============ PLAY ============ */}
          <section id="play" class="rg-sec">
            <h2>Try it against sandbox</h2>
            <p class="rg-lede">
              The same three-connection case against live sandbox. The console lists each request this page sends to its own server, which calls Truv and adds the auth headers. Open a row to see the body and the response.
            </p>

            {err && <div class="rg-note bad" role="alert"><p>{err}</p></div>}

            {bridge ? (
              <div class="rg-card" style="padding:16px" ref={bridgeBoxRef}>
                <div style="font-weight:600;margin-bottom:8px">Connect the employers</div>
                <div style="max-width:420px;margin:0 auto">
                  <iframe ref={iframeRef} src="/preview.html" title="Truv Bridge" style="width:100%;height:640px;border:1px solid var(--rg-line);border-radius:12px" />
                </div>
                <div style="text-align:center;margin-top:10px">
                  <button class="rg-btn sm" onClick={() => setBridge(null)}>Back without finishing</button>
                  <div style="font-size:12px;color:var(--rg-ink-3);margin-top:4px">The order completes when you tap “Submit connected accounts”. Walmart asks you to pick a store location and enter a store number (1234 was accepted) before its login screen.</div>
                </div>
              </div>
            ) : (
              <div class="rg-card">
                <div class={`rg-step ${step > 1 ? 'done' : 'now'}`}>
                  <div class="rg-step-n">1</div>
                  <div>
                    <div class="rg-step-t">Create an order with three employers</div>
                    <div class="rg-step-d">Each test login is set up to give a different refresh result.</div>
                    {seeds.map(s => (
                      <div key={s.key} class="rg-conn" style="border:1px solid var(--rg-line);border-radius:8px;margin-bottom:6px">
                        <span class="rg-conn-n">{s.label}</span>
                        {s.credential.split(' / ').map((c, i) => <Chip key={i} v={c} />)}
                        <span class={`rg-pill ${s.verdict === 'refreshed' ? 'good' : 'warn'}`}>{s.verdict}</span>
                      </div>
                    ))}
                    <div style="font-size:12.5px;color:var(--rg-ink-3);margin:6px 0 10px">
                      Bridge pre-fills <code>goodlogin</code>/<code>goodpassword</code>. Replace <em>both</em> fields
                      with the test logins shown for each row, or the results will not match. Kroger needs captcha <code>9M4BP</code>.
                    </div>
                    {!order
                      ? <button class="rg-btn primary" disabled={busy === 'order'} onClick={createOrder}>{busy === 'order' ? 'Creating…' : 'Create the order'}</button>
                      : <div style="font-size:13px;color:var(--rg-good)">Order <code>{order.truv_order_id?.slice(0, 12)}…</code> created.
                          <button class="rg-btn sm" style="margin-left:8px" onClick={() => { completedRef.current = false; setBridge({ token: order.bridge_token }); }}>Reopen Bridge</button>
                        </div>}
                  </div>
                </div>

                <div class={`rg-step ${refresh ? 'done' : step === 3 ? 'now' : ''}`}>
                  <div class="rg-step-n">2</div>
                  <div>
                    <div class="rg-step-t">Refresh it</div>
                    <div class="rg-step-d">
                      Truv rejects a refresh for about 15 to 20 seconds after Bridge finishes, because the order reads complete before its connections can be refreshed. This page retries for you.
                    </div>
                    <button class="rg-btn primary" disabled={!order || !refreshable || busy === 'refresh'} onClick={() => doRefresh()}>
                      {busy === 'refresh' ? 'Refreshing…' : !order ? 'Create an order first' : !refreshable ? 'Waiting until refresh is allowed…' : refresh ? 'Refresh again' : 'Refresh all connections'}
                    </button>
                  </div>
                </div>

                <div class={`rg-step ${rows.length ? 'done' : step === 4 ? 'now' : ''}`}>
                  <div class="rg-step-n">3</div>
                  <div>
                    <div class="rg-step-t">Read the result per connection</div>
                    <div class="rg-step-d">Each row resolves independently. Tick “no longer works here” on a failure to see the scoped re-refresh.</div>
                    {!refresh && <div style="font-size:13px;color:var(--rg-ink-3)">Refresh first.</div>}
                    {refresh && !rows.length && <div style="font-size:13px;color:var(--rg-ink-3)">Resolving…</div>}
                    {rows.map(r => {
                      const spec = OUTCOMES.find(o => o.status === r.reason);
                      const gone = dropped.includes(r.company_name);
                      const tone = gone ? 'mute' : r.state === 'refreshed' ? 'good' : r.state === 'refreshing' ? 'mute' : 'warn';
                      return (
                        <div key={r.id} class="rg-conn" style="border:1px solid var(--rg-line);border-radius:8px;margin-bottom:6px">
                          <span class="rg-conn-n">{r.company_name}</span>
                          <span class={`rg-pill ${tone}`}>{gone ? 'job ended' : spec ? spec.plain : r.state === 'refreshed' ? 'refreshed' : 'working…'}</span>
                          {r.reason && !gone && <code>{r.reason}</code>}
                          {r.state === 'reauth_required' && !gone && (
                            <label style="margin-left:auto;font-size:12.5px;color:var(--rg-ink-2);display:flex;gap:5px;align-items:center;cursor:pointer">
                              <input type="checkbox" checked={gone} onChange={() => setDropped(d => d.includes(r.company_name) ? d.filter(x => x !== r.company_name) : [...d, r.company_name])} />
                              no longer works here
                            </label>
                          )}
                        </div>
                      );
                    })}
                    {triage?.rollup && (
                      <div style="font-size:13px;color:var(--rg-ink-2);margin-top:8px">
                        Order status <code>{triage.order_status || 'sent'}</code>.{' '}
                        {triage.rollup.complete ? 'Every connection refreshed, so it completed on its own.'
                          : triage.rollup.pending ? 'Still in flight.'
                            : 'The order will not complete while a connection is unresolved, though events kept arriving for the connections that worked.'}
                      </div>
                    )}
                  </div>
                </div>

                <div class={`rg-step ${step === 5 ? 'now' : ''}`}>
                  <div class="rg-step-n">4</div>
                  <div>
                    <div class="rg-step-t">Resolve the failures</div>
                    <div class="rg-step-d">Re-refresh without the jobs the person left, or generate a fresh report from what connected.</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                      {refresh?.share_url && (
                        <>
                          <button class="rg-btn" onClick={() => { completedRef.current = false; setBridge({ token: refresh.bridge_token }); }}>Open the refresh link as the applicant</button>
                          <Chip v={refresh.share_url} title="Copy the link you would send by SMS or email" />
                        </>
                      )}
                      <button class="rg-btn" disabled={!dropped.length || busy === 'refresh'} onClick={() => doRefresh({ scoped: true })}>
                        Re-refresh without {dropped.length ? dropped.join(', ') : 'the ended jobs'}
                      </button>
                      <button class="rg-btn" disabled={busy === 'report'} onClick={loadReport}>{busy === 'report' ? 'Loading…' : 'Read the refresh order\'s report'}</button>
                      <button class="rg-btn sm" onClick={reset}>Start over</button>
                    </div>
                    {report && (
                      <div class="rg-note good" style="margin-top:12px">
                        <p>Report loaded. Nothing was created: the refresh order carries its own <code>voie_report_id</code>.
                          The original order's <code>voie_report_id</code> still points at the pre-refresh report, so the
                          refresh order's id is the one to read.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ============ OUTCOMES ============ */}
          <section id="outcomes" class="rg-sec">
            <h2>Every outcome a refresh can produce</h2>
            <p class="rg-lede">
              Eleven terminal statuses. <code>order-refresh-failed</code> fires for every failure,
              including ones the applicant cannot fix, so branch on the status.
            </p>
            <div class="rg-note bad">
              <div class="rg-note-t">no_data is not zero income</div>
              <p>{NO_DATA_WARNING}</p>
            </div>
            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th scope="col" style="min-width:150px">What happened</th><th scope="col">Status</th><th scope="col">Who acts</th><th scope="col" style="min-width:200px">What you do</th><th scope="col">Sandbox</th></tr></thead>
                <tbody>
                  {OUTCOMES.map(o => (
                    <tr key={o.status} style={o.danger ? 'background:var(--rg-bad-bg)' : ''}>
                      <td>{o.plain}{o.ambiguous && <div style="font-size:12px;color:var(--rg-warn);margin-top:3px">could also mean the job ended</div>}</td>
                      <td><code>{o.status}</code></td>
                      <td><span class={`rg-pill ${OUTCOME_CLASSES[o.cls].tone === 'good' ? 'good' : OUTCOME_CLASSES[o.cls].tone === 'warn' ? 'warn' : 'mute'}`}>{OUTCOME_CLASSES[o.cls].who}</span></td>
                      <td style="color:var(--rg-ink-2)">{o.action}</td>
                      <td>{o.cred
                        ? <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start"><Chip v={o.cred.u} /><Chip v={o.cred.p} />{o.cred.hint && <span style="font-size:11px;color:var(--rg-ink-3)">{o.cred.hint}</span>}</div>
                        : <span style="font-size:12px;color:var(--rg-ink-3)">{o.note || 'not reproducible'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style="font-size:13px;color:var(--rg-ink-3);margin-top:10px">
              Observed in the captured run: <code>done</code>, <code>login_error</code>, <code>mfa_error</code>.
              The other rows are Truv's documented statuses with the test login that should produce them.
              They were not tested.
            </p>
          </section>

          {/* ============ LIMITS ============ */}
          <section id="limits" class="rg-sec">
            <h2>Limits, and what to keep on the case file</h2>
            <div class="rg-card" style="margin-bottom:22px">
              {LIMITS.map((l, i) => (
                <div key={i} class="rg-row" style="display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:14px">
                  <div style="font-weight:600">{l.what}</div>
                  <div style="color:var(--rg-ink-2);font-size:14px">{l.then}</div>
                </div>
              ))}
            </div>
            <h3>{IDENTITY.title}</h3>
            <p style="font-size:14px;color:var(--rg-ink-2)">{IDENTITY.body}</p>
            <div class="rg-card">
              {IDENTITY.keep.map((k, i) => (
                <div key={i} class="rg-row" style="display:grid;grid-template-columns:minmax(0,230px) minmax(0,1fr);gap:14px">
                  <div><code>{k.what}</code></div>
                  <div style="color:var(--rg-ink-2);font-size:14px">{k.why}</div>
                </div>
              ))}
            </div>
            <div class="rg-note bad" style="margin-top:14px"><p>{IDENTITY.avoid}</p></div>
          </section>

          {/* ============ EVIDENCE ============ */}
          <section id="evidence" class="rg-sec">
            <h2>What we tested, and what we did not</h2>
            <p class="rg-lede">
              What the sandbox run covered, and what it left out.
            </p>
            <h3>Answered by the run</h3>
            <div class="rg-card">
              {ANSWERED.map((a, i) => (
                <div key={i} class="rg-row">
                  <div style="font-weight:600">{a.q}</div>
                  <div style="color:var(--rg-ink-2);font-size:14px;margin-top:3px">{a.a}</div>
                </div>
              ))}
            </div>
            <h3>Not covered</h3>
            <ul style="padding-left:18px">
              {SCOPE_LIMITS.map((l, i) => <li key={i} style="font-size:14px;color:var(--rg-ink-2);margin-bottom:6px">{l}</li>)}
            </ul>
            <h3>Still open</h3>
            <ul style="padding-left:18px">
              {OPEN_QUESTIONS.map((q, i) => <li key={i} style="font-size:14px;color:var(--rg-ink-2);margin-bottom:6px">{q}</li>)}
            </ul>
          </section>

          {/* ============ PROGRAM ============ */}
          <section id="program" class="rg-sec">
            <h2>If you are not the one writing the code</h2>
            <p class="rg-lede">The same facts, without the endpoints.</p>

            <div class="rg-note warn">
              <div class="rg-note-t">{PROGRAM_CALENDAR.title}</div>
              <p>{PROGRAM_CALENDAR.body}</p>
              <div class="rg-card" style="margin-top:10px">
                {PROGRAM_CALENDAR.marks.map(m => (
                  <div key={m.at} class="rg-row" style="display:flex;gap:14px;padding:8px 14px">
                    <span style="color:var(--rg-ink-3);width:74px;flex:0 0 auto;font-size:13px">Month {m.at}</span>
                    <span style="font-size:14px">{m.label}</span>
                  </div>
                ))}
                <div class="rg-row" style="background:var(--rg-bad-bg);display:flex;gap:14px;padding:8px 14px">
                  <span style="color:var(--rg-bad);width:74px;flex:0 0 auto;font-size:13px;font-weight:650">Check</span>
                  <span style="font-size:14px;color:var(--rg-bad)">Check that the refresh window on your tenant ends after your renewal date.</span>
                </div>
              </div>
              <p style="font-size:12.5px;color:var(--rg-ink-2);margin-top:8px">{PROGRAM_CALENDAR.source}</p>
            </div>

            <h3>What can happen at renewal</h3>
            <div class="rg-scroll">
              <table class="rg-table">
                <thead><tr><th scope="col">What happened</th><th scope="col">Who has to act</th><th scope="col">What we do</th><th scope="col">Applicant contact</th></tr></thead>
                <tbody>
                  {PROGRAM_TABLE.map((r, i) => (
                    <tr key={i}><td>{r.outcome}</td><td style="color:var(--rg-ink-2)">{r.who}</td><td style="color:var(--rg-ink-2)">{r.does}</td><td style="color:var(--rg-ink-2)">{r.contact}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="rg-note" style="margin-top:12px"><p><strong>What we cannot tell you yet:</strong> {UNKNOWN_TO_PROGRAM}</p></div>

            <h3>What to watch out for</h3>
            <div class="rg-card">
              {PROGRAM_RISKS.map((r, i) => (
                <div key={i} class="rg-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
                  <div style="font-weight:600">{r.risk}</div>
                  <div style="color:var(--rg-ink-2);font-size:14px">{r.impact}</div>
                  <div style="color:var(--rg-ink-2);font-size:14px"><span style="color:var(--rg-ink-3)">Do:</span> {r.do}</div>
                </div>
              ))}
            </div>

            <h3>Wording your team can use</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
              {PROGRAM_SCRIPTS.map((s, i) => (
                <div key={i} class="rg-card" style="padding:15px">
                  <div style="font-weight:600;margin-bottom:6px">{s.title}</div>
                  <p style="font-size:14px;font-style:italic;color:var(--rg-ink-2);margin:0">“{s.body}”</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* ---- live console ---- */}
      <button type="button" class="rg-console-toggle" aria-expanded={consoleOpen} aria-controls="rg-console" onClick={() => setConsoleOpen(o => !o)}>
        {consoleOpen ? 'Hide' : 'Console'}{calls.length ? ` · ${calls.length}` : ''}
      </button>
      <aside id="rg-console" aria-label="Live requests" class={`rg-console${consoleOpen ? ' open' : ''}`}>
        <div class="rg-console-h">
          <strong>Live requests</strong>
          <span style="color:#8e8e99">every request this page sends to its server, which calls Truv</span>
          <span style="margin-left:auto"><button class="rg-btn sm" style="background:#1b1b26;color:#d8d8e4;border-color:#2c2c3a" onClick={() => setCalls([])}>Clear</button></span>
        </div>
        <div class="rg-console-b">
          {!calls.length && <div style="color:#6e6e7e">Nothing yet. Run something in “Try it against sandbox”.</div>}
          {calls.map(c => (
            <div key={c.id} class="rg-call">
              <div class="rg-call-h" role="button" tabIndex={0} aria-expanded={openCall === c.id}
                onClick={() => setOpenCall(openCall === c.id ? null : c.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenCall(openCall === c.id ? null : c.id); } }}>
                <span class="rg-call-m">{c.method}</span>
                <span style="overflow:hidden;text-overflow:ellipsis">{c.path}</span>
                <span class={`rg-call-s${c.status >= 400 || c.status === 0 ? ' err' : ''}`}>{c.status ?? '…'}{c.ms != null ? ` ${c.ms}ms` : ''}</span>
              </div>
              {openCall === c.id && (
                <div class="rg-call-b">
                  {c.body ? `request\n${JSON.stringify(c.body, null, 2)}\n\n` : ''}
                  {`response\n${JSON.stringify(c.res, null, 2)}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
