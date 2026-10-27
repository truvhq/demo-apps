/**
 * FILE SUMMARY: The scenarios on this account: find them, turn them on and off, try them, copy them,
 * and delete them. Deleting always asks first and keeps a copy, so it can be undone.
 */
import { useMemo, useState, useEffect, useRef } from 'preact/hooks';
import { DATA_SOURCES, DATA_SOURCE_LABELS, LIMITS, SORTS, summarizeScenario, lint, toCreateBody, toBundle, toCurl, toCurlScript, toPostman, orderKeys, ago, matchesQuery, sortScenarios } from './model.js';
import { Import } from './Import.jsx';
import { JsonViewer } from './JsonViewer.jsx';
import { TRASH_LIMIT } from './store.js';
import { Chip, ConfirmDialog, Copyable, CopyButton, Dialog, Spinner, plural } from './ui.jsx';

// A scenario kept on the account may have been written by anything. A value that cannot be read must not take the list down with it.
const safely = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// Saves text as a file the person picks up from their downloads.
function save(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const exports = (list, today) => [
  { label: 'JSON file (Import reads it back)', run: () => save(`sandbox-scenarios-${today}.json`, `${JSON.stringify(toBundle(list), null, 2)}\n`, 'application/json') },
  { label: 'curl script', run: () => save(`sandbox-scenarios-${today}.sh`, `${toCurlScript(list)}\n`, 'text/x-shellscript') },
  { label: 'Postman collection', run: () => save(`sandbox-scenarios-${today}.postman_collection.json`, `${JSON.stringify(toPostman(list), null, 2)}\n`, 'application/json') },
];

// A button that opens a short list of actions. Arrow keys move through them; Escape or a click
// elsewhere closes it and Escape hands focus back to the button.
function Menu({ label, items, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const entries = () => [...(ref.current?.querySelectorAll('[role="menuitem"]') || [])];
  useEffect(() => {
    if (!open) return undefined;
    entries()[0]?.focus();
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  function keys(e) {
    if (!open) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } return; }
    const list = entries();
    const at = list.indexOf(document.activeElement);
    const go = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); ref.current?.querySelector('button')?.focus(); }
    else if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  }
  return (
    <span class="sbx-menu" ref={ref} onKeyDown={keys}>
      <button type="button" class="sbx-btn ghost small" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && (
        <ul class="sbx-menu-list" role="menu">
          {items.filter(Boolean).map(it => (
            <li key={it.label} role="none">
              <button type="button" role="menuitem" tabIndex={-1} class={it.danger ? 'danger' : ''} onClick={() => { ref.current?.querySelector('button')?.focus(); setOpen(false); it.run(); }}>{it.label}</button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} class="sbx-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span class="sbx-switch-knob" />
      <span class="sbx-sr">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

export function Scenarios({
  scenarios, loading, blocked, today, made, trash,
  onNew, onEdit, onDuplicate, onTry, onToggle, onDelete, onRestore, onForget, onReload, onMoveDates, onCheck, onImportOne, onUpdateOne, onSuite, editingId, unsaved, initialQuery = '', onQuery,
}) {
  const [query, setQueryState] = useState(initialQuery);
  const setQuery = (v) => { setQueryState(v); onQuery?.(v); };
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('name');
  const [onlyMade, setOnlyMade] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);   // { list }
  const [datesFor, setDatesFor] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refocus, setRefocus] = useState(0);
  // After a delete the button that was pressed is gone, so focus goes to the search box once the dialog has closed.
  // A short wait, because the dialog hands focus back to the removed button as it closes.
  useEffect(() => { if (!refocus) return undefined; const t = setTimeout(() => document.getElementById('sbx-s-search')?.focus(), 80); return () => clearTimeout(t); }, [refocus]);

  const list = scenarios || [];
  const shown = useMemo(() => sortScenarios(list.filter(s => (
    (source === 'all' || s.data_source === source)
    && (!onlyMade || made.has(s.id))
    && safely(() => matchesQuery(s, query), true)
  )), sort), [list, source, onlyMade, query, made, sort]);
  const stale = useMemo(() => shown.filter(s => safely(() => lint(s, today, list), []).some(n => n.id === 'stale')), [shown, list, today]);

  // Selection only keeps ids that still exist.
  useEffect(() => { setSelected(prev => new Set([...prev].filter(id => list.some(s => s.id === id)))); }, [scenarios]);

  const sources = DATA_SOURCES.filter(d => list.some(s => s.data_source === d));
  const madeCount = list.filter(s => made.has(s.id)).length;
  const allShownSelected = shown.length > 0 && shown.every(s => selected.has(s.id));
  const chosen = list.filter(s => selected.has(s.id));

  function toggleSelected(id) { setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setSelected(allShownSelected ? new Set() : new Set(shown.map(s => s.id))); }

  async function runDelete() {
    setBusy(true);
    // Whatever happens, the dialog must be closable again afterwards.
    try { await onDelete(confirm.list); } catch { /* the page reports what failed */ } finally { setBusy(false); }
    setConfirm(null);
    setSelected(new Set());
    setRefocus(n => n + 1);
  }

  const notMine = (confirm?.list || []).filter(s => !made.has(s.id));

  if (blocked) return null;

  return (
    <div class="sbx-scenarios">
      <h2 class="sbx-sr">Scenarios</h2>
      <div class="sbx-intro">
        <p>A scenario is a test login paired with the exact data Truv returns for it. They are shared by everyone who uses a sandbox key on this account, so name yours clearly.</p>
      </div>

      <p class="sbx-sr" role="status">{scenarios ? `${plural(shown.length, 'scenario')} shown${selected.size ? `, ${selected.size} selected` : ''}` : ''}</p>

      <div class="sbx-toolbar">
        <div class="sbx-search">
          <label for="sbx-s-search" class="sbx-sr">Search your scenarios</label>
          <input id="sbx-s-search" type="search" placeholder="Search by name, login, employer or notes" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <div class="sbx-toolbar-end">
          <button type="button" class="sbx-btn ghost small" onClick={onReload} disabled={loading}>{loading ? 'Loading...' : 'Reload list'}</button>
          <button type="button" class="sbx-btn ghost small" onClick={() => setImporting(true)}>Import</button>
          <Menu label={list.length ? `Export all ${list.length}` : 'Export all'} ariaLabel={`${list.length ? `Export all ${list.length}` : 'Export all'} scenarios`} items={list.length ? exports(list, today) : []} />
          <button type="button" class="sbx-btn primary" onClick={() => onNew()}>New scenario</button>
        </div>
      </div>
      <div class="sbx-filterbar">
        {scenarios && (
        <div class="sbx-filters" role="group" aria-label="Show">
          <button type="button" class="sbx-pill" aria-pressed={source === 'all' && !onlyMade} onClick={() => { setSource('all'); setOnlyMade(false); }}>All<span class="sbx-sr">, </span><span class="sbx-pill-n">{list.length}</span></button>
          {sources.map(d => (
            <button type="button" key={d} class="sbx-pill" aria-pressed={source === d} onClick={() => setSource(d)}>
              {DATA_SOURCE_LABELS[d]}<span class="sbx-sr">, </span><span class="sbx-pill-n">{list.filter(s => s.data_source === d).length}</span>
            </button>
          ))}
          {madeCount > 0 && <button type="button" class="sbx-pill" aria-pressed={onlyMade} onClick={() => setOnlyMade(v => !v)} title="Scenarios created with this tool in this browser">Created in this browser<span class="sbx-sr">, </span><span class="sbx-pill-n">{madeCount}</span></button>}
        </div>
        )}
        <span class="sbx-filterbar-end">
          {scenarios && list.length > 1 && (
            <label class="sbx-sort">Sort by <select value={sort} onChange={(e) => setSort(e.currentTarget.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          )}
          {scenarios && stale.length > 0 && <button type="button" class="sbx-linkbtn" onClick={() => setDatesFor(stale)}>Update dates on {plural(stale.length, 'stale scenario')}</button>}
          {scenarios && list.length > 0 && <button type="button" class="sbx-linkbtn sbx-selectall-small" onClick={toggleAll}>{allShownSelected ? 'Clear selection' : 'Select all shown'}</button>}
          {scenarios && <span class="sbx-small">{list.length} of {LIMITS.scenarios} scenarios used</span>}
        </span>
      </div>

      {chosen.length > 0 && (
        <div class="sbx-bulk" role="region" aria-label="Selected scenarios">
          <strong>{plural(chosen.length, 'scenario')} selected</strong>
          <span class="sbx-bulk-actions">
            <button type="button" class="sbx-btn ghost small" onClick={() => setSelected(new Set())}>Clear</button>
            <button type="button" class="sbx-btn ghost small" onClick={() => onSuite(chosen)}>Run {chosen.length} headless</button>
            <button type="button" class="sbx-btn ghost small" onClick={() => setDatesFor(chosen)}>Update dates for {chosen.length}</button>
            <Menu label={`Export ${chosen.length}`} ariaLabel={`Export ${chosen.length} selected`} items={exports(chosen, today)} />
            <button type="button" class="sbx-btn danger small" onClick={() => setConfirm({ list: chosen })}>Delete {chosen.length}...</button>
          </span>
        </div>
      )}

      {loading && !scenarios && <p class="sbx-loading"><Spinner /> Loading your scenarios...</p>}

      {scenarios && list.length === 0 && (
        <div class="sbx-empty">
          <p><strong>No scenarios on this account yet.</strong></p>
          <p class="sbx-small">A scenario pairs a login with the exact data Truv should return for it.</p>
          <button type="button" class="sbx-btn primary" onClick={() => onNew()}>Make the first one</button>
        </div>
      )}

      {scenarios && list.length > 0 && (
        <>
          <div class="sbx-listhead">
            <label class="sbx-check"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select every scenario shown" /></label>
            <span aria-hidden="true">Scenario</span><span aria-hidden="true">Login</span><span aria-hidden="true">On</span><span />
          </div>
          <ul class="sbx-list">
            {shown.map(s => {
              const notes = safely(() => lint(s, today, list), []);
              return (
                <li key={s.id} class={`sbx-item${s.enabled === false ? ' is-off' : ''}${selected.has(s.id) ? ' is-selected' : ''}`}>
                  <label class="sbx-check"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} aria-label={`Select ${s.label}`} /></label>
                  <div class="sbx-item-main">
                    <p class="sbx-item-title">
                      <button type="button" class="sbx-linkbtn" onClick={() => onEdit(s)}>{String(s.label ?? '')}</button>
                      {s.data_source !== 'payroll' && <Chip>{DATA_SOURCE_LABELS[s.data_source] || s.data_source}</Chip>}
                      {made.has(s.id) && <Chip tone="info" title="Created with this tool in this browser">Created here</Chip>}
                      {s.is_refresh === true && <Chip>Refresh only</Chip>}
                      {s.is_refresh === false && <Chip>First sign-in only</Chip>}
                      {s.provider_id && <Chip>Provider {s.provider_id}</Chip>}
                    </p>
                    <p class="sbx-item-sum">{safely(() => summarizeScenario(s), '') || (s.data_source !== 'payroll' ? 'Data for ' + (DATA_SOURCE_LABELS[s.data_source] || s.data_source).toLowerCase() : 'No data')}</p>
                    {s.description && <p class="sbx-item-notes">{String(s.description)}</p>}
                    {notes.map(n => <p key={n.id} class={`sbx-lint sbx-lint-${n.level}`}>{n.text}</p>)}
                    {s.updated_at && Number.isFinite(Date.parse(s.updated_at)) && <p class="sbx-small sbx-item-updated">Updated <time dateTime={s.updated_at}>{ago(Date.parse(s.updated_at))}</time></p>}
                  </div>
                  <div class="sbx-item-login">
                    {s.username ? <Copyable value={s.username} what="username" /> : <span class="sbx-small">no username</span>}
                    {s.password ? <Copyable value={s.password} what="password" /> : <span class="sbx-small">any password</span>}
                  </div>
                  <div class="sbx-item-on"><Switch checked={s.enabled !== false} label={s.label} onChange={(v) => onToggle(s, v)} /></div>
                  <div class="sbx-actions sbx-actions-3">
                    {s.data_source === 'payroll' ? <button type="button" class="sbx-btn ghost small" onClick={() => onTry(s)} aria-label={`Try ${s.label}`}>Try</button> : <span />}
                    <button type="button" class="sbx-btn ghost small" onClick={() => onEdit(s)} aria-label={`Edit ${s.label}`}>Edit</button>
                    <Menu label="More" ariaLabel={`More actions for ${s.label}`} items={[
                      { label: 'Duplicate', run: () => onDuplicate(s) },
                      s.data_source === 'payroll' && { label: 'Check which scenario a login uses', run: () => onCheck(s) },
                      s.data_source === 'payroll' && { label: 'Update paystub dates', run: () => setDatesFor([s]) },
                      { label: 'View the JSON', run: () => setViewing(s) },
                      { label: 'Delete...', danger: true, run: () => setConfirm({ list: [s] }) },
                    ]} />
                  </div>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && (
            <div class="sbx-empty">
              <p><strong>Nothing matches.</strong></p>
              <button type="button" class="sbx-btn ghost" onClick={() => { setQuery(''); setSource('all'); setOnlyMade(false); setTimeout(() => document.getElementById('sbx-s-search')?.focus(), 0); }}>Clear the filters</button>
            </div>
          )}
        </>
      )}

      {trash.length > 0 && (
        <details class="sbx-trash">
          <summary>Recently deleted <span class="sbx-count">{trash.length}</span></summary>
          <p class="sbx-small">Kept in this browser so you can bring one back. Restoring makes a new scenario with the same name and data, and a new id.</p>
          <ul class="sbx-list">
            {trash.map(t => (
              <li key={t.id} class="sbx-item sbx-item-trash">
                <div class="sbx-item-main">
                  <p class="sbx-item-title">{t.scenario.label} <span class="sbx-small">deleted {ago(t.at)}</span></p>
                  <p class="sbx-item-sum">{t.scenario.username ? `${t.scenario.username} / ${t.scenario.password || 'any password'}` : ''}</p>
                </div>
                <div class="sbx-actions">
                  <button type="button" class="sbx-btn ghost small" onClick={async () => { await onRestore(t); setRefocus(n => n + 1); }} aria-label={`Restore ${t.scenario.label}`}>Restore</button>
                  <button type="button" class="sbx-btn ghost small" onClick={() => onForget(t)} aria-label={`Forget ${t.scenario.label} for good`}>Forget</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Import open={importing} onClose={() => setImporting(false)} existing={list} onCreate={onImportOne} onUpdate={onUpdateOne} />

      <ConfirmDialog
        open={!!confirm}
        danger
        busy={busy}
        title={confirm?.list.length === 1 ? 'Delete this scenario?' : `Delete ${confirm?.list.length} scenarios?`}
        confirmLabel={confirm?.list.length === 1 ? 'Delete it' : `Delete ${confirm?.list.length}`}
        onCancel={() => setConfirm(null)}
        onConfirm={runDelete}
      >
        <p>This removes {confirm?.list.length === 1 ? 'it' : 'them'} from the account for everyone who uses this sandbox key. Anything that signs in with {confirm?.list.length === 1 ? 'its login' : 'these logins'} gets Truv's built-in test data instead.</p>
        <ul class="sbx-confirm-list">
          {(confirm?.list || []).slice(0, 12).map(s => <li key={s.id}><strong>{s.label}</strong> <span class="sbx-small">{s.username}</span></li>)}
          {(confirm?.list.length || 0) > 12 && <li class="sbx-small">and {confirm.list.length - 12} more</li>}
        </ul>
        {notMine.length > 0 && <p class="sbx-bad"><strong>{notMine.length === confirm.list.length ? 'None of these were created in this browser.' : `${notMine.length} of these were not created in this browser.`}</strong> They may belong to someone else using this account{notMine.length <= 3 ? `: ${notMine.map(s => s.label).join(', ')}` : ''}.</p>}
        {unsaved && confirm?.list.some(s => s.id === editingId) && <p class="sbx-bad">You have unsaved changes to {confirm.list.length === 1 ? 'this scenario' : 'one of these'} in the Build tab. They are lost too.</p>}
        <p class="sbx-small">
          {(confirm?.list.length || 0) > TRASH_LIMIT
            ? `A copy is kept in this browser under Recently deleted, but only the last ${TRASH_LIMIT}. The rest cannot be brought back.`
            : 'A copy is kept in this browser under Recently deleted, so you can undo this.'}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!datesFor}
        title={datesFor?.length > 1 ? `Update the paystub dates in ${datesFor.length} scenarios?` : 'Update the paystub dates?'}
        confirmLabel="Update the dates"
        onCancel={() => setDatesFor(null)}
        onConfirm={async () => { const todo = datesFor; setDatesFor(null); await onMoveDates(todo); }}
      >
        <p>This moves every paystub in {datesFor?.length === 1 ? <strong>{datesFor[0].label}</strong> : 'each of them'} forward by whole pay periods, so the newest one is the latest pay date on or before today. The amounts stay the same, and year-to-date totals are worked out again for the new dates.</p>
        {datesFor?.length > 1 && <ul class="sbx-confirm-list">{datesFor.slice(0, 12).map(x => <li key={x.id}><strong>{x.label}</strong></li>)}{datesFor.length > 12 && <li class="sbx-small">and {datesFor.length - 12} more</li>}</ul>}
        <p class="sbx-small">It changes {datesFor?.length === 1 ? 'the scenario' : 'them'} for everyone on the account. You can undo it right after.</p>
      </ConfirmDialog>

      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${viewing.label}` : ''} wide>
        {viewing && (
          <>
            <div class="sbx-dialog-tools">
              <CopyButton text={JSON.stringify(orderKeys(viewing), null, 2)} label="Copy JSON" />
              <CopyButton text={toCurl(toCreateBody(viewing))} label="Copy as curl" />
              <span class="sbx-small">The curl command creates a copy of this scenario. Add your sandbox key where it says.</span>
            </div>
            <JsonViewer value={orderKeys(viewing)} label="Scenario" copy={false} filename={`${(viewing.label || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario'}.json`} maxHeight={380} />
          </>
        )}
      </Dialog>
    </div>
  );
}
