/**
 * FILE SUMMARY: BatchRunner - the interactive Batch Orders learning demo.
 * DATA FLOW: Build/upload applicant rows in the browser --> POST /api/batch/jobs
 *            --> poll GET /api/batch/jobs/:id for live batch + per-order results and
 *                order-batch-completed webhooks --> GET /api/batch/jobs/:id/csv on export.
 *
 * It is a learning sandbox for the batch orders endpoint: pick the product and
 * notification settings, build a small file (choosing which columns ride along),
 * tune batch size / concurrency / pacing (the script rewrites itself to match), send
 * it to the sandbox, and watch the job lifecycle, per-order results, and the webhook.
 */

import { useState, useEffect, useRef, useMemo, useId } from 'preact/hooks';
import { API_BASE } from './hooks.js';
import {
  FIELDS, LOCKED_KEYS, DEFAULT_SELECTED, PRODUCT_OPTIONS, productsFor, sampleApplicants,
  sampleValue, aliasEmail, isAliasEmail, freshSeed, byFieldOrder, parseCsvToFields, csvCell,
  buildScript, highlightCode, SCRIPT_LANGS, duplicateOrderNumbers,
} from '../demos/scaffolding/batch-orders.jsx';

const POLL_INTERVAL_MS = 1500;
const MAX_ROWS = 3000;
const MAX_BATCH_SIZE = 500;
const INBOX_KEY = 'batch-demo-inbox';

// Per-column minimum widths for the editable grid, so wide values (email, notes)
// aren't clipped mid-character while short ones (name, dob) don't hog space.
const COL_MIN = {
  email: 220, notes: 180, cc_emails: 190, company_name: 140,
  external_user_id: 140, order_number: 130, date_of_birth: 120,
  first_name: 110, last_name: 110, phone: 130, ssn: 110,
};

// Stable row ids so the editable grid keys on identity, not array position
// (removing a row otherwise shifts focus onto a different applicant's cell).
let _ridSeq = 0;
const nextRid = () => `r${++_ridSeq}`;
const withRids = rows => rows.map(r => ({ _rid: nextRid(), ...r }));
// A sample-filled row at a given global index (phone/email stay blank per their rules).
const sampleRow = (selected, rowIndex, emailBase, seed) =>
  ({ _rid: nextRid(), ...Object.fromEntries(selected.map(k => [k, sampleValue(k, rowIndex, emailBase, seed)])) });
const readInbox = () => { try { return localStorage.getItem(INBOX_KEY) || ''; } catch { return ''; } };

export function BatchRunner({ onStepChange, sessionId, startPolling, stopPolling, addBridgeEvent }) {
  // --- File building state ---
  const [emailBase, setEmailBaseState] = useState(readInbox);
  const [selected, setSelected] = useState(DEFAULT_SELECTED);
  const [rows, setRows] = useState(() => withRids(sampleApplicants(DEFAULT_SELECTED, readInbox(), freshSeed())));
  const [uploadNote, setUploadNote] = useState(null);
  const [addCount, setAddCount] = useState(50);

  // --- Run config state ---
  const [product, setProduct] = useState(PRODUCT_OPTIONS[0].value);
  const [batchSize, setBatchSize] = useState(2);
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [scriptLang, setScriptLang] = useState('node');
  const [copied, setCopied] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Applicant notifications (notification_settings). Delay holds the first email/SMS
  // for N hours (so an off-hours job lands at business hours); suppress turns them off.
  const [notifyDelay, setNotifyDelay] = useState(0);
  const [notifySuppress, setNotifySuppress] = useState(false);

  // --- Run state ---
  const [status, setStatus] = useState('idle');   // idle | running | completed | failed
  const [job, setJob] = useState(null);           // latest poll snapshot
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);
  const [resultFilter, setResultFilter] = useState('all');

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  function step(n) { onStepChange && onStepChange(n); }

  const selectedFields = FIELDS.filter(f => selected.includes(f.key));
  // Only surface the "or the order fails" hints inline (phone, email); the rest live
  // in each chip's tooltip so the section stays uncluttered.
  const selectedOptionalHints = selectedFields.filter(f => f.warn);

  // Rows that carry any data at all; blank rows are ignored on send.
  const sendRows = useMemo(
    () => rows.filter(r => selected.some(k => String(r[k] || '').trim() !== '')),
    [rows, selected]
  );
  const missingName = sendRows.filter(r => !String(r.first_name || '').trim() || !String(r.last_name || '').trim()).length;
  const dupeOrderNumbers = useMemo(() => duplicateOrderNumbers(sendRows), [sendRows]);
  const batchCount = sendRows.length ? Math.ceil(sendRows.length / batchSize) : 0;
  const busy = status === 'running';

  // ---------- test inbox (drives aliased sample emails) ----------
  function setEmailBase(v) {
    setEmailBaseState(v);
    try { localStorage.setItem(INBOX_KEY, v); } catch { /* storage can be blocked */ }
    // Re-alias only generated/empty email cells so hand-typed addresses are left alone.
    // An empty inbox clears them back to blank (the default: add your own email).
    if (selected.includes('email')) {
      const base = v.trim();
      setRows(prev => prev.map((r, i) => {
        const cur = r.email || '';
        if (cur !== '' && !isAliasEmail(cur)) return r;
        return { ...r, email: base ? aliasEmail(base, i) : '' };
      }));
    }
  }

  // ---------- field selection ----------
  function toggleField(key) {
    if (LOCKED_KEYS.includes(key)) return;
    const turningOn = !selected.includes(key);
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key].sort(byFieldOrder));
    // Turning a column on fills empty cells with sample data (phone/email stay blank).
    if (turningOn) {
      const seed = freshSeed();
      setRows(prev => prev.map((r, i) => (r[key] == null || r[key] === '') ? { ...r, [key]: sampleValue(key, i, emailBase, seed) } : r));
    }
  }

  // ---------- editable grid ----------
  function updateCell(rowIdx, key, value) {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r));
  }
  // Add N sample-filled rows. The seed keeps order_number / external_user_id unique,
  // and each new row's index continues past the existing rows so names keep cycling.
  function addRows(n) {
    const count = Math.max(1, Math.min(n || 1, MAX_ROWS));
    setRows(prev => {
      const room = Math.max(0, MAX_ROWS - prev.length);
      const toAdd = Math.min(count, room);
      if (toAdd <= 0) { setError(`That would exceed the ${MAX_ROWS.toLocaleString()}-row limit.`); return prev; }
      const seed = freshSeed();
      const extra = Array.from({ length: toAdd }, (_, k) => sampleRow(selected, prev.length + k, emailBase, seed));
      return [...prev, ...extra];
    });
  }
  function addRow() { addRows(1); }
  function removeRow(rowIdx) { setRows(prev => prev.filter((_, i) => i !== rowIdx)); }
  function clearRows() { setRows([{ _rid: nextRid(), ...Object.fromEntries(selected.map(k => [k, ''])) }]); setUploadNote(null); }
  function loadSample() { setRows(withRids(sampleApplicants(selected, emailBase, freshSeed()))); setUploadNote(null); }

  // ---------- CSV upload ----------
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadNote(null);
    setError(null);
    try {
      const text = await file.text();
      const { headerKeys, dataRows, unknown } = parseCsvToFields(text);
      if (!dataRows.length) { setError('That CSV had no data rows.'); return; }
      if (dataRows.length > MAX_ROWS) { setError(`CSV exceeds the ${MAX_ROWS.toLocaleString()}-row limit for a run.`); return; }

      const recognized = headerKeys.filter(Boolean);
      setSelected(prev => Array.from(new Set([...prev, ...recognized])).sort(byFieldOrder));
      setRows(withRids(dataRows));
      const parts = [`Loaded ${dataRows.length.toLocaleString()} row${dataRows.length === 1 ? '' : 's'}.`];
      if (unknown.length) parts.push(`Ignored unknown column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`);
      setUploadNote(parts.join(' '));
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ---------- template download ----------
  function downloadTemplate() {
    const cols = selectedFields.map(f => f.key);
    const header = cols.join(',');
    const examples = sampleApplicants(selected, emailBase).slice(0, 2)
      .map(r => cols.map(k => csvCell(r[k])).join(','));
    const csv = [header, ...examples].join('\n') + '\n';
    triggerDownload(csv, 'batch_orders_template.csv');
  }

  // ---------- run ----------
  async function run() {
    if (!sendRows.length) { setError('Add at least one applicant row first.'); return; }
    setError(null);
    setStatus('running');
    setResultFilter('all');
    step(2);
    // The body swaps to the shorter results view; bring the progress + stats into view.
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* no-op */ }

    // Send only the selected fields for each row; deselected fields never leave the browser.
    const payloadRows = sendRows.map(r => Object.fromEntries(selected.map(k => [k, r[k] ?? ''])));

    try {
      const resp = await fetch(`${API_BASE}/api/batch/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: payloadRows,
          products: productsFor(product),
          chunk_size: batchSize,
          concurrency,
          delay_ms: delayMs,
          template_id: templateId.trim() || undefined,
          notify: { suppress: notifySuppress, delay_hours: notifyDelay },
          session_id: sessionId,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(body.error || 'Could not start the run.'); setStatus('idle'); return; }
      setJobId(body.job_id);
      startPolling && startPolling('batch-orders');  // surface the real API calls in the panel
      startJobPolling(body.job_id);
    } catch (err) {
      setError(err.message || 'Could not start the run.');
      setStatus('idle');
    }
  }

  function startJobPolling(id) {
    if (pollRef.current) clearInterval(pollRef.current);
    const stop = () => { clearInterval(pollRef.current); pollRef.current = null; };
    const poll = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/batch/jobs/${id}`);
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          // Go terminal so the UI never wedges in "running" (e.g. a mid-run backend
          // restart makes the next poll 404). The user still gets "Run another".
          setError(body.error || `Lost the run (HTTP ${resp.status}).`);
          setStatus('failed');
          stop();
          return;
        }
        setJob(body);
        if (body.status === 'completed') { setStatus('completed'); step(4); stop(); }
        else if (body.status === 'failed') { setStatus('failed'); setError(body.error || 'The run failed.'); stop(); }
        else step(3);
      } catch { /* transient network blip; keep polling */ }
    };
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }

  function exportCsv() {
    if (!jobId) return;
    window.location.href = `${API_BASE}/api/batch/jobs/${jobId}/csv`;
  }

  function reset() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    stopPolling && stopPolling();  // stop the panel's log/webhook poller too
    setStatus('idle'); setJob(null); setJobId(null); setError(null); setResultFilter('all');
    step(0);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* no-op */ }
  }

  const script = useMemo(
    () => buildScript(scriptLang, { chunkSize: batchSize, concurrency, delayMs, products: productsFor(product), templateId: templateId.trim(), total: sendRows.length, chunkCount: batchCount, selected, notify: { suppress: notifySuppress, delayHours: notifyDelay } }),
    [scriptLang, batchSize, concurrency, delayMs, product, templateId, sendRows.length, batchCount, selected, notifySuppress, notifyDelay]
  );
  const scriptHtml = useMemo(() => highlightCode(script, scriptLang), [script, scriptLang]);

  function copyScript() {
    try {
      navigator.clipboard?.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard can be blocked */ }
  }

  // Open one order's Truv Bridge flow as a dialog over this page (via the order's
  // bridge_token), instead of opening the hosted share_url in a new tab. Falls back
  // to the share_url if the token or the Bridge SDK isn't available.
  function openBridge(row) {
    const token = row.bridge_token || tokenFromShareUrl(row.share_url);
    if (!token || !window.TruvBridge) {
      if (row.share_url) window.open(row.share_url, '_blank', 'noopener');
      return;
    }
    const bridge = window.TruvBridge.init({
      bridgeToken: token,
      isOrder: true,
      onLoad: () => addBridgeEvent?.('onLoad()', null),
      onEvent: (type, payload, source) => addBridgeEvent?.(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null),
      onSuccess: () => addBridgeEvent?.('onSuccess()', null),
      onClose: () => addBridgeEvent?.('onClose()', null),
    });
    bridge.open();
    // Bridge's dialog is modal and the SDK offers no host-side close, so drop a small
    // "Close" control into it, matching the Renewals demo, so a presenter is never stuck.
    requestAnimationFrame(() => {
      const dialog = document.querySelector('dialog.truv-dialog-root-element');
      if (!dialog || dialog.querySelector('[data-bridge-back]')) return;
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '← Close';
      close.setAttribute('data-bridge-back', '');
      close.style.cssText = 'position:fixed;top:16px;left:16px;z-index:2;border:0;border-radius:999px;padding:8px 14px;background:#fff;color:#1b1c1f;font-family:inherit;font-weight:500;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.25)';
      close.addEventListener('click', () => { try { dialog.close(); } catch { /* already closed */ } addBridgeEvent?.('Closed from the demo', null); });
      dialog.appendChild(close);
    });
  }

  const counts = job?.counts || { created: 0, existing: 0, failed: 0, pending: 0 };
  const doneOrders = counts.created + counts.existing + counts.failed;
  const pct = job && job.total ? Math.round((doneOrders / job.total) * 100) : 0;
  const concurrencyWord = concurrency === 1 ? 'sent one at a time' : `up to ${concurrency} sent at the same time`;

  return (
    <div class="px-4 py-6 sm:px-8 sm:py-10 max-w-[1100px] w-full mx-auto">
      <div class="mb-8">
        <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-text">Batch Orders</h2>
        {status === 'idle' && (
          <p class="text-[15px] text-muted leading-[1.5] mt-1 max-w-[62ch]">
            A batch creates many verification orders in one request instead of one at a time. Build a small file, send it to the Truv sandbox, and watch the
            <code class="mx-1 px-1 rounded bg-black/5 font-mono text-[13px]">POST /v1/orders/batch/</code>
            job lifecycle, the per-order results, and the <code class="mx-1 px-1 rounded bg-black/5 font-mono text-[13px]">order-batch-completed</code> webhook.
          </p>
        )}
      </div>

      {error && <div role="alert" class="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">{error}</div>}

      {/* ============ BUILD ============ */}
      {status === 'idle' && (
        <>
          {/* 1. Product + notifications, above the file */}
          <Section title="What to create" subtitle="The product applies to every order in the run.">
            <div class="max-w-md">
              <SelectField label="Product" value={product} onChange={setProduct} options={PRODUCT_OPTIONS}
                hint="Benefits intake usually verifies income and assets." />
            </div>

            <Disclosure
              open={showNotify}
              onToggle={() => setShowNotify(s => !s)}
              label="Applicant notifications"
              note={notifySuppress ? 'suppressed' : notifyDelay > 0 ? `delayed ${notifyDelay}h` : 'off-hours scheduling'}
            >
              <Callout title="Running the batch off-hours? Delay the first notification.">
                If an order has an email or phone, Truv emails/texts the applicant the verification link. For an overnight job,
                set <code class="px-1 rounded bg-black/5 font-mono text-[12px]">first_notification_delay_hours</code> so the first message lands at the start of business hours instead of 2am
                (a 2am job with <strong>6</strong> waits until 8am). <code class="px-1 rounded bg-black/5 font-mono text-[12px]">suppress_user_notifications</code> turns them off entirely.
              </Callout>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mt-4">
                <div>
                  <label class="flex items-center gap-2.5 text-[13px] font-semibold text-text">
                    <input type="checkbox" checked={notifySuppress} onChange={e => setNotifySuppress(e.target.checked)} class="w-4 h-4 accent-primary" />
                    Suppress applicant notifications
                  </label>
                  <p class="mt-1 text-[12px] text-muted leading-relaxed"><code class="font-mono">suppress_user_notifications: true</code>, no email/SMS at all.</p>
                </div>
                <div class={notifySuppress ? 'opacity-40 pointer-events-none' : ''}>
                  <SliderField label="Delay first notification" help="first_notification_delay_hours" value={notifyDelay} min={0} max={24} onChange={setNotifyDelay} suffix="h" />
                  <p class="mt-1 text-[12px] text-muted leading-relaxed">{notifyDelay === 0 ? 'Sent immediately (default).' : `First email/SMS held for ${notifyDelay} hour${notifyDelay === 1 ? '' : 's'} after the order is created.`}</p>
                </div>
              </div>
            </Disclosure>
          </Section>

          {/* 2. Columns */}
          <Section title="Columns in the file" subtitle="Only first and last name are required. Phone, email, company name, order number, and external user ID are on by default; turn any of them off, or add the others. Only selected columns are sent to Truv.">
            <div class="flex flex-wrap gap-2" role="group" aria-label="Columns to include">
              {FIELDS.map(f => {
                const on = selected.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleField(f.key)}
                    disabled={f.locked}
                    aria-pressed={on}
                    title={f.hint || (f.locked ? 'Required by the API' : '')}
                    class={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none ${
                      on
                        ? 'bg-[#1b1c1f] text-white border-transparent hover:bg-[#2e3035]'
                        : 'bg-white text-gray-700 border-border hover:border-[#c0c0c5]'
                    } ${f.locked ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    {on && <span aria-hidden="true" class="mr-1.5">✓</span>}
                    <span>{f.label}</span>
                    <span class={`ml-1.5 font-mono text-[11px] ${on ? 'opacity-70' : 'opacity-60'}`}>{f.key}</span>
                    {f.locked && <span class="ml-1.5 text-[11px] opacity-70">· required</span>}
                  </button>
                );
              })}
            </div>
            {selectedOptionalHints.length > 0 && (
              <ul class="mt-3 space-y-1 text-[12.5px] text-muted leading-relaxed">
                {selectedOptionalHints.map(f => (
                  <li key={f.key}><span class="font-semibold text-text">{f.label}:</span> {f.hint}</li>
                ))}
              </ul>
            )}
          </Section>

          {/* 3. Applicants */}
          <Section
            title="Applicants"
            subtitle="Type in the table, add rows, or upload a CSV. Blank rows are skipped."
            actions={
              <div class="flex flex-wrap gap-2">
                <GhostBtn onClick={downloadTemplate}>Download template</GhostBtn>
                <GhostBtn onClick={() => fileInputRef.current?.click()}>Upload CSV</GhostBtn>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" aria-label="Upload CSV" onChange={handleFile}
                  class="absolute w-px h-px overflow-hidden" style={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)' }} />
                <GhostBtn onClick={loadSample}>Sample data</GhostBtn>
                <button onClick={clearRows} class="ml-1 px-2 py-1.5 text-[13px] font-medium text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">Clear</button>
              </div>
            }
          >
            {selected.includes('email') && (
              <div class="mb-4 max-w-md">
                <TextField label="Test inbox for sample emails" value={emailBase} onChange={setEmailBase} placeholder="you@yourcompany.com"
                  hint="Sample rows become you+bulktest1@…, +bulktest2, and so on, so every order is a valid address that reaches one inbox. Remembered on this browser." />
              </div>
            )}
            {uploadNote && <div class="mb-3 text-[13px] text-green-700">{uploadNote}</div>}
            {sendRows.length === 0 && (
              <div class="mb-3 px-4 py-6 text-center border-2 border-dashed border-border rounded-lg text-[13px] text-muted">
                No applicants yet. Add a row below, upload a CSV, or load the sample to get started.
              </div>
            )}
            <div class="border border-border-light rounded-md overflow-hidden">
              <div class="max-h-[42vh] overflow-auto">
                <table class="w-full text-[13px]">
                  <thead class="bg-surface-secondary sticky top-0 z-10">
                    <tr class="text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                      <th class="px-2 py-2 w-8" />
                      {selectedFields.map(f => (
                        <th key={f.key} class="px-2 py-2 whitespace-nowrap" title={f.hint || f.key}>
                          {f.label}
                          {f.required && <span class="text-red-500 ml-0.5" title="Required">*</span>}
                          {f.warn && <span class="text-amber-600 ml-0.5" title={f.hint}>⚠</span>}
                        </th>
                      ))}
                      <th class="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r._rid} class="border-t border-border-light">
                        <td class="px-2 py-1 text-gray-400 text-center tabular-nums">{i + 1}</td>
                        {selectedFields.map(f => (
                          <td key={f.key} class="px-1 py-1">
                            <input
                              value={r[f.key] ?? ''}
                              onInput={e => updateCell(i, f.key, e.target.value)}
                              aria-label={`${f.label}, row ${i + 1}`}
                              placeholder={f.placeholder || ''}
                              title={f.warn ? f.hint : undefined}
                              style={{ minWidth: `${COL_MIN[f.key] || 110}px` }}
                              class="w-full px-2 py-1 rounded border border-[#ededf0] bg-white hover:border-border focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus:outline-none"
                            />
                          </td>
                        ))}
                        <td class="px-2 py-1 text-center">
                          <button onClick={() => removeRow(i)} aria-label={`Remove row ${i + 1}`} class="text-gray-400 hover:text-red-500 transition-colors leading-none text-base focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">
                            <span aria-hidden="true">×</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div class="flex items-center justify-between gap-3 px-3 py-2 border-t border-border-light bg-surface-secondary">
                <div class="flex items-center gap-4 flex-wrap">
                  <button onClick={addRow} class="text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">+ Add row</button>
                  <span class="flex items-center gap-1.5 text-[13px] text-muted">
                    <button onClick={() => addRows(addCount)} class="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">Add</button>
                    <input
                      type="number" min="1" max={MAX_ROWS} value={addCount}
                      onInput={e => setAddCount(Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, MAX_ROWS)))}
                      aria-label="Number of sample rows to add"
                      class="w-16 px-2 py-1 rounded border border-border bg-white text-text text-center tabular-nums focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus:outline-none"
                    />
                    sample rows
                  </span>
                </div>
                <span class="text-[13px] text-muted whitespace-nowrap">
                  {sendRows.length.toLocaleString()} applicant{sendRows.length === 1 ? '' : 's'} ready
                </span>
              </div>
            </div>
            {missingName > 0 && (
              <div class="mt-2 text-[12.5px] text-[#b45309]">
                {missingName} row{missingName === 1 ? '' : 's'} missing a name, {missingName === 1 ? 'it' : 'they'} will fail (first and last name are required).
              </div>
            )}
            {dupeOrderNumbers.length > 0 && (
              <div class="mt-2 text-[12.5px] text-[#b45309]">
                Repeated order number{dupeOrderNumbers.length === 1 ? '' : 's'} in this file ({dupeOrderNumbers.join(', ')}). Within one batch a repeat comes back as "Existing" with the first order's link, not a new order. Give each person a distinct order number.
              </div>
            )}
          </Section>

          {/* 4. How to send */}
          <Section title="How to send the file" subtitle="Each batch is one request. Smaller batches let you watch progress, isolate failures, and stay under the 3,000-orders/hour limit. One bad row never blocks the rest.">
            <div class="max-w-md">
              <SliderField label="Batch size" help="orders per request" value={batchSize} min={1} max={MAX_BATCH_SIZE} onChange={setBatchSize} />
            </div>

            <Disclosure
              open={showAdvanced}
              onToggle={() => setShowAdvanced(s => !s)}
              label="Advanced"
              note="concurrency, pacing, template"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                <SliderField label="Sent at the same time" help="requests in parallel" value={concurrency} min={1} max={8} onChange={setConcurrency} />
                <SliderField label="Delay between requests" help="pause to avoid rate limits" value={delayMs} min={0} max={5000} step={100} onChange={setDelayMs} suffix="ms" />
                <TextField label="Verification template ID (optional)" value={templateId} onChange={setTemplateId} placeholder="tmpl_..." mono
                  hint="Applies a saved verification configuration to every order. Leave blank to use your account default." />
              </div>
            </Disclosure>

            <div class="mt-5 px-4 py-3 rounded-md bg-surface-secondary text-[13px] text-text leading-relaxed">
              <strong>{sendRows.length.toLocaleString()}</strong> applicant{sendRows.length === 1 ? '' : 's'} into{' '}
              <strong>{batchCount}</strong> batch{batchCount === 1 ? '' : 'es'} of up to <strong>{batchSize}</strong>, {concurrencyWord}
              {delayMs > 0 ? <>, <strong>{delayMs}ms</strong> apart</> : ''}.
              <div class="text-[12px] text-muted mt-1">The API accepts up to 10,000 orders per request; this demo caps a run at 3,000 and {MAX_BATCH_SIZE} per batch to stay inside the shared sandbox budget.</div>
            </div>

            <button onClick={() => setShowScript(s => !s)} aria-expanded={showScript}
              class="mt-4 text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">
              {showScript ? 'Hide' : 'Show'} the script
            </button>
            {showScript && (
              <div class="mt-2 rounded-md overflow-hidden border border-[#2a2a2e]">
                <div class="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#161618] border-b border-[#2a2a2e]">
                  <div class="flex items-center gap-1" role="group" aria-label="Script language">
                    {SCRIPT_LANGS.map(l => (
                      <button key={l.id} type="button" onClick={() => setScriptLang(l.id)} aria-pressed={scriptLang === l.id}
                        class={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus:outline-none ${scriptLang === l.id ? 'bg-[#2f2f35] text-white' : 'text-[#9aa0a6] hover:text-white hover:bg-[#242428]'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={copyScript} class="px-2.5 py-1 rounded text-[12px] font-medium text-[#9aa0a6] hover:text-white hover:bg-[#242428] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus:outline-none">
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre class="text-[12.5px] leading-relaxed whitespace-pre overflow-x-auto text-[#e5e5ea] font-mono bg-[#1c1c1e] p-4 m-0" dangerouslySetInnerHTML={{ __html: scriptHtml }} />
              </div>
            )}
          </Section>

          <div class="flex flex-col gap-2 mt-8">
            <button
              onClick={run}
              disabled={!sendRows.length}
              class="w-full sm:w-auto sm:self-start px-6 py-3.5 bg-primary text-white font-semibold text-[15px] rounded-lg shadow-sm hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:outline-none"
            >
              Send {sendRows.length.toLocaleString()} order{sendRows.length === 1 ? '' : 's'} in {batchCount} batch{batchCount === 1 ? '' : 'es'}
            </button>
            {!sendRows.length && <span class="text-[13px] text-muted">Add at least one applicant to send.</span>}
          </div>
        </>
      )}

      {/* ============ RUN / RESULTS ============ */}
      {status !== 'idle' && (
        <>
          <div class="flex flex-wrap items-center gap-3 mb-6">
            {(status === 'completed' || status === 'failed') && (
              <>
                <button onClick={exportCsv} class="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:outline-none">Export results CSV</button>
                <GhostBtn onClick={reset}>Run another</GhostBtn>
              </>
            )}
          </div>

          {/* progress across orders */}
          <div class="mb-6" aria-live="polite">
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2 text-sm font-medium text-muted">
                {status === 'running' && <Spinner />}
                <span>
                  {status === 'running' ? 'Processing…' : status === 'failed' ? 'Failed' : (counts.pending > 0 ? `Completed, ${counts.pending} still processing` : 'Completed')}
                  <span class="ml-2 font-normal">{doneOrders} / {job?.total || 0} orders · {job?.processed_chunks || 0} / {job?.chunk_count || 0} batches</span>
                </span>
              </div>
              <div class="text-sm font-semibold text-primary">{pct}%</div>
            </div>
            <div class={`h-2 bg-[#e5e7eb] rounded-full overflow-hidden ${status === 'running' && pct === 0 ? 'animate-pulse' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Batch progress">
              <div class="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <Stat label="Created" value={counts.created} color="green" />
            <Stat label="Existing" value={counts.existing} color="blue" />
            <Stat label="Failed" value={counts.failed} color="red" />
            <Stat label="Pending" value={counts.pending} color="gray" />
          </div>
          <p class="text-[12.5px] text-muted mb-6 leading-relaxed">
            <strong>Created</strong> = new order · <strong>Existing</strong> = this order number already existed, so nothing was duplicated ·{' '}
            <strong>Failed</strong> = couldn't be created (see the row for why; one bad row never blocks the rest) · <strong>Pending</strong> = still processing.
          </p>

          {/* per-batch cards */}
          {job?.chunks?.length > 0 && (
            <div class="mb-6">
              <div class="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Batches <span class="font-normal normal-case">· each is one <code class="font-mono text-[12px]">POST /v1/orders/batch/</code></span></div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {job.chunks.map(c => <ChunkCard key={c.index} chunk={c} />)}
              </div>
            </div>
          )}

          {/* completion webhook */}
          <WebhookCard webhooks={job?.webhooks || []} />

          {/* results table (inline) */}
          {job?.rows?.length > 0 && (
            <div class="mt-6">
              <ResultsTable job={job} counts={counts} status={status} resultFilter={resultFilter} setResultFilter={setResultFilter} onOpenBridge={openBridge} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- helpers & subcomponents ---------------- */

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Pull the bridge_token out of a share_url if the per-order result didn't carry one.
function tokenFromShareUrl(url) {
  try { return new URL(url).searchParams.get('bridge_token') || ''; } catch { return ''; }
}

// Shared results view: filters + per-order table. Each order can open in a Bridge
// dialog on the page (via its bridge_token) or in a new tab (its share_url).
function ResultsTable({ job, counts, status, resultFilter, setResultFilter, onOpenBridge }) {
  const visibleRows = resultFilter === 'all' ? job.rows : job.rows.filter(r => r.status === resultFilter);
  return (
    <div>
      {status === 'completed' && counts.existing === 0 && job.rows.some(r => r.order_number && !/^batch-/.test(r.order_number)) && (
        <div class="mb-3 px-3 py-2 rounded-md bg-blue-50 text-[12.5px] text-blue-800">
          Tip: run the same file again to watch repeats come back as <strong>Existing</strong>, nothing gets duplicated.
        </div>
      )}
      <p class="text-[12.5px] text-muted mb-3 leading-relaxed max-w-3xl">
        The verification link is what each applicant receives. <strong class="text-text">Open here</strong> previews that Bridge flow right on this page (nothing is submitted); <strong class="text-text">New tab</strong> opens the real hosted page in a separate window.
      </p>
      <div class="flex flex-wrap gap-2 mb-3 text-[13px]">
        <FilterPill active={resultFilter === 'all'} onClick={() => setResultFilter('all')} label={`All (${job.rows.length})`} />
        <FilterPill active={resultFilter === 'created'} onClick={() => setResultFilter('created')} label={`Created (${counts.created})`} color="green" />
        <FilterPill active={resultFilter === 'existing'} onClick={() => setResultFilter('existing')} label={`Existing (${counts.existing})`} color="blue" />
        <FilterPill active={resultFilter === 'failed'} onClick={() => setResultFilter('failed')} label={`Failed (${counts.failed})`} color="red" />
      </div>
      <div class="border border-border-light rounded-md overflow-hidden">
        <div class="max-h-[60vh] overflow-auto">
          <table class="w-full min-w-[640px] text-[13px]">
            <thead class="bg-surface-secondary sticky top-0 z-10">
              <tr class="text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                <th class="px-3 py-2">Applicant</th>
                <th class="px-3 py-2">Order number</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Verification link</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={r.global_index} class="border-t border-border-light align-top">
                  <td class="px-3 py-2 text-text font-medium">{r.input_name}</td>
                  <td class="px-3 py-2 font-mono text-muted break-all">{r.order_number}</td>
                  <td class="px-3 py-2">
                    <StatusBadge status={r.status} />
                    {r.error && <div class="text-[12px] text-red-600 mt-1">{r.error}</div>}
                  </td>
                  <td class="px-3 py-2">
                    {r.share_url ? (
                      <div class="flex items-center gap-3 whitespace-nowrap">
                        <button onClick={() => onOpenBridge(r)} class="text-primary font-medium hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">Open here</button>
                        <a href={r.share_url} target="_blank" rel="noopener noreferrer" class="text-muted hover:underline">New tab ↗</a>
                      </div>
                    ) : <span class="text-gray-400">-</span>}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr><td colSpan={4} class="px-3 py-8 text-center text-muted">No rows for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Callout({ title, children }) {
  return (
    <div class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <div class="flex items-start gap-2.5">
        <span aria-hidden="true" class="mt-0.5 text-amber-700 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        </span>
        <div class="text-[13px] text-text leading-relaxed">
          <div class="font-semibold mb-0.5">{title}</div>
          <div class="text-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <span aria-hidden="true" class="inline-block w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />;
}

// A collapsible "advanced" row: a muted toggle that reveals its children. Keeps the
// first screen simple while leaving edge-case controls one click away.
function Disclosure({ open, onToggle, label, note, children }) {
  return (
    <div class="mt-5 border-t border-border-light pt-4">
      <button type="button" onClick={onToggle} aria-expanded={open}
        class="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-text focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none">
        <span aria-hidden="true" class="text-muted">{open ? '▾' : '▸'}</span>
        {label}
        {note && <span class="font-normal text-muted">· {note}</span>}
      </button>
      {open && <div class="mt-4">{children}</div>}
    </div>
  );
}

function Section({ title, subtitle, actions, children }) {
  return (
    <div class="mb-8 pb-8 border-b border-border-light last:border-b-0">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 class="text-[17px] font-semibold text-text">{title}</h3>
          {subtitle && <p class="text-[13px] text-muted mt-0.5 max-w-2xl leading-relaxed">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick} class="px-3 py-1.5 text-[13px] font-medium text-gray-700 bg-white border border-border rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none">
      {children}
    </button>
  );
}

function SelectField({ label, value, onChange, options, hint }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} class="block text-[13px] font-semibold text-text mb-1.5">{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        class="w-full appearance-none border border-border rounded-md pl-3 pr-9 py-2 text-sm bg-white bg-no-repeat cursor-pointer focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus:outline-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a828c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 0.7rem center', backgroundSize: '12px',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p class="mt-1 text-[12px] text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, mono, hint }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} class="block text-[13px] font-semibold text-text mb-1.5">{label}</label>
      <input
        id={id}
        value={value}
        onInput={e => onChange(e.target.value)}
        placeholder={placeholder}
        class={`w-full border border-border rounded-md px-3 py-2 text-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus:outline-none ${mono ? 'font-mono' : ''}`}
      />
      {hint && <p class="mt-1 text-[12px] text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

function SliderField({ label, help, value, min, max, step = 1, onChange, suffix }) {
  const id = useId();
  return (
    <div>
      <div class="flex items-baseline justify-between mb-1.5">
        <label htmlFor={id} class="text-[13px] font-semibold text-text">{label} <span class="font-normal text-muted">· {help}</span></label>
        <span class="text-sm font-semibold tabular-nums text-primary">{value}{suffix || ''}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min} max={max} step={step} value={value}
        onInput={e => onChange(parseInt(e.target.value, 10))}
        aria-valuetext={`${value}${suffix || ''}`}
        class="w-full accent-primary focus-visible:ring-2 focus-visible:ring-primary rounded focus:outline-none"
      />
    </div>
  );
}

function Stat({ label, value, color }) {
  // A zero count is a non-event: dim the whole card and keep the number neutral so
  // the meaningful figures (and a real Failed > 0) are the focal point on a projector.
  const active = value > 0;
  const map = { green: 'text-green-700', blue: 'text-blue-700', red: 'text-red-700', gray: 'text-text' };
  const numCls = active ? (map[color] || 'text-text') : 'text-text';
  return (
    <div class={`bg-white border border-border-light rounded-md px-4 py-4 ${active ? '' : 'opacity-45'}`}>
      <div class="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div class={`text-3xl sm:text-4xl font-semibold tabular-nums leading-tight mt-0.5 ${numCls}`}>{value}</div>
    </div>
  );
}

function ChunkCard({ chunk }) {
  const statusMap = {
    queued: { label: 'Queued', cls: 'bg-gray-100 text-gray-700' },
    sending: { label: 'Sending…', cls: 'bg-amber-100 text-amber-900' },
    polling: { label: 'Checking status…', cls: 'bg-blue-100 text-blue-900' },
    completed: { label: 'Completed', cls: 'bg-green-100 text-green-900' },
    timeout: { label: 'Timed out', cls: 'bg-amber-100 text-amber-900' },
    failed: { label: 'Failed', cls: 'bg-red-100 text-red-900' },
  };
  const s = statusMap[chunk.status] || statusMap.queued;
  return (
    <div class="border border-border-light rounded-md p-3">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[13px] font-semibold text-text">Batch #{chunk.index + 1} <span class="font-normal text-muted">· {chunk.size} order{chunk.size === 1 ? '' : 's'}</span></span>
        <span class={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
      </div>
      {chunk.batch_id
        ? <div class="text-[11px] font-mono text-gray-400 truncate mb-1.5" title={chunk.batch_id}>{chunk.batch_id}</div>
        : <div class="text-[11px] font-mono text-gray-400 mb-1.5">id pending…</div>}
      <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
        {chunk.created > 0 && <span class="text-green-700">{chunk.created} created</span>}
        {chunk.existing > 0 && <span class="text-blue-700">{chunk.existing} existing</span>}
        {chunk.failed > 0 && <span class="text-red-700">{chunk.failed} failed</span>}
        {chunk.duration_ms != null && <span>{(chunk.duration_ms / 1000).toFixed(1)}s</span>}
        {chunk.webhook && <span class="text-green-700">✓ webhook</span>}
      </div>
      {chunk.error && <div class="text-[12px] text-red-600 mt-1">{chunk.error}</div>}
    </div>
  );
}

function WebhookCard({ webhooks }) {
  return (
    <div class="border border-border-light rounded-md p-4 bg-surface-secondary">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[13px] font-semibold text-text">order-batch-completed webhook</span>
        <span class={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${webhooks.length ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-600'}`}>
          {webhooks.length ? `${webhooks.length} received` : 'not received'}
        </span>
      </div>
      {webhooks.length === 0 ? (
        <p class="text-[13px] text-muted leading-relaxed">
          Truv also fires <code class="px-1 rounded bg-black/5 font-mono text-[12px]">order-batch-completed</code> when each
          batch job finishes, the hands-off alternative to polling. It arrives here once a webhook URL is
          configured for your environment (locally, that needs a tunnel). The results above come from polling, so the
          demo works either way.
        </p>
      ) : (
        <div class="space-y-2 mt-2">
          {webhooks.map((w, i) => (
            <pre key={i} class="text-[12px] leading-relaxed whitespace-pre-wrap break-all text-[#e5e5ea] font-mono bg-[#1c1c1e] p-2.5 rounded-md">{JSON.stringify(w, null, 2)}</pre>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, label, color }) {
  const colorMap = {
    green: active ? 'bg-green-100 text-green-900' : 'text-green-800 hover:bg-green-50',
    blue: active ? 'bg-blue-100 text-blue-900' : 'text-blue-800 hover:bg-blue-50',
    red: active ? 'bg-red-100 text-red-900' : 'text-red-800 hover:bg-red-50',
  };
  const cls = color ? colorMap[color] : (active ? 'bg-surface-secondary text-primary font-semibold' : 'text-gray-700 hover:bg-surface-secondary');
  return <button onClick={onClick} aria-pressed={active} class={`px-2.5 py-1 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary focus:outline-none ${cls}`}>{label}</button>;
}

function StatusBadge({ status }) {
  const map = {
    created: 'bg-green-100 text-green-900',
    existing: 'bg-blue-100 text-blue-900',
    failed: 'bg-red-100 text-red-900',
    pending: 'bg-amber-100 text-amber-900',
    timeout: 'bg-amber-100 text-amber-900',
  };
  const cls = map[status] || 'bg-gray-100 text-gray-800';
  return <span class={`px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status}</span>;
}
