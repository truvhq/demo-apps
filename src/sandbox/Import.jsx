/**
 * FILE SUMMARY: Bring scenarios in from a file made by Export, or pasted JSON. Shows what would be
 * created and what would be skipped (and why) before anything is sent, then creates them one at a time.
 * A scenario that clashes with one on the account is skipped, unless "update" is on: then one with the same name is changed.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseBundle, planImport, summarizeScenario } from './model.js';
import { Dialog, Notice, Spinner, announce, plural } from './ui.jsx';

// What an imported file holds may be anything, so only text is drawn as text.
const plain = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function Import({ open, onClose, existing, onCreate, onUpdate }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [plan, setPlan] = useState(null);       // [{ body, action, reason }]
  const [update, setUpdate] = useState(false);  // change a scenario with the same name instead of skipping it
  const [phase, setPhase] = useState('choose'); // choose | review | running | done
  const [results, setResults] = useState({});   // index -> { ok, message }
  const input = useRef(null);
  const stop = useRef(false);
  const startedAt = useRef(0);
  // Leaving the page must stop an import that is part way through: nobody is left to watch it.
  useEffect(() => () => { stop.current = true; }, []);

  useEffect(() => {
    if (!open) return;
    setText(''); setProblem(''); setPlan(null); setPhase('choose'); setResults({}); setUpdate(false); stop.current = false;
  }, [open]);

  function readFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setProblem('That file is over 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const t = String(reader.result || '');
      setText(t);
      setProblem(t.trim() ? '' : 'That file is empty.');
    };
    reader.onerror = () => setProblem('That file could not be read.');
    reader.readAsText(file);
  }

  function review() {
    const parsed = parseBundle(text);
    if (!parsed.ok) { setProblem(parsed.problem); return; }
    setProblem('');
    const next = planImport(parsed.scenarios, existing, { update });
    setPlan(next);
    setPhase('review');
    announce(`${next.filter(p => p.action !== 'skip').length} of ${next.length} will be created or updated.`);
  }

  async function run() {
    if (phase === 'running') return;
    stop.current = false;
    startedAt.current = Date.now();
    setPhase('running');
    const next = {};
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].action === 'skip') continue;
      if (stop.current) { next[i] = { ok: false, notTried: true, message: 'Not tried. You stopped the import.' }; setResults({ ...next }); continue; }
      try { next[i] = plan[i].action === 'update' ? await onUpdate(plan[i].id, plan[i].body) : await onCreate(plan[i].body); } catch { next[i] = { ok: false, message: 'Something went wrong while creating this one.' }; }
      setResults({ ...next });
    }
    setPhase('done');
    announce(`Import finished. ${Object.values(next).filter(r => r.ok).length} created.`);
  }

  const toCreate = plan ? plan.filter(p => p.action === 'create').length : 0;
  const toUpdate = plan ? plan.filter(p => p.action === 'update').length : 0;
  const toDo = toCreate + toUpdate;
  const made = Object.values(results).filter(r => r.ok).length;
  const failed = Object.values(results).filter(r => !r.ok && !r.notTried).length;
  const notTried = Object.values(results).filter(r => r.notTried).length;
  const busy = phase === 'running';

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} title="Import scenarios" wide labelledBy="sbx-import-title">
      {phase === 'choose' && (
        <>
          <p>Choose a file made by Export, or paste JSON. A single scenario copied from Postman works too. You see what would happen before anything is created.</p>
          <div class="sbx-dialog-tools">
            <button type="button" class="sbx-btn ghost" onClick={() => input.current?.click()} data-autofocus>Choose a file</button>
            <input ref={input} class="sbx-sr" tabIndex={-1} type="file" accept="application/json,.json" aria-label="Scenario file" onChange={(e) => { readFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
            <span class="sbx-small">or paste below</span>
          </div>
          <label class="sbx-sr" for="sbx-import-text">Scenarios as JSON</label>
          <textarea id="sbx-import-text" class="sbx-import-text" rows={10} spellcheck={false} value={text} onInput={(e) => { setText(e.currentTarget.value); setProblem(''); }} placeholder='{ "scenarios": [ ... ] }' />
          <label class="sbx-checkrow">
            <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.currentTarget.checked)} />
            <span>Update scenarios that already exist with the same name <span class="sbx-small">(otherwise they are skipped)</span></span>
          </label>
          {problem && <p class="sbx-error" role="alert">{problem}</p>}
          <div class="sbx-trydone">
            <button type="button" class="sbx-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" class="sbx-btn primary" onClick={review} disabled={!text.trim()}>Review</button>
          </div>
        </>
      )}

      {phase !== 'choose' && plan && (
        <>
          <p>
            {phase === 'review' && (toDo > 0
              ? <><strong>{[toCreate && `${plural(toCreate, 'scenario')} will be created`, toUpdate && `${plural(toUpdate, 'scenario')} will be updated`].filter(Boolean).join(', ')}</strong>{toDo < plan.length ? `, ${plan.length - toDo} skipped` : ''}. {toUpdate ? 'An update replaces that scenario\'s current data on the account for everyone, and cannot be undone here.' : 'Nothing on the account is changed or replaced.'}</>
              : <><strong>Nothing to create.</strong> Every scenario in the file was skipped.</>)}
            {busy && <><Spinner /> Creating, one at a time...</>}
            {phase === 'done' && <><strong>{made} created or updated</strong>{failed ? `, ${failed} did not go through` : ''}{notTried ? `, ${notTried} not tried` : ''}{plan.length - toDo ? `, ${plan.length - toDo} skipped` : ''}.</>}
          </p>
          <div class="sbx-tablewrap sbx-import-table-wrap" tabIndex={0} role="region" aria-label="What the import does">
            <table class="sbx-table sbx-import-table">
              <thead><tr><th>Scenario</th><th>Login</th><th>Result</th></tr></thead>
              <tbody>
                {plan.map((p, i) => {
                  const r = results[i];
                  const state = p.action === 'skip' ? { text: `Skipped. ${p.reason}`, tone: 'warn' }
                    : r ? (r.ok ? { text: p.action === 'update' ? 'Updated' : 'Created', tone: 'good' } : { text: r.message, tone: 'bad' })
                      : busy ? { text: 'Waiting', tone: 'plain' } : { text: p.action === 'update' ? 'Will be updated' : 'Will be created', tone: 'plain' };
                  return (
                    <tr key={i}>
                      <td><strong>{plain(p.body.label) || 'No name'}</strong><br /><span class="sbx-small">{p.action !== 'skip' ? summarizeScenario(p.body) : ''}</span></td>
                      <td><code>{plain(p.body.username) || '(none)'}</code>{plain(p.body.password) ? <> / <code>{plain(p.body.password)}</code></> : null}</td>
                      <td class={`sbx-import-${state.tone}`}>{state.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {phase === 'done' && failed > 0 && <Notice tone="bad" title="Some did not go through">Each reason is in the table. The ones that were created are on your account now.</Notice>}
          <div class="sbx-trydone">
            {phase === 'review' && <button type="button" class="sbx-btn ghost" onClick={() => { setPhase('choose'); setPlan(null); }}>Back</button>}
            {phase === 'review' && <button type="button" class="sbx-btn primary" onClick={run} disabled={toDo === 0}>{toUpdate ? (toCreate ? `Create ${toCreate} and update ${toUpdate}` : `Update ${toUpdate}`) : `Create ${toCreate}`}</button>}
            {busy && <button type="button" class="sbx-btn ghost" onClick={() => { if (Date.now() - startedAt.current > 700) stop.current = true; }}>Stop after this one</button>}
            {phase === 'done' && <button type="button" class="sbx-btn primary" onClick={onClose}>Close</button>}
          </div>
        </>
      )}
    </Dialog>
  );
}
