/**
 * FILE SUMMARY: Public Sector tool: Sandbox Data Playground.
 * ROUTE: #public-sector/sandbox-playground   (and /standard, /mine, /build, /pdfs)
 *
 * Two kinds of sandbox login, side by side:
 *   Standard logins   what every Truv account has (goodlogin, error.user, ...), searchable
 *   Your scenarios    a login you pair with the exact data Truv returns, made and managed here
 * Every login can be tried: run for you, or opened in Bridge.
 *
 * DATA FLOW (all through /api/sandbox/*, see server/routes/sandbox.js):
 *   scenarios   GET/POST /v1/sandbox/scenarios/, PATCH/DELETE .../{id}/, POST .../resolve/
 *   PDFs        GET/POST /v1/sandbox/documents/, PATCH/DELETE .../{id}/
 *   try         POST /v1/orders/, POST /v1/checks/, GET /v1/tasks/, GET /v1/orders/{id}/
 * Every Truv request is shown in the Dev panel's API tab. Nothing is stored on the server.
 */
import { useCallback, useEffect, useErrorBoundary, useMemo, useRef, useState } from 'preact/hooks';
import { Layout } from '../components/Layout.jsx';
import { api, isOk } from '../sandbox/api.js';
import {
  blankScenario, PRESETS, validate, toCreateBody, toUpdateBody, duplicate, suggestUsername, refreshDates, describeError, errorText, explain, todayISO,
} from '../sandbox/model.js';
import * as store from '../sandbox/store.js';
import { StandardLogins } from '../sandbox/StandardLogins.jsx';
import { Scenarios } from '../sandbox/Scenarios.jsx';
import { Builder } from '../sandbox/Builder.jsx';
import { Documents } from '../sandbox/Documents.jsx';
import { TryIt } from '../sandbox/TryIt.jsx';
import { Resolve } from '../sandbox/Resolve.jsx';
import { ConfirmDialog, Notice, ToastRegion, useToasts, plural, scrollBehavior } from '../sandbox/ui.jsx';
import '../sandbox/sandbox.css';

const TABS = ['standard', 'mine', 'build', 'pdfs'];

const STEPS = [
  {
    title: 'Standard logins',
    guide: '<p>These exist on every account. Sign in with one to the <strong>Truv Payroll Provider</strong> (or <strong>Truv Bank</strong> for assets) in Bridge. Try signs in for you, the way Bridge does:</p><pre>POST /v1/orders/\n{ "products": ["income"] }\n\nPOST /v1/checks/\nX-Bridge-Token: &lt;employers[0].bridge_token&gt;\n{ "employee_login": "goodlogin",\n  "employee_password": "goodpassword",\n  "payroll_provider_id": "truv",\n  "product_type": "income" }</pre><p>Then read <code>GET /v1/tasks/?user_id=</code> until a task ends, and <code>GET /v1/orders/{id}/</code> for the data.</p>',
  },
  {
    title: 'Scenarios',
    guide: '<p>Scenarios belong to the account, so everyone on the sandbox key sees the same list.</p><pre>GET    /v1/sandbox/scenarios/\nPATCH  /v1/sandbox/scenarios/{id}/\nDELETE /v1/sandbox/scenarios/{id}/\nPOST   /v1/sandbox/scenarios/resolve/</pre><p>The list is cursor-paginated, so this follows <code>next</code> to the end. <strong>Resolve</strong> is a dry run: it says which scenario would answer a login. A production key gets <code>403 env_not_sandbox</code>.</p>',
  },
  {
    title: 'Build',
    guide: '<p>A scenario is one flat object: what it matches on, how the task behaves, and what it returns.</p><pre>POST /v1/sandbox/scenarios/\n{ "data_source": "payroll",\n  "label": "Salaried, biweekly",\n  "username": "qa.salaried",\n  "password": "s4ndb0x",\n  "behavior_status": "done",\n  "payload": { "employments": [ ... ] } }</pre><p>Two scenarios cannot have the same matching fields, and the built-in logins are reserved. <code>PATCH</code> replaces each top-level key you send, <code>payload</code> included.</p>',
  },
  {
    title: 'PDFs',
    guide: '<p>Upload a PDF once, then reference its id from any paystub or W-2.</p><pre>POST /v1/sandbox/documents/\n{ "filename": "paystub.pdf",\n  "content": "&lt;base64&gt;" }\n\nDELETE /v1/sandbox/documents/{id}/</pre><p>A file a scenario still uses cannot be deleted: Truv answers <code>409 resource_in_use</code>.</p>',
  },
];

const clone = (o) => JSON.parse(JSON.stringify(o));

// An unsaved draft is kept for the visit, so leaving this page and coming back does not lose it.
const STASH = 'sbx-draft';
function readStash() {
  try { const v = JSON.parse(sessionStorage.getItem(STASH)); return v && typeof v === 'object' && v.draft ? v : null; } catch { return null; }
}
function writeStash(value) {
  try { if (value) sessionStorage.setItem(STASH, JSON.stringify(value)); else sessionStorage.removeItem(STASH); } catch { /* storage can be blocked */ }
}

// Anything that goes wrong while drawing a tab lands here instead of leaving a blank page.
function Guarded({ children, onReset }) {
  const [error, reset] = useErrorBoundary();
  if (!error) return children;
  return (
    <Notice tone="bad" title="Something went wrong showing this tab" action={<button type="button" class="sbx-btn ghost small" onClick={() => { onReset?.(); reset(); }}>Start this tab again</button>}>
      {String(error?.message || error)}
    </Notice>
  );
}

export function SandboxPlayground({ screen }) {
  const stash = useRef(undefined);
  if (stash.current === undefined) stash.current = readStash();
  const [tab, setTab] = useState(TABS.includes(screen) ? screen : 'standard');
  const [mode, setMode] = useState('checking');          // checking | ok | production | signedout | error
  const [scenarios, setScenarios] = useState(null);
  const [documents, setDocuments] = useState(null);
  const restoreEditId = useRef(stash.current?.editingId || null);
  const listLoaded = useRef(false);
  // The lists start as null until the first load, and a change can land before it does.
  const changeScenarios = (fn) => setScenarios(prev => fn(prev ?? []));
  const changeDocuments = (fn) => setDocuments(prev => fn(prev ?? []));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [log, setLog] = useState([]);
  const [bridgeEvents, setBridgeEvents] = useState([]);
  const [made, setMade] = useState(() => store.loadMade());
  const [trash, setTrash] = useState(() => store.loadTrash());
  const [prefix, setPrefixState] = useState(() => store.loadPrefix());
  // Today moves on if the page is left open past midnight, so presets and date moves do not use yesterday.
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => { const t = setInterval(() => setToday(prev => { const now = todayISO(); return now === prev ? prev : now; }), 60_000); return () => clearInterval(t); }, []);

  const [draft, setDraftState] = useState(() => stash.current?.draft || freshDraft(today));
  // A restored draft counts as unsaved, so its baseline is deliberately different from it.
  const [baseline, setBaseline] = useState(() => (stash.current ? '' : JSON.stringify(freshDraft(today))));
  const [editing, setEditing] = useState(null);
  // The jobs a preset would replace without asking: what the form opened with, unless it was a copy or a restored draft.
  const [pristine, setPristine] = useState(() => (stash.current ? JSON.stringify(freshDraft(todayISO()).payload) : undefined));
  const [openCount, setOpenCount] = useState(0);        // changes whenever a different draft is opened, so the form starts afresh
  const [askDiscard, setAskDiscard] = useState(null);     // { run } waiting for a yes
  const draftNow = useRef(draft);
  draftNow.current = draft;
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [serverIssues, setServerIssues] = useState(null);   // { draft, list }

  const [trying, setTrying] = useState(null);
  const [resolving, setResolving] = useState(null);
  const { toasts, push, dismiss, pause, resume } = useToasts();
  const docCache = useRef(new Map());

  useEffect(() => {
    document.title = 'Sandbox Data Playground | Truv Demo Apps';
    // Arriving from the hub keeps its scroll position, which would drop you into the middle of this page.
    window.scrollTo(0, 0);
    document.querySelector('main')?.scrollTo?.(0, 0);
  }, []);
  // A link to another tab (or the back button) changes the route's last part.
  useEffect(() => { if (TABS.includes(screen)) setTab(screen); }, [screen]);
  // The page rewrites the hash itself as tabs change, so the route prop can lag behind it.
  useEffect(() => {
    const onHash = () => {
      if (!location.hash.startsWith('#public-sector/sandbox-playground')) return;
      const t = location.hash.split('/').pop();
      if (TABS.includes(t)) setTab(t);
      else { setTab('standard'); try { window.history.replaceState(null, '', '#public-sector/sandbox-playground/standard'); } catch { /* cosmetic */ } }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // --- Talking to the server ---

  const logCalls = useCallback((calls) => {
    if (calls?.length) setLog(prev => [...calls.slice().reverse().map(c => ({ ...c, id: `${c.id}-${Math.random().toString(36).slice(2, 6)}` })), ...prev].slice(0, 300));
  }, []);
  // quiet: the caller logs the calls itself, so a poll does not fill the Dev panel.
  const call = useCallback(async (method, path, body, { quiet = false } = {}) => {
    const env = await api(method, path, body);
    if (!quiet) logCalls(env.calls);
    return env;
  }, [logCalls]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, d] = await Promise.all([call('GET', '/scenarios'), call('GET', '/documents')]);
    setLoading(false);
    if (isOk(s)) {
      setScenarios(s.data.results);
      listLoaded.current = true;
      setLoadError(null);
      setMode('ok');
      if (s.data.truncated) push('Only the first scenarios could be loaded. Delete some to see the rest.', { tone: 'warn', ms: 0 });
      // A draft restored from before is an edit of a scenario that still exists, if it does.
      const wanted = restoreEditId.current;
      restoreEditId.current = null;
      const found = wanted && s.data.results.find(x => x.id === wanted);
      if (found) { setEditing(found); setBaseline(JSON.stringify(found)); }
    } else {
      const err = describeError(s);
      const blockedNow = err.code === 'env_not_sandbox' || err.code === 'session_required';
      // A reload that fails keeps what was already on screen; only a first load, or a blocked key, empties it.
      setMode(blockedNow ? (err.code === 'env_not_sandbox' ? 'production' : 'signedout') : (listLoaded.current ? 'ok' : 'error'));
      if (blockedNow) setScenarios([]);
      setLoadError(blockedNow ? null : err);
    }
    if (isOk(d)) setDocuments(d.data.results);
    else setDocuments(prev => (prev === null && /env_not_sandbox|session_required/.test(describeError(d).code || '') ? [] : prev));
  }, [call, push]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const blocked = mode === 'production' || mode === 'signedout';
  const guardMessage = mode === 'production' ? describeError({ status: 403, data: { error: { code: 'env_not_sandbox' } } }) : mode === 'signedout' ? describeError({ status: 401, data: {} }) : null;

  // --- Tabs ---

  function go(next, { replace = false } = {}) {
    setTab(next);
    const hash = `#public-sector/sandbox-playground/${next}`;
    // Going to the page you are already on adds nothing to the history, or Back would seem to do nothing.
    const how = replace || location.hash === hash ? 'replaceState' : 'pushState';
    try { window.history[how](null, '', hash); } catch { /* the address bar is cosmetic */ }
  }
  // An address that names no tab shows the first one, so the address should say so.
  useEffect(() => {
    const last = location.hash.split('/').pop();
    if (location.hash.startsWith('#public-sector/sandbox-playground') && !TABS.includes(last)) go(TABS.includes(screen) ? screen : 'standard', { replace: true });
  }, []);

  // --- The builder ---

  const dirty = JSON.stringify(draft) !== baseline;
  const setDraft = useCallback((updater) => {
    setDraftState(prev => (typeof updater === 'function' ? updater(prev) : updater));
    setServerError(null);
  }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Keep an unsaved draft for the visit, and tell the person when one comes back.
  useEffect(() => { writeStash(dirty ? { draft, editingId: editing?.id || null } : null); }, [draft, dirty, editing]);
  useEffect(() => { if (stash.current) push('Your unsaved draft is back. Open the Build tab to carry on.', { ms: 9000 }); }, []);

  const issues = useMemo(() => {
    const local = validate(draft, { others: scenarios || [], self: editing, requireNew: !editing });
    const remote = serverIssues && serverIssues.draft === draft ? serverIssues.list : [];
    return [...local, ...remote];
  }, [draft, scenarios, editing, serverIssues]);

  // `unsaved` marks a copy that exists nowhere yet, so it counts as changed from the start.
  function open(body, scenario = null, { unsaved = false } = {}) {
    setDraftState(body); setBaseline(unsaved ? '' : JSON.stringify(body)); setEditing(scenario); setServerError(null); setServerIssues(null);
    setOpenCount(n => n + 1);
    setPristine(unsaved ? '' : JSON.stringify(body.payload ?? null));
    go('build');
  }
  // Anything that would throw away unsaved changes asks first.
  const guarded = (fn) => (...args) => (dirty ? setAskDiscard({ run: () => fn(...args) }) : fn(...args));
  function newScenario() { open(freshDraft(today)); }
  function editScenario(s) { open(clone(s), s); }
  function copyScenario(s) {
    const taken = (scenarios || []).map(x => x.username);
    const copy = duplicate(s, { label: `${s.label} (copy)`, username: suggestUsername(`${s.label} copy`, prefix, taken) });
    open(copy, null, { unsaved: true });
    push(`Copied as "${copy.label}". Check the name and login, then create it.`, { ms: 7000 });
  }
  function refreshVersion(s) {
    const copy = { ...duplicate(s, { label: `${s.label} (after refresh)`, username: s.username }), is_refresh: true };
    open(copy, null, { unsaved: true });
    push('This version only answers refreshes. Change the data to show what is different after one.', { ms: 8000 });
  }
  function discard() {
    if (editing) { setEditing(null); setDraftState(freshDraft(today)); setBaseline(JSON.stringify(freshDraft(today))); setOpenCount(n => n + 1); setPristine(JSON.stringify(freshDraft(today).payload)); go('mine'); }
    else newScenario();
  }

  async function save(how) {
    const problems = issues.filter(i => i.level === 'error');
    if (problems.length) {
      setServerError(null);
      document.querySelector('.sbx-issues')?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      return;
    }
    setSaving(true); setServerError(null); setServerIssues(null);
    const sent = draft;
    const env = editing
      ? await call('PATCH', `/scenarios/${editing.id}`, toUpdateBody(sent))
      : await call('POST', '/scenarios', toCreateBody(sent));
    setSaving(false);
    if (editing && env.status === 404) {
      // Someone deleted it while it was open here. Keep the work, and let the next save make it again.
      setEditing(null); setBaseline('');
      changeScenarios(l => l.filter(x => x.id !== editing.id));
      push('This scenario was deleted somewhere else, so nothing was saved. Your changes are still here: saving again creates it anew.', { tone: 'warn', ms: 12000 });
      return;
    }
    if (!isOk(env)) {
      const err = describeError(env);
      setServerError(err);
      setServerIssues({ draft: sent, list: err.fields.filter(f => f.path).map(f => ({ level: 'error', path: f.path, message: f.message })) });
      setTimeout(() => document.querySelector('.sbx-builder .sbx-notice-bad')?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }), 50);
      return;
    }
    const saved = env.data;
    changeScenarios(list => (editing ? list.map(s => (s.id === saved.id ? saved : s)) : [...list, saved]));
    if (!editing) { store.rememberMade(saved.id); setMade(store.loadMade()); }
    setEditing(saved); setBaseline(JSON.stringify(saved));
    // Typing that happened while the save was in flight is kept, and still counts as unsaved.
    if (draftNow.current === sent) setDraftState(clone(saved));
    if (how === 'try') setTrying(tryTarget(saved));
    else push(`${editing ? 'Saved' : 'Created'} ${saved.label}.`, { action: saved.data_source === 'payroll' ? { label: 'Try it', run: () => setTrying(tryTarget(saved)) } : undefined });
  }

  // --- Managing ---

  // A scenario open in Build with unsaved edits is left alone: changing it from the list would be overwritten by the next save.
  const openAndDirty = (s) => editing?.id === s.id && dirty;
  const OPEN_NOTE = 'That scenario is open in Build with unsaved changes. Save or discard them first.';

  async function toggle(s, enabled) {
    if (openAndDirty(s)) { push(OPEN_NOTE, { tone: 'warn' }); return; }
    const env = await call('PATCH', `/scenarios/${s.id}`, { enabled });
    if (isOk(env)) {
      changeScenarios(list => list.map(x => (x.id === s.id ? env.data : x)));
      if (editing?.id === s.id) { setEditing(env.data); setDraftState(clone(env.data)); setBaseline(JSON.stringify(env.data)); }
    } else if (env.status === 404) { push(`${s.label} was deleted somewhere else. The list was reloaded.`, { tone: 'warn' }); loadAll(); }
    else push(`${describeError(env).title}. ${s.label} was not changed.`, { tone: 'bad' });
  }

  async function remove(list) {
    const gone = [];
    const alreadyGone = [];
    const failed = [];
    for (const s of list) {
      const env = await call('DELETE', `/scenarios/${s.id}`);
      if (env.status === 204) gone.push(s);
      else if (env.status === 404) alreadyGone.push(s);
      else failed.push({ s, err: describeError(env) });
    }
    if (alreadyGone.length) {
      changeScenarios(l => l.filter(x => !alreadyGone.some(g => g.id === x.id)));
      push(alreadyGone.length === 1 ? `${alreadyGone[0].label} was already deleted somewhere else.` : `${alreadyGone.length} of them were already deleted somewhere else.`, { tone: 'warn' });
    }
    if (gone.length) {
      changeScenarios(l => l.filter(x => !gone.some(g => g.id === x.id)));
      const kept = store.pushTrash(gone.map(g => toCreateBody(g)));
      setTrash(kept);
      const entries = kept.slice(0, gone.length);
      store.forgetMade(gone.map(g => g.id));
      setMade(store.loadMade());
      if (editing && gone.some(g => g.id === editing.id)) { setEditing(null); setDraftState(freshDraft(today)); setBaseline(JSON.stringify(freshDraft(today))); }
      push(gone.length === 1 ? `Deleted ${gone[0].label}.` : `Deleted ${gone.length} scenarios.`, { action: { label: 'Undo', run: () => restoreMany(entries.map(t => ({ body: t.scenario, trashId: t.id }))) }, ms: 12000 });
    }
    if (failed.length) push(`${plural(failed.length, 'scenario')} could not be deleted: ${failed[0].err.title}.`, { tone: 'bad', ms: 0 });
  }

  const restoring = useRef(new Set());
  async function restoreMany(items) {
    let ok = 0;
    for (const { body, trashId } of items) {
      if (restoring.current.has(trashId)) continue;       // a second press while it is being brought back
      restoring.current.add(trashId);
      const env = await call('POST', '/scenarios', body);
      if (isOk(env)) {
        ok++;
        changeScenarios(l => [...l, env.data]);
        store.rememberMade(env.data.id);
        setTrash(store.dropTrash(trashId));
      } else push(`${body.label} could not be brought back. ${errorText(describeError(env))}`, { tone: 'bad', ms: 0 });
      restoring.current.delete(trashId);
    }
    setMade(store.loadMade());
    if (ok) push(ok === 1 ? 'Restored. Its id changed, so update anything that used the old one.' : `Restored ${ok} scenarios. Their ids changed.`);
  }
  async function importOne(body) {
    const env = await call('POST', '/scenarios', body);
    if (isOk(env)) {
      changeScenarios(l => [...l, env.data]);
      store.rememberMade(env.data.id);
      setMade(store.loadMade());
      return { ok: true };
    }
    return { ok: false, message: errorText(describeError(env)) };
  }
  const restore = (entry) => restoreMany([{ body: entry.scenario, trashId: entry.id }]);
  const forget = (entry) => setTrash(store.dropTrash(entry.id));

  async function moveDates(s) {
    if (openAndDirty(s)) { push(OPEN_NOTE, { tone: 'warn' }); return; }
    const { payload, changed } = refreshDates(s.payload, today);
    if (!changed) { push('Every paystub is already current.'); return; }
    const env = await call('PATCH', `/scenarios/${s.id}`, { payload });
    if (!isOk(env)) { push(`${describeError(env).title}. The dates were not moved.`, { tone: 'bad' }); return; }
    changeScenarios(l => l.map(x => (x.id === s.id ? env.data : x)));
    if (editing?.id === s.id) { setEditing(env.data); setDraftState(clone(env.data)); setBaseline(JSON.stringify(env.data)); }
    push(`Moved the paystub dates in ${s.label}.`, {
      action: { label: 'Undo', run: async () => { const back = await call('PATCH', `/scenarios/${s.id}`, { payload: s.payload }); if (isOk(back)) { changeScenarios(l => l.map(x => (x.id === s.id ? back.data : x))); push('Put the dates back.'); } } },
      ms: 12000,
    });
  }
  function moveDraftDates() {
    const { payload, changed, skipped } = refreshDates(draft.payload, today);
    if (changed) { setDraft(d => ({ ...d, payload })); push(`Moved the paystub dates. Save to keep them.`); }
    else push(skipped ? 'The pay frequency on this scenario cannot be moved automatically.' : 'Every paystub is already current.');
  }

  // --- PDFs ---

  async function upload({ filename, content }) {
    const env = await call('POST', '/documents', { filename, content });
    if (isOk(env)) {
      docCache.current.set(env.data.id, { filename, content });
      changeDocuments(l => [...(l || []), env.data]);
      push(`Uploaded ${filename}.`);
      return { ok: true };
    }
    return { ok: false, message: errorText(describeError(env)) };
  }
  async function rename(doc, filename) {
    const env = await call('PATCH', `/documents/${doc.id}`, { filename });
    if (isOk(env)) { changeDocuments(l => l.map(x => (x.id === doc.id ? env.data : x))); push('Renamed.'); }
    else push(errorText(describeError(env)), { tone: 'bad', ms: 0 });
  }
  async function removeDoc(doc) {
    const env = await call('DELETE', `/documents/${doc.id}`);
    if (env.status === 204 || env.status === 404) {
      changeDocuments(l => l.filter(x => x.id !== doc.id));
      const kept = docCache.current.get(doc.id);
      const name = doc.uploaded_file?.filename || doc.id;
      push(`Deleted ${name}.`, kept ? { action: { label: 'Undo', run: () => upload(kept) }, ms: 12000 } : {});
    } else {
      const err = describeError(env);
      push(`${err.title}. ${err.hint || err.detail}`, { tone: 'bad', ms: 0 });
    }
  }

  // --- Trying ---

  const tryStandard = (row) => setTrying({ kind: 'standard', login: row.login, password: row.password, status: row.status, label: `${row.login} / ${row.password}`, products: row.products });
  const tryTarget = (s) => ({ kind: 'scenario', login: s.username, password: s.password || '', label: s.label, products: s.products?.length ? s.products : ['income', 'employment', 'deposit_switch', 'pll'], scenario: s });
  const addBridgeEvent = useCallback((type, data) => setBridgeEvents(prev => [...prev, { type, data, timestamp: Date.now() }]), []);

  const panel = { apiLogs: log, bridgeEvents, webhooks: [], tunnelUrl: null, currentStep: TABS.indexOf(tab) };
  const listsReady = !blocked && mode !== 'error';
  const counts = { mine: listsReady && scenarios ? scenarios.length : null, pdfs: listsReady && documents ? documents.length : null };
  const tabLabel = { standard: 'Standard logins', mine: 'Scenarios', build: 'Build', pdfs: 'PDFs' };

  return (
    <Layout steps={STEPS} panel={panel} theme="checkr">
      <div class="sbx">
        <header class="sbx-title">
          <h1>Sandbox Data Playground</h1>
          <p>Use the logins every account has, or build your own that return exactly the data you choose. Every request is logged in the Dev panel.</p>
        </header>

        {guardMessage && (
          <Notice tone="bad" title={guardMessage.title}>{[guardMessage.detail, guardMessage.hint].filter(Boolean).join(' ')}</Notice>
        )}

        {tab !== 'standard' && loadError && (
          <Notice
            tone="bad"
            title="This list could not be loaded"
            action={<button type="button" class="sbx-btn ghost small" onClick={loadAll} disabled={loading}>{loading ? 'Trying...' : 'Try again'}</button>}
          >
            {explain(loadError)}
          </Notice>
        )}

        <div class="sbx-tabs" role="tablist" aria-label="Sandbox Data Playground">
          {TABS.map(t => (
            <button
              key={t} type="button" role="tab" id={`sbx-tab-${t}`} aria-selected={tab === t} aria-controls={`sbx-panel-${t}`} tabIndex={tab === t ? 0 : -1}
              onClick={() => go(t)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(t);
                const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS.at(-1) : null;
                if (next) { e.preventDefault(); go(next, { replace: true }); document.getElementById(`sbx-tab-${next}`)?.focus(); }
              }}
            >
              {tabLabel[t]}
              {counts[t] !== undefined && counts[t] !== null && <span class="sbx-tab-n">{counts[t]}</span>}
              {t === 'build' && dirty && <span class="sbx-tab-dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>

        <div class="sbx-panel" role="tabpanel" id={`sbx-panel-${tab}`} aria-labelledby={`sbx-tab-${tab}`}>
          {tab === 'standard' && <StandardLogins onGo={go} onTry={blocked ? () => push(guardMessage.hint || guardMessage.detail, { tone: 'bad' }) : tryStandard} />}
          <Guarded onReset={() => { setDraftState(freshDraft(today)); setBaseline(JSON.stringify(freshDraft(today))); setEditing(null); }}>
          {tab === 'mine' && (blocked || mode === 'error' ? <p class="sbx-small">{mode === 'error' ? 'Nothing to show until the list loads.' : 'Nothing to show until this is a sandbox key.'}</p> : (
            <Scenarios
              scenarios={scenarios} loading={loading} blocked={blocked} today={today} made={made} trash={trash}
              onNew={guarded(newScenario)} onEdit={guarded(editScenario)} onDuplicate={guarded(copyScenario)} editingId={editing?.id} unsaved={dirty} onTry={(s) => setTrying(tryTarget(s))} onToggle={toggle}
              onDelete={remove} onImportOne={importOne} onRestore={restore} onForget={forget} onReload={loadAll} onMoveDates={moveDates} onCheck={setResolving}
            />
          ))}
          {tab === 'build' && (blocked ? <p class="sbx-small">Building needs a sandbox key.</p> : (
            <Builder
              key={openCount}
              pristine={pristine}
              focusHeading={openCount > 0}
              draft={draft} setDraft={setDraft} editing={editing} dirty={dirty} issues={issues} serverError={serverError}
              documents={documents || []} scenarios={scenarios || []} today={today} prefix={prefix}
              onPrefix={(p) => { setPrefixState(p); store.savePrefix(p); }}
              onSave={save} saving={saving} onDiscard={guarded(discard)} onMoveDates={moveDraftDates} onCheck={setResolving} onRefreshVersion={guarded(refreshVersion)}
            />
          ))}
          {tab === 'pdfs' && (blocked || mode === 'error' ? <p class="sbx-small">{mode === 'error' ? 'Nothing to show until the list loads.' : 'Nothing to show until this is a sandbox key.'}</p> : (
            <Documents
              documents={documents} scenarios={scenarios || []} loading={loading}
              onUpload={upload} onRename={rename} onDelete={removeDoc} onReload={loadAll} cached={(id) => docCache.current.has(id)}
            />
          ))}
          </Guarded>
        </div>
      </div>

      <ConfirmDialog
        open={!!askDiscard}
        danger
        title="Discard unsaved changes?"
        confirmLabel="Discard"
        onCancel={() => setAskDiscard(null)}
        onConfirm={() => { const next = askDiscard; setAskDiscard(null); next.run(); }}
      >
        <p>Your edits on the Build tab will be lost.</p>
      </ConfirmDialog>

      <TryIt target={trying} onClose={() => setTrying(null)} call={call} logCalls={logCalls} onBridgeEvent={addBridgeEvent} />
      <Resolve seed={resolving} onClose={() => setResolving(null)} call={call} onEdit={guarded(editScenario)} />
      <ToastRegion toasts={toasts} dismiss={dismiss} pause={pause} resume={resume} />
    </Layout>
  );
}

// A new scenario starts as a salaried example so the form is not empty.
function freshDraft(today) {
  return { ...blankScenario(), payload: PRESETS.find(p => p.id === 'salaried').build(today).payload };
}
