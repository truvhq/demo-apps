/**
 * FILE SUMMARY: Runs several logins one after another (three at a time) without anyone typing, and keeps a record:
 * for each, what was expected, what Truv answered, pass or fail, how long it took and the order id. The record can be
 * downloaded as CSV or JSON, with a notes column you can fill in, so a round of testing leaves evidence.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { judge, expectedStatus, suiteCsv, suiteRow, SUITE_COLUMNS, describeError } from './model.js';
import { isOk } from './api.js';
import { startHeadless, watchRun, mapLimit } from './runner.js';
import { Dialog, Field, Spinner, StatusChip, Chip, announce, plural } from './ui.jsx';

const PRODUCTS = [['income', 'Income'], ['employment', 'Employment']];
const LIMIT = 3;

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Suite({ plan, onClose, call, logCalls, onUser, today }) {
  const open = !!plan;
  const [product, setProduct] = useState('income');
  const [phase, setPhase] = useState('setup');      // setup | running | done
  const [rows, setRows] = useState([]);              // one per item: { ...item, state: 'waiting' | 'running' | 'done' | 'skipped', ... }
  const runId = useRef(0);

  useEffect(() => {
    runId.current++;
    if (!plan) return;
    setPhase('setup'); setProduct('income');
    setRows(plan.items.map(i => ({ ...i, state: i.skip ? 'skipped' : 'waiting', notes: '' })));
  }, [plan]);
  useEffect(() => () => { runId.current++; }, []);

  const patch = (key, change) => setRows(list => list.map(r => (r.key === key ? { ...r, ...change } : r)));
  const todo = rows.filter(r => r.state !== 'skipped');
  const finished = rows.filter(r => r.state === 'done');
  const passed = finished.filter(r => r.verdict === 'pass').length;
  const failed = finished.filter(r => r.verdict === 'fail').length;
  const couldNot = finished.filter(r => r.verdict === 'error').length;

  async function runOne(item, mine) {
    const alive = () => runId.current === mine;
    const began = Date.now();
    patch(item.key, { state: 'running' });
    const env = await startHeadless(call, { product, logins: [{ login: item.login, password: item.password }] });
    if (!alive()) return;
    if (!isOk(env)) { const err = describeError(env); patch(item.key, { state: 'done', verdict: 'error', note: err.title, seconds: Math.round((Date.now() - began) / 1000) }); return; }
    onUser?.(env.data.user_id, item.label);
    const out = await watchRun({ call, ids: env.data, product, live: alive, logCalls });
    if (!out || !alive()) return;
    // A scenario limited to other products is not answered at this product, so only the status is checked.
    const applies = !item.scenario || !(item.scenario.products?.length && !item.scenario.products.includes(product));
    const expected = applies ? item.expected : expectedStatus({ login: item.login, password: item.password });
    const v = judge({ scenario: applies ? item.scenario : null, expected, run: out.run, product });
    patch(item.key, {
      state: 'done', status: out.run.status, orderId: env.data.order_id, seconds: Math.round((Date.now() - began) / 1000),
      verdict: out.failed ? 'error' : out.run.settled ? v.verdict : 'error', reasons: v.reasons, note: out.timedOut ? 'Did not finish in time.' : v.notes.join(' '),
    });
  }

  async function start() {
    const mine = ++runId.current;
    setPhase('running');
    setRows(list => list.map(r => (r.state === 'skipped' ? r : { ...r, state: 'waiting', verdict: undefined, status: undefined, reasons: undefined, note: undefined, orderId: undefined, seconds: undefined })));
    const items = rows.filter(r => r.state !== 'skipped');
    await mapLimit(items, LIMIT, async (item) => {
      try { await runOne(item, mine); } catch { if (runId.current === mine) patch(item.key, { state: 'done', verdict: 'error', note: 'Something went wrong while running this one.' }); }
    }, () => runId.current === mine);
    if (runId.current !== mine) return;
    setPhase('done');
    announce('The suite finished.');
  }

  function stop() { runId.current++; setPhase('done'); setRows(list => list.map(r => (r.state === 'running' || r.state === 'waiting' ? { ...r, state: 'waiting' } : r))); }

  const records = () => rows.map(r => ({ ...r, skipped: r.state === 'skipped' ? r.skip : '', note: [r.note, r.notes].filter(Boolean).join(' ') }));
  const csv = () => save(`sandbox-suite-${today}.csv`, `\uFEFF${suiteCsv(records())}\n`, 'text/csv;charset=utf-8');
  const json = () => save(`sandbox-suite-${today}.json`, `${JSON.stringify({ ran_on: today, product, results: records().map(suiteRow) }, null, 2)}\n`, 'application/json');

  return (
    <Dialog open={open} onClose={() => { runId.current++; onClose(); }} title={plan?.title || 'Run a suite'} wide labelledBy="sbx-suite-title">
      {plan && (
        <div class="sbx-suite">
          {phase === 'setup' && (
            <>
              <p>{plan.intro || 'Signs in as each login without anyone typing, three at a time, and compares each result with what it should be.'} {plural(todo.length, 'login')} will run{rows.length > todo.length ? `, ${rows.length - todo.length} skipped` : ''}.</p>
              <div class="sbx-grid">
                <Field label="Product" hint="Headless runs cover income and employment.">
                  {(p) => <select {...p} value={product} onChange={(e) => setProduct(e.currentTarget.value)}>{PRODUCTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                </Field>
              </div>
            </>
          )}
          {phase === 'running' && <p role="status"><Spinner /> {finished.length} of {todo.length} done</p>}
          {phase === 'done' && (
            <p role="status">
              <strong>{passed} passed</strong>{failed ? `, ${failed} failed` : ''}{couldNot ? `, ${couldNot} could not run` : ''}{todo.length - finished.length ? `, ${todo.length - finished.length} not run` : ''}.
            </p>
          )}

          <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="Suite results">
            <table class="sbx-table sbx-suite-table">
              <thead><tr>{SUITE_COLUMNS.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} class={r.verdict === 'fail' ? 'is-diff' : ''}>
                    <td>{r.label}</td>
                    <td><code>{r.login}</code></td>
                    <td><StatusChip status={r.expected} /></td>
                    <td>{r.status ? <StatusChip status={r.status} /> : r.state === 'running' ? <Spinner /> : ''}</td>
                    <td>
                      {r.state === 'skipped' ? <span class="sbx-small">Skipped. {r.skip}</span>
                        : r.state === 'waiting' ? <span class="sbx-small">{phase === 'running' ? 'Waiting' : 'Not run'}</span>
                          : r.state === 'running' ? <span class="sbx-small">Running</span>
                            : r.verdict === 'pass' ? <Chip tone="good">Pass</Chip>
                              : r.verdict === 'fail' ? <Chip tone="bad">Fail</Chip>
                                : <Chip tone="warn">Could not run</Chip>}
                      {r.verdict === 'fail' && (r.reasons || []).length > 0 && <ul class="sbx-reasons">{r.reasons.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}{r.reasons.length > 4 && <li>and {r.reasons.length - 4} more</li>}</ul>}
                      {r.note && <p class="sbx-small">{r.note}</p>}
                    </td>
                    <td class="r">{r.seconds ?? ''}</td>
                    <td><code class="sbx-suite-id">{r.orderId || ''}</code></td>
                    <td>
                      <label class="sbx-sr" for={`sbx-note-${r.key}`}>Notes for {r.label}</label>
                      <input id={`sbx-note-${r.key}`} type="text" class="sbx-suite-note" value={r.notes} onInput={(e) => patch(r.key, { notes: e.currentTarget.value })} placeholder="Add a note" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div class="sbx-trydone">
            {phase === 'running' && <button type="button" class="sbx-btn ghost" onClick={stop}>Stop</button>}
            {phase !== 'running' && finished.length > 0 && <button type="button" class="sbx-btn ghost" onClick={csv}>Download CSV</button>}
            {phase !== 'running' && finished.length > 0 && <button type="button" class="sbx-btn ghost" onClick={json}>Download JSON</button>}
            {phase !== 'running' && <button type="button" class="sbx-btn ghost" onClick={() => { runId.current++; onClose(); }}>Close</button>}
            {phase !== 'running' && <button type="button" class="sbx-btn primary" onClick={start} disabled={!todo.length} data-autofocus>{phase === 'done' ? 'Run again' : `Run ${todo.length}`}</button>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
