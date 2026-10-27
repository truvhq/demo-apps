/**
 * FILE SUMMARY: The PDF library behind paystubs and W-2s in a scenario. Upload once, point as many
 * scenarios at it as you like. Truv refuses to delete a file a scenario still uses, so this says
 * which ones use it before it asks.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { usedBy } from './model.js';
import { Chip, ConfirmDialog, Copyable, Dialog, Field, Spinner, plural } from './ui.jsx';

const MAX = 10 * 1024 * 1024;
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n > 0 && n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} KB`);

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.readAsDataURL(file);
  });
}

export function Documents({ documents, scenarios, loading, onUpload, onRename, onDelete, onReload, cached }) {
  const [refocus, setRefocus] = useState(0);
  // The button that was pressed to delete is gone once the file is, so focus goes back to the page's heading.
  useEffect(() => { if (!refocus) return undefined; const t = setTimeout(() => document.getElementById('sbx-pdfs-h')?.focus(), 80); return () => clearTimeout(t); }, [refocus]);
  const input = useRef(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState(null);

  function choose(f) {
    setProblem('');
    if (!f) return;
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { setProblem('Choose a PDF.'); return; }
    if (f.size === 0) { setProblem('That file is empty.'); return; }
    if (f.size > MAX) { setProblem('That file is over the 10 MB limit.'); return; }
    setFile(f); setName(f.name);
  }
  async function upload() {
    if (!file) return;
    setBusy(true); setProblem('');
    try {
      const content = await readBase64(file);
      const result = await onUpload({ filename: name.trim() || file.name, content });
      if (result?.ok) { setFile(null); setName(''); if (input.current) input.current.value = ''; }
      else setProblem(result?.message || 'Truv did not accept that file.');
    } catch (e) { setProblem(e.message); }
    setBusy(false);
  }

  const list = documents || [];
  const deletingUse = deleting ? usedBy(deleting.id, scenarios) : [];

  return (
    <div class="sbx-docs">
      <h2 class="sbx-sr" id="sbx-pdfs-h" tabIndex={-1}>PDFs</h2>
      <div class="sbx-intro">
        <p>Upload a PDF once, then attach it to a paystub or a W-2 in any scenario. Every W-2 needs one. A hand-made or empty PDF is refused: it has to be a real, readable file.</p>
      </div>

      <div
        class={`sbx-drop${dragging ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
      >
        <div class="sbx-drop-row">
          <label class="sbx-btn ghost" for="sbx-file">Choose a PDF</label>
          <input id="sbx-file" ref={input} class="sbx-sr" type="file" accept="application/pdf,.pdf" onChange={(e) => choose(e.currentTarget.files?.[0])} />
          <span class="sbx-small">{file ? `${file.name}, ${kb(file.size)}` : 'or drop one here'}</span>
        </div>
        {file && (
          <div class="sbx-drop-row sbx-drop-fields">
            <Field label="Name in the library" hint="Unique on the account, ignoring capital letters. Truv's own sample file names are taken.">
              {(p) => <input {...p} type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} maxLength="255" />}
            </Field>
            <button type="button" class="sbx-btn primary" onClick={upload} disabled={busy || !name.trim()}>{busy ? <><Spinner /> Uploading...</> : 'Upload'}</button>
          </div>
        )}
        {problem && <p class="sbx-error" role="alert">{problem}</p>}
      </div>

      <div class="sbx-toolbar">
        <strong>{plural(list.length, 'file')} <span class="sbx-small">of 100</span></strong>
        <div class="sbx-toolbar-end"><button type="button" class="sbx-btn ghost small" onClick={onReload} disabled={loading}>{loading ? 'Loading...' : 'Refresh list'}</button></div>
      </div>

      {documents && list.length === 0 && <div class="sbx-empty"><p><strong>No files yet.</strong></p></div>}
      <ul class="sbx-list">
        {list.map(d => {
          const uses = usedBy(d.id, scenarios);
          const f = d.uploaded_file || {};
          const failed = f.validations && Object.values(f.validations).some(v => v === false);
          return (
            <li class="sbx-item" key={d.id}>
              <div class="sbx-item-main">
                <p class="sbx-item-title">{f.filename || d.id} {f.size ? <span class="sbx-small">{kb(f.size)}</span> : null} {failed && <Chip tone="bad">Failed a check</Chip>}</p>
                <p class="sbx-item-sum">{uses.length ? `Used by ${uses.map(s => s.label).join(', ')}` : 'Not used by any scenario'}</p>
              </div>
              <div class="sbx-item-login"><Copyable value={d.id} display={`${d.id.slice(0, 8)}...`} what="file id" /></div>
              <div class="sbx-actions">
                <button type="button" class="sbx-btn ghost small" onClick={() => { setRenaming(d); setNewName(f.filename || ''); }} aria-label={`Rename ${f.filename || d.id}`}>Rename</button>
                <button type="button" class="sbx-btn ghost small" onClick={() => setDeleting(d)} aria-label={`Delete ${f.filename || d.id}`}>Delete...</button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!renaming} onClose={() => setRenaming(null)} title="Rename the file" labelledBy="sbx-rename-title"
        footer={<><button type="button" class="sbx-btn ghost" onClick={() => setRenaming(null)}>Cancel</button><button type="button" class="sbx-btn primary" disabled={!newName.trim()} onClick={async () => { const d = renaming; setRenaming(null); await onRename(d, newName.trim()); }}>Rename</button></>}>
        <Field label="Name">{(p) => <input {...p} type="text" value={newName} onInput={(e) => setNewName(e.currentTarget.value)} data-autofocus />}</Field>
      </Dialog>

      {deletingUse.length > 0 ? (
        <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="This file is in use" labelledBy="sbx-indelete-title"
          footer={<button type="button" class="sbx-btn primary" onClick={() => setDeleting(null)}>Close</button>}>
          <p>Truv will not delete a file a scenario still points at. Take it off these first:</p>
          <ul class="sbx-confirm-list">{deletingUse.map(s => <li key={s.id}><strong>{s.label}</strong></li>)}</ul>
        </Dialog>
      ) : (
        <ConfirmDialog open={!!deleting} danger title="Delete this file?" confirmLabel="Delete it" onCancel={() => setDeleting(null)}
          onConfirm={async () => { const d = deleting; setDeleting(null); await onDelete(d); setRefocus(n => n + 1); }}>
          <p><strong>{deleting?.uploaded_file?.filename || deleting?.id}</strong> is removed from the library for everyone on this account.</p>
          <p class="sbx-small">{deleting && cached(deleting.id) ? 'You can undo this right after, because you uploaded it in this visit.' : 'This cannot be undone here: the file is not kept. You would have to upload it again.'}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
