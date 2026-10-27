/**
 * FILE SUMMARY: Start screen + benefits portal for the Public Sector Customer Portal demo.
 * INTEGRATION PATTERN: Embedded Orders (order created server-side, order page via TruvBridge).
 *
 * Ported from the Georgia Gateway revamp (State Demos/ga_gateway_demo), in Truv by Checkr
 * branding and cut down to one applicant. Two independent axes are picked up front:
 *   layout  : 'hero'  (every step on one scrolling page, fixed left nav)
 *             'slide' (one step per screen, Back / Continue)
 *   display : 'inline' (recommended: order page is the income step, position { type: 'inline' })
 *             'dialog' (full-dialog fallback, opens over the portal on arrival)
 * Follows the Embedded Orders Field Guide rules (src/guides/embedded-orders).
 * The step content is identical in all four; only the chrome and the mount point change.
 *
 * Saved cases live in memory for this visit only: a reload or closing the tab leaves just the
 * canned demo. Resuming re-reads the SAME order
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
  { id: 'inline', name: 'Inline', desc: 'Recommended: the order page is the income step',
    points: ['Order page mounted in the step on arrival', 'Sign-in opens as a modal over it', 'Panel grows to the order page via iframe-resizer'] },
  { id: 'dialog', name: 'Full dialog (fallback)', desc: 'Opens over the portal on arrival',
    points: ['The fallback when a step cannot be restructured', 'Right for a caseworker tool', 'Nothing to size'] },
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

// --- Hand-off to the applicant's phone ---
// Truv sends the order link by email or SMS only when an order is CREATED with that
// contact and notifications on; no documented call sends it for an existing order. So a
// hand-off creates a phone order, and never discards data already connected here.
const DONE_STATES = ['completed', 'done'];
// Products whose connection on this order already finished (employers = income,
// financial_accounts = assets).
export function doneProducts(raw = {}) {
  const ok = list => (list || []).some(x => DONE_STATES.includes(x.status) || DONE_STATES.includes(x.last_task_status));
  return [...(ok(raw.employers) ? ['income'] : []), ...(ok(raw.financial_accounts) ? ['assets'] : [])];
}
// What pressing "Email or text me this link" does, given the order's products, what is
// already connected on it, and whether a SUCCESS from the connection widget was seen.
//   restart  : nothing connected - cancel this order, send a new one for every product
//   remaining: something connected - keep this order, send one for the rest only
//   wait     : a connection succeeded but the order doesn't show it yet - don't cancel
//   complete : everything is connected here - nothing to hand off
export function planHandoff(products, done, connectedSeen) {
  const rest = products.filter(p => !done.includes(p));
  if (!rest.length) return { action: 'complete', phoneProducts: [], cancelDesk: false };
  if (!done.length) return connectedSeen
    ? { action: 'wait', phoneProducts: [], cancelDesk: false }
    : { action: 'restart', phoneProducts: products, cancelDesk: true };
  return { action: 'remaining', phoneProducts: rest, cancelDesk: false };
}

// --- Saved cases (this visit only) ---
// Kept in memory so test data never piles up between visits. Earlier builds wrote them to
// localStorage under this key; remove that on load.
const STORE_KEY = 'cp-portal-cases';
try { localStorage.removeItem(STORE_KEY); } catch {}
let memCases = [];
export function loadCases() {
  return memCases;
}
function writeCases(list) { memCases = list; }
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
  const [display, setDisplay] = useState('inline');
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
            {cases.length === 0 ? <p class="cpp-muted">No saved cases in this visit yet. They clear when you reload or close the tab.</p> : (
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
  // Rule 5: a connection succeeded (SUCCESS from the connection widget), so manual entry goes away.
  const [connected, setConnected] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // A sign-in is open in the connection widget (modal): hand-off must wait for it.
  const [signingIn, setSigningIn] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendVia, setSendVia] = useState('email');
  const [sendTo, setSendTo] = useState('');
  const [handoffStatus, setHandoffStatus] = useState(null);
  const [stepMsg, setStepMsg] = useState('');
  const bridgeRef = useRef(null);
  const inlineRef = useRef(null);
  const sectionRefs = useRef([]);
  const mounting = useRef(false);
  const inline = app.display === 'inline';
  const ans = app.answers || { job: null, account: null };
  const route = routeFor(ans);
  const nothing = route && !route.products.length;
  const patch = (p) => setApp(a => ({ ...a, ...p }));

  // Step completion and the reason a step is still locked. The income step has three
  // states (Rule 4): blocked, deferred (link sent or manual entry), verified (COMPLETED).
  const f = app.form;
  const handoff = app.handoff || null;
  const deferred = !app.verified && (!!handoff || !!app.manual?.amount);
  const done = [
    app.programs.length > 0,
    !!(f.first_name.trim() && f.last_name.trim() && /\S+@\S+/.test(f.email)),
    app.verified || !!nothing || deferred,
    false,
  ];
  const lockReason = (i) => {
    for (let j = 0; j < i; j++) if (!done[j]) return `Finish "${STEP_TITLES[j]}" first`;
    return null;
  };
  const why = ['Choose at least one program', 'Enter first name, last name and a valid email', 'Answer both questions, then finish verifying or use an option below it', null];

  // The income step is "here" on the slide layout when it is the current step; on the hero
  // page whenever it is unlocked (the questions live in it, so answering them is arriving).
  const atIncome = !lockReason(2) && (app.layout === 'hero' || app.step === 2);
  // Launch as soon as the answers settle the products: no button between them and Truv.
  // While the verification is handed to the phone the embed is swapped for the waiting
  // screen; "Do it here instead" mounts the phone order here.
  const shouldMount = atIncome && route && !nothing && !app.verified && (!handoff || handoff.here);

  // Close any open widget when the portal unmounts.
  useEffect(() => () => { try { bridgeRef.current?.close(); } catch {} }, []);

  // Rule 1: render the order page when the step loads, not behind a button. Inline mounts
  // into the step; the dialog fallback opens over the portal on arrival.
  useEffect(() => {
    if (shouldMount && !bridgeOpen && !mounting.current && !app.dialogClosed) mount();
    if (!shouldMount && bridgeOpen) closeBridge();
  }, [shouldMount, app.orderId, app.dialogClosed, handoff?.here]);

  // Waiting screen: no event reaches this page from the phone, so read the phone order.
  // It is finished when completed_at is set (the order read's own completion field).
  useEffect(() => {
    if (!handoff || handoff.here || app.verified) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(handoff.orderId)}`);
        const data = await r.json();
        if (stop || !r.ok) return;
        const raw = data.raw_response || {};
        setHandoffStatus({ done: doneProducts(raw), completed: !!raw.completed_at });
        if (raw.completed_at) patch({ verified: true, manual: null });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [handoff?.orderId, handoff?.here, app.verified]);

  // Get a bridge_token: re-read the open order (same token, Rule: reinitialize) or create one.
  async function mount() {
    mounting.current = true;
    setBusy(true); setStepMsg('');
    try {
      let data;
      if (handoff?.here) {
        // "Do it here instead": the phone order's own bridge_token, no third order.
        const r = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(handoff.orderId)}/info`);
        if (!r.ok) throw new Error('We could not reopen your verification. Try again.');
        data = await r.json();
      } else if (app.orderId) {
        const r = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(app.orderId)}/info`);
        if (!r.ok) throw new Error('We could not reopen your verification. Try again.');
        data = await r.json();
      } else {
        // Notifications stay suppressed while the applicant is here (Rule 4). A hand-off
        // sends the link by creating a phone order (see planHandoff).
        const r = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...f, products: route.products, template_id: templateFor(route.products, app.display),
            external_user_id: app.clientId, order_number: app.caseNumber,
            notification_settings: { suppress_user_notifications: true }, demo_id: 'customer-portal' }),
        });
        data = await r.json();
        if (!r.ok) throw new Error('We could not start your verification. Try again.');
        patch({ orderId: data.order_id });
      }
      onOrder(data, handoff?.here ? handoff.products : route.products);
      openBridge(data.bridge_token);
    } catch (e) { setStepMsg(e.message); }
    setBusy(false);
    mounting.current = false;
  }

  function openBridge(bridgeToken) {
    if (!win.TruvBridge) { setStepMsg('Truv Bridge script did not load.'); return; }
    const container = inline ? inlineRef.current : null;
    if (inline && !container) return;
    if (container) container.innerHTML = '';
    setBridgeOpen(true);
    const b = win.TruvBridge.init({
      bridgeToken, isOrder: true,
      position: inline ? { type: 'inline', container } : { type: 'dialog' },
      // Every SDK callback goes to the Bridge tab exactly as received.
      onLoad: () => onEvent('onLoad()'),
      onEvent: (type, payload, source) => {
        onEvent(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload);
        // Rule 5: hide manual entry the moment a connection succeeds; bring it back on an error.
        if (type === 'SUCCESS' && source === 'bridge') { setConnected(true); setManualOpen(false); }
        if (type === 'ERROR' && source === 'bridge') setConnected(false);
        // Track an open sign-in so the hand-off can't start under it.
        if (source === 'bridge') {
          if (['OPEN', 'SCREEN_VIEW', 'EMPLOYER_SELECTED', 'PROVIDER_SELECTED', 'LOGIN_COMPLETE'].includes(type)) setSigningIn(true);
          if (['CLOSE', 'SUCCESS', 'ERROR'].includes(type)) setSigningIn(false);
        }
        // Rule 8: only COMPLETED with source "order" means the order reached its final state
        // (after self-certification where it is on). The templates hide the close button, so
        // close the order page ourselves.
        if (type === 'COMPLETED' && source === 'order') {
          patch({ verified: true, manual: null });
          setTimeout(() => closeBridge(), 1500);
        }
      },
      onSuccess: (publicToken, meta) => onEvent('onSuccess(public_token, meta)', meta ? { public_token: publicToken, meta } : null),
      // onClose is the order-page close (source "order"). A close from the connection
      // widget arrives as onEvent('CLOSE', …, 'bridge') and leaves the order page live.
      onClose: () => {
        onEvent('onClose()');
        bridgeRef.current = null;
        setBridgeOpen(false);
        setSigningIn(false);
        if (!inline) patch({ dialogClosed: true });
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

  // Rule 4, send-link: hand the verification to the applicant's phone.
  function openSend() {
    if (handoff) { patch({ handoff: { ...handoff, here: false } }); closeBridge(); return; }
    setSendOpen(true); setStepMsg('');
    setSendVia(f.email ? 'email' : 'phone');
    setSendTo(f.email || f.phone || '');
  }
  async function readOrder(id) {
    const r = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(id)}`);
    const data = await r.json();
    if (!r.ok) throw new Error('We could not read your verification. Try again.');
    return data.raw_response || {};
  }
  async function sendToPhone() {
    const to = sendTo.trim();
    if (!to || busy || handoff) return;
    if (signingIn) { setStepMsg('Finish or close the sign-in first.'); return; }
    setBusy(true); setStepMsg('');
    try {
      // What is already connected here decides cancel-and-resend vs send-the-rest.
      let done = doneProducts(await readOrder(app.orderId));
      if (!done.length && connected) {
        await new Promise(r => setTimeout(r, 2000));
        done = doneProducts(await readOrder(app.orderId));
      }
      const plan = planHandoff(route.products, done, connected);
      if (plan.action === 'wait') throw new Error('Your connection is still saving. Try again in a moment.');
      if (plan.action === 'complete') throw new Error('Everything is connected already. Finish here.');
      closeBridge();
      if (plan.cancelDesk) {
        await fetch(`${API_BASE}/api/orders/${encodeURIComponent(app.orderId)}/cancel`, { method: 'POST' });
      }
      // A new order with the contact and notifications on: Truv sends the link.
      const contact = sendVia === 'email' ? { email: to } : { phone: to.replace(/\D/g, '') };
      const r = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: f.first_name, last_name: f.last_name, ...contact, products: plan.phoneProducts,
          template_id: templateFor(plan.phoneProducts, app.display), external_user_id: app.clientId,
          order_number: app.caseNumber, demo_id: 'customer-portal' }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error('We could not send the link. Try again.');
      onOrder(data, plan.phoneProducts);
      setSendOpen(false); setHandoffStatus(null);
      patch({
        orderId: plan.cancelDesk ? null : app.orderId,
        handoff: { orderId: data.order_id, products: plan.phoneProducts, doneHere: done, to, via: sendVia, here: false },
        dialogClosed: false,
      });
    } catch (e) { setStepMsg(e.message); }
    setBusy(false);
  }
  function cancelOrder(id) {
    if (id) fetch(`${API_BASE}/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).catch(() => {});
  }

  // An answer that changes the products replaces the order: cancel the old one
  // (POST /v1/orders/{id}/cancel/) so orders don't stack, then the mount effect creates
  // one for the new product set. An answer that keeps the products changes nothing.
  async function answer(k, v) {
    const next = { ...ans, [k]: v };
    const before = route?.products.join(',') ?? null;
    const after = routeFor(next)?.products.join(',') ?? null;
    if ((app.orderId || handoff) && before !== after) {
      cancelOrder(app.orderId); cancelOrder(handoff?.orderId);
      closeBridge(); setConnected(false); setManualOpen(false); setSendOpen(false); setStepMsg('');
      patch({ answers: next, orderId: null, handoff: null, verified: false, manual: null, dialogClosed: false });
      return;
    }
    patch({ answers: next });
  }

  // Rule 9 edit affordance: a finished order is not reopened; start a new one for the same person.
  function editIncome() { closeBridge(); setConnected(false); setHandoffStatus(null); patch({ verified: false, orderId: null, handoff: null, manual: null, dialogClosed: false }); }

  function goto(step) { if (app.step === 2 && step !== 2) closeBridge(); patch({ step, dialogClosed: false }); }
  function save() { saveCase(app); setNote(`Saved. Case ${app.caseNumber} can be picked up from the start screen.`); }
  function stepAway() { closeBridge(); saveCase(app); setAway(true); }
  function comeBack() {
    const rec = loadCases().find(c => c.caseNumber === app.caseNumber);
    if (rec) setApp({ ...rec, dialogClosed: false, step: rec.orderId && !rec.verified ? 2 : rec.step });
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
  // Rule 3: these two declarations drive eligibility (which products are verified), so they
  // stay, on "About you", and Continue goes straight to the order page. Locked once an order
  // exists, since changing them would change its products.
  const question = (k, text) => (
    <fieldset class="cpp-q"><legend>{text}</legend>
      {['yes', 'no'].map(v => (
        <label key={v} class="cpp-check"><input type="radio" name={`q-${k}`} checked={ans[k] === v} disabled={busy}
          onChange={() => answer(k, v)} /><span>{v === 'yes' ? 'Yes' : 'No'}</span></label>
      ))}
    </fieldset>
  );
  const setManual = (k) => (e) => patch({ manual: { ...(app.manual || {}), [k]: e.currentTarget.value } });

  const bodies = [
    <div class="cpp-programs">
      <p>Which programs are you applying for?</p>
      {PROGRAMS.map(p => (
        <label key={p.id} class="cpp-check"><input type="checkbox" checked={app.programs.includes(p.id)} onChange={() => toggleProgram(p.id)} /><span>{p.name}</span></label>
      ))}
    </div>,
    <div>
      <div class="cpp-fields">
        {field('first_name', 'First name')}{field('last_name', 'Last name')}
        {field('email', 'Email *', 'email')}{field('phone', 'Phone', 'tel')}
        <p class="cpp-note">* Enter an email for demo purposes.</p>
      </div>
      {app.orderId && <p class="cpp-muted">Locked: a verification order already uses these details.</p>}
    </div>,
    // Rule 1/2: the order page is the step's content; nothing of ours above it.
    <div class="cpp-income">
      {/* Rule 3: these declarations decide the products, so they stay, and settling them
          mounts the order page directly. */}
      <div class="cpp-declare">
        {question('job', 'Do you have a job or earn income?')}
        {ans.job != null && question('account', 'Do you have a bank account?')}
      </div>
      {nothing && <p class="cpp-muted">No job and no bank account: nothing needs verifying.</p>}
      {app.verified && (
        // Rule 9: the verified result, read-only, with an edit affordance.
        <div class="cpp-result">
          <span class="cpp-verified">✓ Verified</span>
          <span>{route?.name}</span>
          <button type="button" class="cpp-link" onClick={editIncome}>Edit</button>
        </div>
      )}
      {route && !nothing && !app.verified && (<>
        {handoff && !handoff.here ? (
          // Waiting screen: the verification is on the applicant's phone.
          <div class="cpp-phone">
            <h3>Check your phone</h3>
            <p>We sent a link {handoff.via === 'email' ? 'by email' : 'by text'} to <strong>{handoff.to}</strong>. Open it to finish. This page updates when you're done.</p>
            <ul class="cpp-parts">
              {route.products.map(p => {
                const here = handoff.doneHere.includes(p);
                const there = handoffStatus?.done.includes(p);
                return <li key={p}><span>{p === 'income' ? 'Income and employment' : 'Bank accounts'}</span>
                  <span class={here || there ? 'cpp-ok' : 'cpp-muted'}>{here ? '✓ Connected here' : there ? '✓ Connected on your phone' : 'Waiting for your phone'}</span></li>;
              })}
            </ul>
            <button type="button" class="cpp-link" onClick={() => patch({ handoff: { ...handoff, here: true }, dialogClosed: false })}>Do it here instead</button>
          </div>
        ) : inline
          ? <div ref={inlineRef} class="cpp-inline-body" data-loading={busy && !bridgeOpen ? 'true' : undefined} />
          : !bridgeOpen && (
            <div class="cpp-dialog-closed">
              <p class="cpp-muted">{busy ? 'Opening your verification…' : app.dialogClosed ? 'You closed your verification.' : 'Your verification opens in a window over this page.'}</p>
              {app.dialogClosed && !busy && <button type="button" class="cpp-btn" onClick={() => patch({ dialogClosed: false })}>Reopen verification</button>}
            </div>
          )}
        {/* Rule 4: one row directly beneath the embed - manual entry as a text link, and a
            secondary button that hands the verification to the applicant's phone. */}
        {(app.orderId || handoff) && (
          <div class="cpp-escapes">
            {!connected && !(handoff && !handoff.here) && <button type="button" class="cpp-link" onClick={() => setManualOpen(o => !o)}>Enter income manually</button>}
            {!(handoff && !handoff.here) && (
              <button type="button" class="cpp-btn-ghost" onClick={openSend} disabled={busy || signingIn || sendOpen}
                title={signingIn ? 'Finish or close the sign-in first' : undefined}>
                {handoff ? 'Continue on my phone' : 'Email or text me this link'}</button>
            )}
          </div>
        )}
        {signingIn && <p class="cpp-muted">Finish or close the sign-in first to send the link to your phone.</p>}
        {sendOpen && !handoff && (
          <div class="cpp-send">
            <p>Where should we send the link?</p>
            <div class="cpp-send-via">
              {[['email', 'Email'], ['phone', 'Text']].map(([v, l]) => (
                <label key={v} class="cpp-check"><input type="radio" name="send-via" checked={sendVia === v}
                  onChange={() => { setSendVia(v); setSendTo(v === 'email' ? f.email : f.phone); }} /><span>{l}</span></label>
              ))}
            </div>
            <div class="cpp-row">
              <input class="cpp-send-to" type={sendVia === 'email' ? 'email' : 'tel'} value={sendTo} onInput={e => setSendTo(e.currentTarget.value)}
                placeholder={sendVia === 'email' ? 'name@domain.com' : '4155554193'} aria-label={sendVia === 'email' ? 'Email address' : 'Mobile number'} />
              <button type="button" class="cpp-btn" onClick={sendToPhone} disabled={busy || !sendTo.trim()}>{busy ? 'Sending…' : 'Send link'}</button>
              <button type="button" class="cpp-link" onClick={() => setSendOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
        {stepMsg && <p class="cpp-muted" role="status">{stepMsg}</p>}
      </>)}
    </div>,
    <div class="cpp-review">
      <dl>
        <dt>Programs</dt><dd>{app.programs.map(id => PROGRAMS.find(p => p.id === id)?.name).join(', ') || '—'}</dd>
        <dt>Applicant</dt><dd>{f.first_name} {f.last_name} · {f.email}</dd>
        <dt>Verification</dt><dd>{nothing ? 'Nothing to verify' : app.verified ? `${route.name}: verified` : app.manual?.amount ? `Entered manually: $${app.manual.amount}/month` : handoff ? 'Sent to your phone, not yet verified' : 'Not yet verified'}</dd>
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
            <button type="button" class="cpp-btn-ghost" disabled={i === 0} onClick={() => goto(i - 1)}>Back</button>
            <span class="cpp-muted">{blocked}</span>
            <button type="button" class="cpp-btn" disabled={!!blocked} onClick={() => goto(i + 1)}>{i === 2 && deferred ? 'Continue without verifying here' : 'Continue'}</button>
          </div>
        )}
        {i === 3 && <button type="button" class="cpp-btn-ghost" onClick={() => goto(2)}>Back</button>}
      </section>
      {aside}
      </div>
      {footer}
    </div>
  );
}
