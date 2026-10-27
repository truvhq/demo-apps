/**
 * FILE SUMMARY: Start screen + benefits portal for the Public Sector Customer Portal demo.
 * INTEGRATION PATTERN: Embedded Orders (order created server-side, order page via TruvBridge).
 *
 * Ported from the Georgia Gateway revamp (State Demos/ga_gateway_demo), in Truv by Checkr
 * branding and cut down to one applicant. Two independent axes are picked up front:
 *   layout  : 'hero'  (every step on one scrolling page, fixed left nav)
 *             'slide' (one step per screen, Back / Continue)
 *   display : 'dialog' (order page opens over the portal, position { type: 'dialog' })
 *             'inline' (order page expands inside the applicant's card)
 * The step content is identical in all four; only the chrome and the mount point change.
 *
 * Saved cases live in this browser (localStorage). Resuming re-reads the SAME order
 * (GET /api/orders/:id/info), so the applicant gets the same bridge_token back.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { API_BASE } from '../../components/index.js';
import '../customer-portal.css';

// --- Config: the two axes on the start screen ---
export const LAYOUTS = [
  { id: 'hero', name: 'Hero page', desc: 'Everything on one scrolling page',
    points: ['All four steps stacked, nav fixed on the left', 'Nav marks each step done, open or locked', 'The applicant sees the whole application at once'] },
  { id: 'slide', name: 'Slide layout', desc: 'One step per screen, Back and Continue',
    points: ['Same four steps, shown one at a time', 'Continue stays blocked, with a reason, until the step is done', 'Closest to how most state portals are built today'] },
];
export const DISPLAYS = [
  { id: 'dialog', name: 'Dialog', desc: 'Opens over the portal',
    points: ['Default for Embedded Orders, nothing to size', 'Button reads "Verify"'] },
  { id: 'inline', name: 'Inline', desc: "Expands inside the applicant's card",
    points: ['Mounted in your own container', 'Panel grows to the order page via iframe-resizer', 'Button reads "Connect"'] },
];
const PROGRAMS = [
  { id: 'snap', name: 'SNAP (food assistance)' },
  { id: 'medicaid', name: 'Medicaid' },
  { id: 'tanf', name: 'TANF (cash assistance)' },
  { id: 'liheap', name: 'LIHEAP (energy assistance)' },
];
// Two questions decide the products, as in the Georgia build: job -> income, account -> assets.
export function routeFor({ job, account }) {
  if (job == null || (job === 'no' && account == null) || (job === 'yes' && account == null)) return null;
  const products = [...(job === 'yes' ? ['income'] : []), ...(account === 'yes' ? ['assets'] : [])];
  if (!products.length) return { products, name: 'Nothing to verify' };
  return { products, name: products.length === 2 ? 'Income, employment and bank accounts' : job === 'yes' ? 'Income and employment' : 'Bank accounts' };
}
// Templates from the Georgia Gateway build (Igor's sandbox account). Inline gets its own
// set, sized for an embedded panel. Other accounts don't own these IDs, so the server
// retries without them and that account's default template applies (template_fallback).
const TEMPLATES = {
  dialog: { income: '6f96488cc01645d3bca0050e8c9cff9a', assets: '129e9f00aeed4970a593e544b506975f', both: '506f004d4cd7430082b67b7df78a4dfc' },
  inline: { income: '40527a1226bd4dfe9fefea2a0a1c5473', assets: 'c3e25f5f82734be0bf4c7786f3449e9b', both: '51a236f7bd8a469288fe32691e6910e9' },
};
export function templateFor(products, display) {
  const key = products.length === 2 ? 'both' : products[0];
  return TEMPLATES[display]?.[key] || null;
}
const STEP_TITLES = ['Get started', 'About you', 'Verify income', 'Review & submit'];

// --- Saved cases (this browser only) ---
const STORE_KEY = 'cp-portal-cases';
export function loadCases() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function writeCases(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {} }
export function saveCase(app) {
  writeCases([{ ...app, savedAt: new Date().toISOString() }, ...loadCases().filter(c => c.caseNumber !== app.caseNumber)]);
}
export function discardCase(caseNumber) { writeCases(loadCases().filter(c => c.caseNumber !== caseNumber)); }
export function clearCases() { writeCases([]); }
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function newApplication({ layout, display }) {
  return {
    caseNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
    clientId: 'CL' + Math.floor(100000000 + Math.random() * 899999999),
    layout, display,
    answers: { job: null, account: null },
    programs: [],
    // Sandbox example values, not a real person.
    form: { first_name: 'Jordan', last_name: 'Example', email: 'jordan@example.com', phone: '4155554193' },
    step: 0, orderId: null, verified: false,
  };
}

// --- Component: CPStartScreen. The chooser. ---
export function CPStartScreen({ onStart, onResume, showDetails, setShowDetails, notice }) {
  const [layout, setLayout] = useState('hero');
  const [display, setDisplay] = useState('dialog');
  const [walkAway, setWalkAway] = useState(false);
  const [cases, setCases] = useState(loadCases);
  const [msg, setMsg] = useState(notice || '');

  const Option = ({ o, active, onPick, kind }) => (
    <button type="button" class={`cpp-opt${active ? ' is-on' : ''}`} onClick={() => onPick(o.id)} aria-pressed={active}>
      <span class={`cpp-thumb cpp-thumb-${kind}-${o.id}`} aria-hidden="true"><i /><i /></span>
      <span class="cpp-opt-name">{o.name}</span>
      <span class="cpp-opt-desc">{o.desc}</span>
      <ul>{o.points.map(p => <li key={p}>{p}</li>)}</ul>
    </button>
  );

  return (
    <div class="cpp-start">
      <div class="cpp-card">
        <p class="cpp-eyebrow">Public Sector · Customer Portal</p>
        <h1>Verify income for benefit eligibility</h1>
        <p class="cpp-lede">The same benefits portal, four ways. Pick a layout and a verification display, then start the application. The applicant's answers decide what gets verified.</p>

        <h2 class="cpp-sect">1 · Portal layout</h2>
        <div class="cpp-grid">{LAYOUTS.map(o => <Option key={o.id} o={o} kind="layout" active={layout === o.id} onPick={setLayout} />)}</div>

        <h2 class="cpp-sect">2 · Verification display</h2>
        <div class="cpp-grid">{DISPLAYS.map(o => <Option key={o.id} o={o} kind="display" active={display === o.id} onPick={setDisplay} />)}</div>

        <hr />
        <label class="cpp-check">
          <input type="checkbox" checked={walkAway} onChange={e => setWalkAway(e.currentTarget.checked)} />
          <span><strong>Walk away and come back</strong> adds a <em>Step away</em> control inside the flow and lists saved cases to pick up. An order already started is handed back, not created again.</span>
        </label>

        {walkAway && (
          <div class="cpp-saved">
            {cases.length === 0 ? <p class="cpp-muted">No saved cases in this browser yet.</p> : (
              <>
                <ul>
                  {cases.map(c => (
                    <li key={c.caseNumber}>
                      <button type="button" class="cpp-link" onClick={() => onResume(c)}>
                        Case {c.caseNumber} · {c.form.first_name} {c.form.last_name}
                      </button>
                      <span class="cpp-muted"> stopped at {STEP_TITLES[c.step]} · {LAYOUTS.find(l => l.id === c.layout)?.name} + {c.display} · {c.orderId && !c.verified ? 'verification waiting' : c.verified ? 'verified' : 'no order yet'} · {ago(c.savedAt)}</span>
                      <button type="button" class="cpp-link cpp-danger" onClick={() => { discardCase(c.caseNumber); setCases(loadCases()); setMsg(`Discarded case ${c.caseNumber}.`); }}>Discard</button>
                    </li>
                  ))}
                </ul>
                <button type="button" class="cpp-link cpp-danger" onClick={() => { clearCases(); setCases([]); setMsg('Cleared all saved cases.'); }}>Clear all saved cases</button>
              </>
            )}
          </div>
        )}
        {msg && <p class="cpp-ok" role="status">{msg}</p>}

        <div class="cpp-foot">
          <label class="cpp-check">
            <input type="checkbox" checked={showDetails} onChange={e => setShowDetails(e.currentTarget.checked)} />
            <span>Show integration details panel</span>
          </label>
          <button type="button" class="cpp-btn" onClick={() => onStart({ layout, display, walkAway })}>Start the application</button>
        </div>
      </div>
    </div>
  );
}

// Load the iframe-resizer parent once; the Truv order page ships the child.
let resizerPromise;
function loadScript(win, src) {
  return new Promise((res, rej) => {
    const s = win.document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    win.document.head.appendChild(s);
  });
}
function loadResizer(win) {
  return win.iFrameResize ? Promise.resolve() : loadScript(win, 'https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.9/iframeResizer.min.js');
}

// --- Component: PortalFrame. Renders the portal inside a same-origin iframe, with
// TruvBridge loaded in that iframe. The SDK attaches its dialog to the document it
// runs in, so the order page opens inside the device frame (phone or browser), not
// over the whole demo page. Styles are copied from the host page.
export function PortalFrame({ children }) {
  const ref = useRef(null);
  const [win, setWin] = useState(null);
  useEffect(() => {
    const w = ref.current.contentWindow;
    const d = w.document;
    d.open(); d.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>'); d.close();
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(n => d.head.appendChild(n.cloneNode(true)));
    d.body.className = 'ck-theme';
    loadScript(w, 'https://cdn.truv.com/bridge.js').finally(() => setWin(w));
  }, []);
  return (
    <>
      <iframe ref={ref} title="Benefits portal" class="w-full h-full block border-0 bg-white" />
      {win && createPortal(children(win), win.document.body)}
    </>
  );
}

// The SDK builds its iframe asynchronously; wait for it, then let it size the panel.
// The order page sets overflow:hidden on itself, so a fixed box would clip tall screens.
function sizeToContent(win, container, log) {
  let tries = 0;
  loadResizer(win).catch(() => {});
  const timer = setInterval(() => {
    const frame = container.querySelector('iframe');
    if (frame && typeof win.iFrameResize === 'function') {
      clearInterval(timer);
      try {
        win.iFrameResize({ checkOrigin: false, heightCalculationMethod: 'bodyOffset', minHeight: 420, scrolling: false, log: false }, frame);
        container.dataset.sized = 'auto';
        log('inline panel sized to content (iframe-resizer attached)');
      } catch (err) { container.dataset.sized = 'fallback'; log(`iframe-resizer failed: ${err.message}`); }
    } else if (++tries > 40) {
      clearInterval(timer);
      container.dataset.sized = 'fallback';
      log('iframe-resizer unavailable, using scrollable fallback');
    }
  }, 250);
}

// --- Component: CPPortal. The applicant's portal in either layout. ---
export function CPPortal({ initial, walkAway, onEvent, onOrder, onExit, win = window }) {
  const [app, setApp] = useState(initial);
  const [away, setAway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [note, setNote] = useState('');
  const bridgeRef = useRef(null);
  const inlineRef = useRef(null);
  const sectionRefs = useRef([]);
  const inline = app.display === 'inline';
  const ans = app.answers || { job: null, account: null };
  const route = routeFor(ans);
  const nothing = route && !route.products.length;
  const patch = (p) => setApp(a => ({ ...a, ...p }));

  // Step completion and the reason a step is still locked.
  const f = app.form;
  const done = [
    app.programs.length > 0,
    !!(f.first_name.trim() && f.last_name.trim() && /\S+@\S+/.test(f.email)),
    app.verified || !!nothing,
    false,
  ];
  const lockReason = (i) => {
    for (let j = 0; j < i; j++) if (!done[j]) return `Finish "${STEP_TITLES[j]}" first`;
    return null;
  };
  const why = ['Choose at least one program', 'Enter first name, last name and a valid email', nothing ? null : 'Answer both questions, then complete the verification', null];

  // Close any open widget when the portal unmounts.
  useEffect(() => () => { try { bridgeRef.current?.close(); } catch {} }, []);

  async function launch() {
    if (bridgeOpen || busy) return;
    setBusy(true);
    try {
      let data;
      if (app.orderId) {
        // Walk-away resume: same order, same bridge_token.
        const r = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(app.orderId)}/info`);
        if (!r.ok) throw new Error('Saved order not found on this server');
        data = await r.json();
      } else {
        const r = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...f, products: route.products, template_id: templateFor(route.products, app.display), external_user_id: app.clientId, demo_id: 'customer-portal' }),
        });
        data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Order creation failed');
        patch({ orderId: data.order_id });
      }
      onOrder(data, route.products);
      openBridge(data.bridge_token);
    } catch (e) { setNote(e.message); }
    setBusy(false);
  }

  function openBridge(bridgeToken) {
    if (!win.TruvBridge) { setNote('Truv Bridge script did not load.'); return; }
    const container = inline ? inlineRef.current : null;
    if (inline && container) container.innerHTML = '';
    setBridgeOpen(true);
    const b = win.TruvBridge.init({
      bridgeToken, isOrder: true,
      position: inline ? { type: 'inline', container } : { type: 'dialog' },
      // Every SDK callback goes to the Bridge tab exactly as received.
      onLoad: () => onEvent('onLoad()'),
      onEvent: (type, payload, source) => {
        onEvent(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload);
        // Rule 8: only COMPLETED with source "order" means the order reached its final
        // state, i.e. after self-certification where it is enabled. Mark verified and
        // close the order page ourselves: the templates hide the close button, so the
        // applicant would otherwise be left on the completion screen.
        if (type === 'COMPLETED' && source === 'order') {
          patch({ verified: true });
          setTimeout(() => closeBridge(), 1500);
        }
      },
      onSuccess: (publicToken, meta) => onEvent('onSuccess(public_token, meta)', meta ? { public_token: publicToken, meta } : null),
      onClose: () => {
        onEvent('onClose()');
        bridgeRef.current = null;
        setBridgeOpen(false);
        if (container) container.innerHTML = '';
      },
    });
    bridgeRef.current = b;
    b.open();
    if (inline && container) sizeToContent(win, container, (m) => console.debug('[customer-portal]', m));
  }

  function closeBridge() {
    const b = bridgeRef.current;
    bridgeRef.current = null;
    try { b?.close(); } catch {}
    setBridgeOpen(false);
    if (inlineRef.current) inlineRef.current.innerHTML = '';
  }

  function save() { saveCase(app); setNote(`Saved. Case ${app.caseNumber} can be picked up from the start screen.`); }
  function stepAway() { closeBridge(); saveCase(app); setAway(true); }
  function comeBack() {
    const rec = loadCases().find(c => c.caseNumber === app.caseNumber);
    if (rec) setApp({ ...rec, step: rec.orderId && !rec.verified ? 2 : rec.step });
    setAway(false);
  }
  function startOver() { closeBridge(); discardCase(app.caseNumber); onExit(`Discarded case ${app.caseNumber}.`); }

  if (away) {
    return (
      <div class="cpp-portal"><div class="cpp-away">
        <h2>You stepped away</h2>
        <p>Case <strong>{app.caseNumber}</strong> is saved. You stopped at <strong>{STEP_TITLES[app.step]}</strong>{app.orderId && !app.verified ? ', with one verification still waiting' : ''}.</p>
        <button type="button" class="cpp-btn" onClick={comeBack}>Come back to my application</button>
        <button type="button" class="cpp-link cpp-danger" onClick={startOver}>Leave for good</button>
      </div></div>
    );
  }

  // --- Step bodies, shared by both layouts ---
  const toggleProgram = (id) => patch({ programs: app.programs.includes(id) ? app.programs.filter(p => p !== id) : [...app.programs, id] });
  const field = (k, label, type = 'text') => (
    <label class="cpp-field"><span>{label}</span>
      <input type={type} value={f[k]} onInput={e => patch({ form: { ...f, [k]: e.currentTarget.value } })} disabled={!!app.orderId} />
    </label>
  );
  // Changing an answer after an order exists would change its products, so lock them.
  const question = (k, text) => (
    <fieldset class="cpp-q"><legend>{text}</legend>
      {['yes', 'no'].map(v => (
        <label key={v} class="cpp-check"><input type="radio" name={`q-${k}`} checked={ans[k] === v} disabled={!!app.orderId}
          onChange={() => patch({ answers: { ...ans, [k]: v } })} /><span>{v === 'yes' ? 'Yes' : 'No'}</span></label>
      ))}
    </fieldset>
  );
  const launchLabel = bridgeOpen ? 'Verification in progress' : app.orderId ? 'Resume verification' : inline ? 'Connect' : 'Verify';

  const bodies = [
    <div class="cpp-programs">
      <p>Which programs are you applying for?</p>
      {PROGRAMS.map(p => (
        <label key={p.id} class="cpp-check"><input type="checkbox" checked={app.programs.includes(p.id)} onChange={() => toggleProgram(p.id)} /><span>{p.name}</span></label>
      ))}
    </div>,
    <div class="cpp-fields">
      {field('first_name', 'First name')}{field('last_name', 'Last name')}
      {field('email', 'Email *', 'email')}{field('phone', 'Phone', 'tel')}
      <p class="cpp-note">* Enter an email for demo purposes.</p>
      {app.orderId && <p class="cpp-muted">Locked: a verification order already uses these details.</p>}
    </div>,
    <div class={`cpp-person${bridgeOpen && inline ? ' is-open' : ''}`}>
      <div class="cpp-person-head">
        <div>
          <strong>{f.first_name || 'Applicant'} {f.last_name}</strong>
          <span class="cpp-muted">{route ? route.name : 'Answer the questions below'}</span>
        </div>
        {app.verified && <span class="cpp-verified">✓ Verified</span>}
      </div>
      {question('job', 'Do you have a job or earn income?')}
      {ans.job != null && question('account', 'Do you have a checking or savings account?')}
      {route && !nothing && !app.verified && (
        <div class="cpp-row"><button type="button" class="cpp-btn" onClick={launch} disabled={bridgeOpen || busy || !!lockReason(2)}>{busy ? 'Preparing…' : launchLabel}</button>
        </div>
      )}
      {nothing && <p class="cpp-muted">No job and no account: no order is created and nothing needs verifying.</p>}
      {inline && (
        <div class="cpp-inline" hidden={!bridgeOpen}>
          <div class="cpp-inline-head"><span>{app.verified ? 'Verification complete' : 'Verify your income'}</span>
            <button type="button" class="cpp-link" onClick={closeBridge}>{app.verified ? 'Done' : 'Close'}</button></div>
          <div ref={inlineRef} class="cpp-inline-body" />
        </div>
      )}
    </div>,
    <div class="cpp-review">
      <dl>
        <dt>Programs</dt><dd>{app.programs.map(id => PROGRAMS.find(p => p.id === id)?.name).join(', ') || '—'}</dd>
        <dt>Applicant</dt><dd>{f.first_name} {f.last_name} · {f.email}</dd>
        <dt>Verification</dt><dd>{nothing ? 'Nothing to verify' : app.verified ? `${route.name}: verified` : 'Not yet verified'}</dd>
      </dl>
      <div class="cpp-row">
        {/* Demo stops here: submitting is a placeholder, nothing is sent anywhere. */}
        <button type="button" class="cpp-btn" disabled={!!lockReason(3) || app.submitted} onClick={() => { discardCase(app.caseNumber); patch({ submitted: true }); }}>{app.submitted ? 'Application submitted' : 'Submit application'}</button>
        <button type="button" class="cpp-btn-ghost" onClick={startOver}>Start over</button>
      </div>
      {app.submitted && <p class="cpp-ok" role="status">Application submitted. Case number {app.caseNumber}.</p>}
    </div>,
  ];

  const status = (i) => lockReason(i) ? 'locked' : done[i] ? 'done' : 'open';
  const controls = (
    <div class="cpp-controls">
      <button type="button" class="cpp-link" onClick={save}>Save and finish later</button>
      {walkAway && <button type="button" class="cpp-link" onClick={stepAway}>Step away</button>}
      <button type="button" class="cpp-link cpp-danger" onClick={startOver}>Start over</button>
      {note && <span class="cpp-muted" role="status">{note}</span>}
    </div>
  );
  const header = (
    <header class="cpp-portal-head">
      <span class="cpp-agency">Benefits Portal</span>
      <span class="cpp-muted">{LAYOUTS.find(l => l.id === app.layout).name} · {DISPLAYS.find(d => d.id === app.display).name}</span>
    </header>
  );
  const titleBar = (
    <div class="cpp-titlebar"><div class="cpp-wrap">
      <h1>Apply for benefits</h1>
      <div class="cpp-case"><span>Case number</span><strong>{app.caseNumber}</strong><small>Keep this number. You need it to come back to your application.</small></div>
    </div></div>
  );
  const footer = <footer class="cpp-portal-foot"><div class="cpp-wrap">Sandbox demo. Example applicant data only.</div></footer>;
  // Side summary for the slide layout: where the applicant is and what is left.
  const aside = (
    <aside class="cpp-aside">
      <h3>Your application</h3>
      <ul class="cpp-checklist">
        {STEP_TITLES.map((t, j) => <li key={t} class={`is-${status(j)}${j === app.step ? ' is-here' : ''}`}><span class="cpp-dot">{status(j) === 'done' ? '✓' : j + 1}</span>{t}</li>)}
      </ul>
      {controls}
    </aside>
  );

  if (app.layout === 'hero') {
    return (
      <div class="cpp-portal">{header}{titleBar}
        <div class="cpp-hero">
          <nav class="cpp-nav" aria-label="Application steps">
            {STEP_TITLES.map((t, i) => (
              <button type="button" key={t} class={`cpp-nav-item is-${status(i)}`} onClick={() => sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <span class="cpp-dot">{status(i) === 'done' ? '✓' : i + 1}</span>{t}
                <small>{status(i) === 'done' ? 'Complete' : status(i) === 'locked' ? 'Locked' : 'In progress'}</small>
              </button>
            ))}
          </nav>
          <div class="cpp-sections">
            {STEP_TITLES.map((t, i) => (
              <section key={t} ref={el => (sectionRefs.current[i] = el)} class={`cpp-section${lockReason(i) ? ' is-locked' : ''}`}>
                <h2>{i + 1}. {t}</h2>
                {lockReason(i) ? <p class="cpp-muted">{lockReason(i)}.</p> : bodies[i]}
              </section>
            ))}
            {controls}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  // Slide layout
  const i = app.step;
  const blocked = i < 3 && !done[i] ? why[i] : null;
  return (
    <div class="cpp-portal">{header}{titleBar}
      <ol class="cpp-stepbar cpp-wrap">{STEP_TITLES.map((t, j) => <li key={t} class={j === i ? 'is-current' : status(j) === 'done' ? 'is-done' : ''}><span>Step {j + 1}</span>{t}</li>)}</ol>
      <div class="cpp-slide-grid cpp-wrap">
      <section class="cpp-section cpp-slide">
        <h2>{i + 1}. {STEP_TITLES[i]}</h2>
        {bodies[i]}
        {i < 3 && (
          <div class="cpp-row cpp-slide-nav">
            <button type="button" class="cpp-btn-ghost" disabled={i === 0 || bridgeOpen} onClick={() => patch({ step: i - 1 })}>Back</button>
            <span class="cpp-muted">{blocked}</span>
            <button type="button" class="cpp-btn" disabled={!!blocked || bridgeOpen} onClick={() => patch({ step: i + 1 })}>Continue</button>
          </div>
        )}
        {i === 3 && <button type="button" class="cpp-btn-ghost" onClick={() => patch({ step: 2 })}>Back</button>}
      </section>
      {aside}
      </div>
      {footer}
    </div>
  );
}
