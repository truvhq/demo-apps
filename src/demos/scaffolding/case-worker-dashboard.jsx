/**
 * FILE SUMMARY: Case worker dashboard for the Public Sector Case Worker Portal demo.
 * INTEGRATION PATTERN: Orders flow, sent to the applicant (share_url by email/SMS).
 *
 * A case worker sees the agency's verifications, opens "New verification", picks
 * the product types (wage earner, self-employment, or both), and sends it. The
 * product mix picks the Truv template. Each case can be refreshed from Truv
 * (GET /v1/orders/{id}/), its link copied, and its report opened once done.
 */

import { useState } from 'preact/hooks';
import { API_BASE } from '../../components/index.js';
import { VoieReport } from '../../components/reports/VoieReport.jsx';
import { AssetsReport } from '../../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../../components/reports/IncomeInsightsReport.jsx';
import '../case-worker.css';

// --- Config: product types the case worker can pick, as Truv products ---
// The Public Sector templates label the assets product "Self-Employment Verification".
export const PRODUCT_TYPES = [
  { id: 'income', name: 'Wage Earner Verification', hint: 'Payroll: employer or payroll provider' },
  { id: 'assets', name: 'Self-Employment Verification', hint: 'Bank accounts, for income paid outside payroll' },
];

// --- Config: one template per product mix (Truv sandbox, Georgia Public Sector set) ---
// Templates are scoped to the account that owns them. With other keys Truv rejects the
// id and the backend retries without it, so the account's default template is used.
export const TEMPLATES = {
  income: { id: '6f96488cc01645d3bca0050e8c9cff9a', name: 'Wage earner' },
  assets: { id: '129e9f00aeed4970a593e544b506975f', name: 'Self-employment' },
  both: { id: '506f004d4cd7430082b67b7df78a4dfc', name: 'Wage earner + self-employment' },
};

export function templateFor(products) {
  const key = products.length > 1 ? 'both' : products[0];
  return TEMPLATES[key];
}

export const PROGRAMS = ['SNAP', 'Medicaid', 'TANF', 'Child Care Assistance'];

// --- Config: sample cases so the dashboard isn't empty. Marked "Sample" in the table. ---
const SAMPLES = [
  { id: 's1', sample: true, caseNumber: '40218837', first_name: 'Maria', last_name: 'Lopez', email: 'maria.lopez@example.com', program: 'SNAP', products: ['income'], parts: { income: 'completed' }, created: '2026-10-21' },
  { id: 's2', sample: true, caseNumber: '40219412', first_name: 'Darnell', last_name: 'Price', phone: '4155550102', program: 'Medicaid', products: ['income', 'assets'], parts: { income: 'completed', assets: 'pending' }, created: '2026-10-24' },
  { id: 's3', sample: true, caseNumber: '40220055', first_name: 'Ana', last_name: 'Nguyen', email: 'ana.nguyen@example.com', program: 'TANF', products: ['assets'], parts: { assets: 'pending' }, created: '2026-10-26' },
];

// --- Cases created in this visit ---
// Kept in memory only, so a reload or closing the page leaves just the samples above.
// Earlier versions saved cases to the browser: clear that on load.
try { localStorage.removeItem('cw-cases'); } catch { /* private window */ }

const newCaseNumber = () => String(40220000 + Math.floor(Math.random() * 90000));
const today = () => new Date().toISOString().slice(0, 10);

// --- Status: derived from the suborders, since an order's own status can be empty ---
const DONE = ['completed', 'done'];
const FAILED = ['error', 'failed', 'canceled', 'expired'];
export function caseStatus(c) {
  const s = c.products.map(p => c.parts?.[p] || 'pending');
  if (s.every(x => DONE.includes(x))) return 'done';
  if (s.some(x => FAILED.includes(x))) return 'error';
  if (s.some(x => DONE.includes(x))) return 'partial';
  return c.email || c.phone ? 'sent' : 'created';
}
const STATUS_LABEL = { done: 'Done', error: 'Needs attention', partial: 'In progress', sent: 'Link sent', created: 'Link not sent' };

// Reads per-product status out of a Truv order (employers = income, financial_accounts = assets).
function partsFrom(raw) {
  const pick = list => (list || []).map(x => x.status).filter(Boolean);
  const out = {};
  const inc = pick(raw.employers), ast = pick(raw.financial_accounts);
  if (inc.length) out.income = inc.every(x => DONE.includes(x)) ? 'completed' : inc.find(x => FAILED.includes(x)) || inc[0];
  if (ast.length) out.assets = ast.every(x => DONE.includes(x)) ? 'completed' : ast.find(x => FAILED.includes(x)) || ast[0];
  return out;
}

const productName = id => PRODUCT_TYPES.find(p => p.id === id)?.name || id;

function StatusPill({ status }) {
  return <span class={`cw-pill cw-pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

// --- Component: the dashboard ---
export function CWDashboard({ onOrder, onEvent }) {
  const [cases, setCases] = useState([]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const patchCase = (id, p) => setCases(list => list.map(c => (c.id === id ? { ...c, ...p } : c)));

  const all = [...cases, ...SAMPLES];
  const q = query.trim().toLowerCase();
  const rows = all.filter(c => (filter === 'all' || caseStatus(c) === filter)
    && (!q || `${c.first_name} ${c.last_name} ${c.caseNumber} ${c.email || ''}`.toLowerCase().includes(q)));
  const open = all.find(c => c.id === openId);

  return (
    <div class="cw-app">
      <aside class="cw-nav">
        <div class="cw-brand">Benefits Agency<span>Case worker</span></div>
        <a class="cw-nav-item is-on">Verifications</a>
        <a class="cw-nav-item is-off" title="Not part of this demo">Cases</a>
        <a class="cw-nav-item is-off" title="Not part of this demo">Reports</a>
      </aside>

      <main class="cw-main">
        <div class="cw-head">
          <div>
            <h1>Verifications</h1>
            <p>Send an applicant a secure link to verify their income. Truv emails or texts it, and the case updates when they finish.</p>
          </div>
          <button class="cw-btn" onClick={() => setCreating(true)}>New verification</button>
        </div>

        <div class="cw-tools">
          <input class="cw-search" placeholder="Search by name, case number or email" value={query} onInput={e => setQuery(e.target.value)} />
          <select class="cw-select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Any status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div class="cw-table-wrap">
          <table class="cw-table">
            <thead><tr><th>Applicant</th><th>Case number</th><th>Program</th><th>Products</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} class={c.sample ? 'is-sample' : 'is-new'} onClick={() => setOpenId(c.id)}>
                  <td><strong>{c.first_name} {c.last_name}</strong>{c.sample && <span class="cw-tag">Sample</span>}<div class="cw-sub">{c.email || c.phone || 'No contact on file'}</div></td>
                  <td class="cw-mono">{c.caseNumber}</td>
                  <td>{c.program}</td>
                  <td>{c.products.map(p => <div key={p} class="cw-prod">{productName(p)}</div>)}</td>
                  <td>{c.created}</td>
                  <td><StatusPill status={caseStatus(c)} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} class="cw-empty">No verifications match.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      {creating && (
        <NewVerification
          onClose={() => setCreating(false)}
          onCreated={c => { setCases(list => [c, ...list]); setCreating(false); setOpenId(c.id); onOrder?.(c); }}
          onEvent={onEvent}
        />
      )}
      {open && <CaseDrawer c={open} onClose={() => setOpenId(null)} onPatch={p => patchCase(open.id, p)} onDiscard={() => { setCases(list => list.filter(x => x.id !== open.id)); setOpenId(null); }} />}
    </div>
  );
}

// --- Component: "New verification" (modelled on the dashboard's Create order) ---
function NewVerification({ onClose, onCreated }) {
  const [program, setProgram] = useState(PROGRAMS[0]);
  const [products, setProducts] = useState(['income']);
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', caseNumber: newCaseNumber() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = k => e => { const v = e.target.value; setF(prev => ({ ...prev, [k]: v })); };
  const tpl = templateFor(products);
  const other = PRODUCT_TYPES.find(p => !products.includes(p.id));
  const ready = f.first_name.trim() && f.last_name.trim() && (!f.email || /\S+@\S+\.\S+/.test(f.email));
  const channels = [f.email && `email to ${f.email}`, f.phone && `text to ${f.phone}`].filter(Boolean);

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try {
      const body = {
        products, template_id: tpl.id, order_number: f.caseNumber, demo_id: 'verifier-portal',
        first_name: f.first_name.trim(), last_name: f.last_name.trim(),
        ...(f.email && { email: f.email.trim() }), ...(f.phone && { phone: f.phone.replace(/\D/g, '') }),
      };
      const r = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) {
        const d = data.details;
        throw new Error(d?.error?.message || d?.detail || data.error || `Order creation failed (${r.status})`);
      }
      onCreated({
        id: data.order_id, user_id: data.user_id, truv_order_id: data.truv_order_id, share_url: data.share_url,
        template_fallback: data.template_fallback, caseNumber: f.caseNumber, program, products,
        first_name: body.first_name, last_name: body.last_name, email: body.email, phone: body.phone,
        parts: {}, created: today(),
      });
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <div class="cw-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <form class="cw-modal" onSubmit={submit}>
        <div class="cw-modal-head"><h2>New verification</h2><button type="button" class="cw-x" onClick={onClose} aria-label="Close">×</button></div>
        <div class="cw-modal-body">
          <div class="cw-form">
            <label class="cw-label">Program</label>
            <select class="cw-input" value={program} onChange={e => setProgram(e.target.value)}>{PROGRAMS.map(p => <option key={p}>{p}</option>)}</select>

            <label class="cw-label">Product type</label>
            {products.map((id, i) => (
              <div key={id} class="cw-prod-row">
                <select class="cw-input" value={id} onChange={e => setProducts(products.map((p, j) => (j === i ? e.target.value : p)))}>
                  {PRODUCT_TYPES.filter(p => p.id === id || !products.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {products.length > 1 && <button type="button" class="cw-link" onClick={() => setProducts(products.filter(p => p !== id))}>Remove</button>}
              </div>
            ))}
            {other && <button type="button" class="cw-add" onClick={() => setProducts([...products, other.id])}>+ Add product type</button>}

            <label class="cw-label">Template</label>
            <div class="cw-readonly">{tpl.name} <span class="cw-mono">{tpl.id.slice(0, 8)}…</span></div>
            <p class="cw-help">Picked from the product types above.</p>

            <div class="cw-two">
              <div><label class="cw-label">First name *</label><input class="cw-input" value={f.first_name} onInput={set('first_name')} /></div>
              <div><label class="cw-label">Last name *</label><input class="cw-input" value={f.last_name} onInput={set('last_name')} /></div>
            </div>
            <div class="cw-two">
              <div><label class="cw-label">Email</label><input class="cw-input" type="email" placeholder="name@domain.com" value={f.email} onInput={set('email')} /></div>
              <div><label class="cw-label">Phone</label><input class="cw-input" type="tel" placeholder="4155554193" value={f.phone} onInput={set('phone')} /></div>
            </div>
            <p class="cw-help">Use an inbox or phone you can check so you receive the link.</p>

            <label class="cw-label">Case number</label>
            <input class="cw-input cw-mono" value={f.caseNumber} onInput={set('caseNumber')} />
            <p class="cw-help">Sent to Truv as the order number, so the case and the order match.</p>
          </div>

          <div class="cw-summary">
            <h3>What happens next</h3>
            <ol>
              <li>Truv creates one order for <strong>{f.first_name || 'the applicant'}</strong> with {products.map(productName).join(' and ')}.</li>
              <li>{channels.length ? <>Truv sends the link by {channels.join(' and ')}.</> : <>No email or phone, so nothing is sent. Copy the link from the case and share it yourself.</>}</li>
              <li>The applicant connects their {products.length > 1 ? 'payroll and bank' : products[0] === 'income' ? 'payroll' : 'bank'} on their own device.</li>
              <li>The case shows each product's status, and the report once it's done.</li>
            </ol>
          </div>
        </div>
        {err && <p class="cw-err">{err}</p>}
        <div class="cw-modal-foot">
          <button type="button" class="cw-btn-ghost" onClick={onClose}>Cancel</button>
          <button class="cw-btn" disabled={!ready || busy}>{busy ? 'Sending…' : 'Send verification'}</button>
        </div>
      </form>
    </div>
  );
}

// --- Component: case detail drawer ---
function CaseDrawer({ c, onClose, onPatch, onDiscard }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [reports, setReports] = useState(null);
  const status = caseStatus(c);

  async function refresh() {
    setBusy('refresh'); setNote('');
    try {
      const r = await fetch(`${API_BASE}/api/orders/${c.id}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not refresh');
      const parts = partsFrom(data.raw_response || {});
      onPatch({ parts, share_url: data.share_url || c.share_url });
      setNote('Status updated from Truv.');
    } catch (e) { setNote(e.message); }
    setBusy('');
  }

  async function loadReports() {
    setBusy('report'); setNote('');
    const types = c.products.includes('assets') ? [...c.products, 'income_insights'] : c.products;
    const out = {};
    for (const t of types) {
      try {
        const r = await fetch(`${API_BASE}/api/users/${c.user_id}/reports/${t}`);
        if (r.ok) out[t] = await r.json();
      } catch { /* show what loaded */ }
    }
    setReports(out);
    if (!Object.keys(out).length) setNote('No report is ready yet.');
    setBusy('');
  }

  const copy = () => { navigator.clipboard?.writeText(c.share_url); setNote('Link copied.'); };

  return (
    <div class="cw-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class="cw-drawer">
        <div class="cw-modal-head">
          <div><h2>{c.first_name} {c.last_name}</h2><div class="cw-sub">Case <span class="cw-mono">{c.caseNumber}</span> · {c.program}</div></div>
          <button class="cw-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div class="cw-drawer-body">
          <StatusPill status={status} />
          {c.sample && <p class="cw-help">Sample case for illustration. It isn't a Truv order, so it can't be refreshed.</p>}
          {c.template_fallback && <p class="cw-help">These API keys don't own the demo template, so Truv used the account's default template.</p>}

          <h3>Products</h3>
          <ul class="cw-parts">
            {c.products.map(p => <li key={p}><span>{productName(p)}</span><span class="cw-mono">{c.parts?.[p] || 'pending'}</span></li>)}
          </ul>

          <h3>Contact</h3>
          <p>{c.email || 'No email'} · {c.phone || 'No phone'}</p>

          {c.share_url && (<>
            <h3>Verification link</h3>
            <p class="cw-mono cw-url">{c.share_url}</p>
            <div class="cw-row">
              <button class="cw-btn-ghost" onClick={copy}>Copy link</button>
              <a class="cw-btn-ghost" href={c.share_url} target="_blank" rel="noopener noreferrer">Open as applicant</a>
            </div>
          </>)}

          {!c.sample && (
            <div class="cw-row cw-gap">
              <button class="cw-btn" disabled={!!busy} onClick={refresh}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh status'}</button>
              {status === 'done' || status === 'partial'
                ? <button class="cw-btn-ghost" disabled={!!busy} onClick={loadReports}>{busy === 'report' ? 'Loading…' : 'View report'}</button>
                : null}
              <button class="cw-link" onClick={onDiscard}>Remove from list</button>
            </div>
          )}
          {note && <p class="cw-help">{note}</p>}

          {reports && (
            <div class="cw-reports">
              {reports.income && <VoieReport report={reports.income} />}
              {reports.assets && <AssetsReport report={reports.assets} />}
              {reports.income_insights && <IncomeInsightsReport report={reports.income_insights} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
