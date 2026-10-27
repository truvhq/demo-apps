/**
 * FILE SUMMARY: Try a login. Two ways:
 *   Run it headless      signs in to the Truv test payroll provider through the API and shows what comes back
 *   Enter creds manually the real Bridge widget as a dialog, with the login pinned at the top to type
 * Either way the result is read from the sandbox order the same way, and compared with what a
 * scenario was authored to return.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { needsWidget, expectedStatus, payFrequencyLabel, mfaSteps, standardMfaSteps, describeError, explain, judge, scenarioForLogin, refreshDiff } from './model.js';
import { isOk } from './api.js';
import { watchRun, startHeadless, startRefresh } from './runner.js';
import { outcomeFor, DOC_LINKS } from './outcomes.js';
import { openBridge } from './bridge.js';
import { Dialog, Field, Notice, Spinner, StatusChip, Chip } from './ui.jsx';
import { JsonViewer } from './JsonViewer.jsx';

const PRODUCTS = [
  ['income', 'Income'], ['employment', 'Employment'], ['assets', 'Assets'],
];
const WHERE = { assets: 'Truv Bank (non-OAuth)' };
const where = (product) => WHERE[product] || 'Truv Payroll Provider';
const HEADLESS = new Set(['income', 'employment']);
const MAX_LOGINS = 3;

export function TryIt({ target, scenarios = [], onClose, call, logCalls, onBridgeEvent, onUser }) {
  const open = !!target;
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [product, setProduct] = useState('income');
  const [phase, setPhase] = useState('setup');          // setup | running | done
  const [steps, setSteps] = useState([]);
  const [waiting, setWaiting] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);           // { run, order }
  // Every run has a number. Stopping or starting another run changes the number, and a loop that
  // finds its own number is no longer current stops quietly, so an old run can never revive.
  const runId = useRef(0);
  const bridge = useRef(null);
  const started = useRef(0);
  const body = useRef(null);
  const firstPhase = useRef(true);
  const [starting, setStarting] = useState(false);       // a run is being set up; a second press would start another
  const [extra, setExtra] = useState([]);                  // more logins for the same order: [{ login, password }]
  const [how, setHow] = useState('headless');             // how the run in front of you was made: headless | manual
  const [refresh, setRefresh] = useState(null);            // null | { phase: 'running' | 'done' | 'failed', run, order, ids, error }
  const ids = useRef(null);
  const taskCount = useRef(0);

  // Fresh state each time it opens for a different login.
  useEffect(() => {
    runId.current++;
    if (!target) return;
    setLogin(target.login || '');
    setPassword(target.password || (target.scenario ? 'password' : ''));
    const options = productOptions(target);
    setProduct(options.includes('income') ? 'income' : options[0] || 'income');
    setPhase('setup'); setSteps([]); setError(null); setResult(null); setWaiting(''); setExtra([]); setRefresh(null);
    firstPhase.current = true;
  }, [target]);

  useEffect(() => () => { runId.current++; bridge.current?.close(); }, []);

  // The button that was pressed goes away as the phase changes, so focus has to be handed on.
  useEffect(() => {
    if (!open) return;
    if (firstPhase.current) { firstPhase.current = false; return; }
    if (phase === 'setup') body.current?.querySelector('.sbx-choice:not([disabled])')?.focus();
    else body.current?.focus();
  }, [phase, open]);

  const options = target ? productOptions(target) : [];
  const scenario = target?.scenario;
  const restriction = scenario ? restrictionOf(scenario) : '';
  // The scenario only counts while what is typed still signs in as it: change the login and it no longer answers.
  const active = scenario && scenario.enabled !== false && !restriction && login === scenario.username && (!scenario.password || password === scenario.password)
    ? scenario : scenarioForLogin(scenarios, login, password);
  const logins = [{ login, password }, ...extra];
  const widgetOnly = logins.some(l => needsWidget({ login: l.login, password: l.password, scenario: l === logins[0] ? active : scenarioForLogin(scenarios, l.login, l.password) }));
  const dupes = new Set(logins.map(l => l.login)).size < logins.length;
  const canRunHere = HEADLESS.has(product) && !widgetOnly && !dupes && logins.every(l => l.login && l.password);
  const expectedFor = (l, scenarioFor) => expectedStatus({
    login: l.login, password: l.password, scenario: scenarioFor,
    status: !scenarioFor && target?.kind === 'standard' && l.login === target.login && l.password === target.password ? target.status : null,
  });
  const expected = expectedFor(logins[0], active);
  const noPassword = !!scenario && !scenario.password;

  const note = (label, tone = 'plain') => setSteps(s => [...s, { label, tone, at: Math.round((Date.now() - started.current) / 1000) }]);

  async function finish(runIds, mine, list = []) {
    const out = await watchRun({ call, ids: runIds, product, logins: list, live: () => runId.current === mine, note, waiting: setWaiting, logCalls, onError: setError });
    if (!out || runId.current !== mine) return;
    taskCount.current = out.taskCount || 0;
    setWaiting('');
    setResult(out);
    setPhase('done');
  }

  async function runHere() {
    if (starting) return;
    const mine = ++runId.current;
    started.current = Date.now();
    setPhase('running'); setSteps([]); setError(null); setResult(null); setRefresh(null); setHow('headless');
    note('Creating a sandbox order');
    setStarting(true);
    const env = await startHeadless(call, { product, logins });
    setStarting(false);
    if (runId.current !== mine) return;
    if (!isOk(env)) { setError(describeError(env)); setPhase('setup'); return; }
    ids.current = env.data;
    onUser?.(env.data.user_id, target.label);
    note(`Signed in as ${login}`, 'good');
    await finish(env.data, mine, logins);
  }

  async function openWidget() {
    if (starting) return;
    const mine = ++runId.current;
    started.current = Date.now();
    setError(null); setResult(null); setRefresh(null); setHow('manual');
    setStarting(true);
    const env = await call('POST', '/run', { mode: 'widget', product });
    setStarting(false);
    if (runId.current !== mine) return;
    if (!isOk(env)) { setError(describeError(env)); return; }
    const runIds = env.data;
    ids.current = runIds;
    onUser?.(runIds.user_id, target.label);
    const handle = openBridge({
      token: runIds.bridge_token,
      credentials: login ? { login, password, where: where(product), then: scenario ? mfaSteps(scenario) : standardMfaSteps(login, password) } : null,
      onLoad: () => onBridgeEvent('onLoad()', null),
      onEvent: (type, payload, source) => onBridgeEvent(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null),
      onCompleted: () => { handle?.close(); bridge.current = null; setPhase('running'); setSteps([{ label: 'Bridge finished', tone: 'good', at: 0 }]); finish(runIds, mine); },
      onLeave: () => { handle?.close(); bridge.current = null; setPhase('setup'); setError({ tone: 'info', title: 'You closed Bridge before it finished', detail: 'Nothing was returned. Try again, or run it headless if this login allows it.', fields: [], hint: null }); },
    });
    if (!handle) { setError({ title: 'Bridge did not load', detail: 'The Truv script could not be reached. Check your network and try again.', fields: [], hint: null }); return; }
    bridge.current = handle;
  }

  // Ask Truv to refresh what a Bridge-finished order connected, then read the new order and set it beside the first.
  async function runRefresh() {
    if (!ids.current || refresh?.phase === 'running') return;
    const mine = ++runId.current;
    setRefresh({ phase: 'running' });
    // Truv can take a moment to count a connection that has just finished in Bridge, so a refusal is tried again a few times.
    let env = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      env = await startRefresh(call, { orderId: ids.current.order_id, userId: ids.current.user_id, product });
      if (runId.current !== mine) return;
      if (isOk(env) || env.status === 401 || env.status === 403) break;
      await new Promise(r => setTimeout(r, 3000));
      if (runId.current !== mine) return;
    }
    if (!isOk(env)) { setRefresh({ phase: 'failed', error: describeError(env) }); return; }
    const out = await watchRun({
      call, ids: { order_id: env.data.order_id, user_id: env.data.user_id }, product, skipTasks: taskCount.current,
      live: () => runId.current === mine, logCalls,
      onError: (err) => setRefresh({ phase: 'failed', error: err }),
    });
    if (!out || runId.current !== mine) return;
    if (!out.run.settled) { setRefresh(prev => (prev?.phase === 'failed' ? prev : { phase: 'failed', error: { title: 'The refresh did not finish', detail: 'Truv had not finished refreshing after two and a half minutes, so there is nothing to compare yet.', fields: [], hint: null } })); return; }
    setRefresh(prev => (prev?.phase === 'failed' ? prev : { phase: 'done', run: out.run, order: out.order }));
  }

  function stop() { runId.current++; setPhase('setup'); setRefresh(null); }

  return (
    <Dialog open={open} onClose={() => { runId.current++; onClose(); }} title={target ? `Try ${target.label}` : ''} wide labelledBy="sbx-try-title">
      {target && (
        <div class="sbx-try" ref={body} tabIndex={-1}>
          {phase === 'setup' && (
            <>
              <div class="sbx-grid">
                <Field label="Login">{(p) => <input {...p} type="text" value={login} onInput={(e) => setLogin(e.currentTarget.value)} spellcheck={false} autocomplete="off" data-autofocus />}</Field>
                <Field label="Password" hint={noPassword ? 'This scenario matches on the username alone, so any password works.' : undefined}>{(p) => <input {...p} type="text" value={password} onInput={(e) => setPassword(e.currentTarget.value)} spellcheck={false} autocomplete="off" />}</Field>
                <Field label="Product" hint={`In Bridge, search for ${where(product)}.`}>
                  {(p) => (
                    <select {...p} value={product} onChange={(e) => setProduct(e.currentTarget.value)}>
                      {PRODUCTS.filter(([v]) => options.includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                </Field>
              </div>

              {extra.map((l, i) => (
                <div class="sbx-grid sbx-extra" key={i}>
                  <Field label={`Login ${i + 2}`}>{(p) => <input {...p} type="text" value={l.login} onInput={(e) => setExtra(list => list.map((x, k) => (k === i ? { ...x, login: e.currentTarget.value } : x)))} spellcheck={false} autocomplete="off" />}</Field>
                  <Field label={`Password ${i + 2}`}>{(p) => <input {...p} type="text" value={l.password} onInput={(e) => setExtra(list => list.map((x, k) => (k === i ? { ...x, password: e.currentTarget.value } : x)))} spellcheck={false} autocomplete="off" />}</Field>
                  <div class="sbx-extra-end"><button type="button" class="sbx-btn ghost small" onClick={() => setExtra(list => list.filter((_, k) => k !== i))}>Remove login {i + 2}</button></div>
                </div>
              ))}
              {HEADLESS.has(product) && (
                <div class="sbx-addlogin">
                  <button type="button" class="sbx-btn ghost small" onClick={() => setExtra(list => [...list, { login: '', password: '' }])} disabled={logins.length >= MAX_LOGINS}>Add another login</button>
                  <span class="sbx-small">{logins.length >= MAX_LOGINS ? `An order takes up to ${MAX_LOGINS} logins.` : 'Signs in as each login on one order, like a household with two incomes. Headless only.'}</span>
                </div>
              )}

              <p class="sbx-expect">
                {widgetOnly
                  ? <>Asks for a code, which only Bridge can answer. After you answer it, the expected result is <StatusChip status={expected} />.</>
                  : logins.length > 1
                    ? <>Expected results {logins.map((l, i) => <span key={i} class="sbx-expect-one">{l.login || `Login ${i + 1}`} <StatusChip status={expectedFor(l, i === 0 ? active : scenarioForLogin(scenarios, l.login, l.password))} /></span>)}</>
                    : <>Expected result <StatusChip status={expected} /></>}
              </p>

              {scenario?.enabled === false && <Notice tone="warn" title="This scenario is switched off">Signing in will not use it, so you get Truv's built-in answer instead. Switch it on first.</Notice>}
              {restriction && <Notice tone="info" title={`This scenario only answers ${restriction}`}>Trying it here signs in to the Truv payroll provider as a first sign-in, so it may not match, and the result can differ from what you wrote.</Notice>}
              {error && <Notice tone={error.tone || 'bad'} title={error.title}>{explain(error)}</Notice>}

              <div class="sbx-trychoices">
                <button type="button" class="sbx-choice" onClick={runHere} disabled={!canRunHere || starting}>
                  <strong>Run it headless</strong>
                  <span>Signs in through the API and shows what comes back.</span>
                  {!canRunHere && <em>{widgetOnly ? (extra.length ? 'A login here asks for a code, which only Bridge can answer. Remove the extra logins, then use Enter creds manually.' : 'This login asks for a code, so use Enter creds manually.')   : !HEADLESS.has(product) ? 'Headless runs cover income and employment. Use Enter creds manually for this product.' : dupes ? 'Each login on an order has to be different.' : 'Fill in every login and password first.'}</em>}
                </button>
                <button type="button" class="sbx-choice" onClick={openWidget} disabled={starting || extra.length > 0}>
                  <strong>Enter creds manually</strong>
                  <span>Opens Bridge so you type the login yourself, as an applicant would. The login to type is shown at the top.</span>
                  {extra.length > 0 && <em>Bridge takes one login at a time. Remove the extra logins to use it.</em>}
                </button>
              </div>
            </>
          )}

          {phase !== 'setup' && (
            <>
              <ol class="sbx-timeline" aria-live="polite">
                {steps.map((s, i) => <li key={i} class={`is-${s.tone}`}><span>{s.label}</span><span class="sbx-small">{s.at}s</span></li>)}
                {phase === 'running' && <li class="is-wait"><Spinner /> <span>{waiting || 'Waiting'}</span></li>}
              </ol>
              {phase === 'running' && <button type="button" class="sbx-btn ghost small" onClick={stop}>Stop waiting</button>}
              {error && <Notice tone={error.tone || 'bad'} title={error.title}>{explain(error)}</Notice>}
              {phase === 'done' && result && (
                <Result
                  result={result} product={product} how={how} logins={logins}
                  expectedFor={(l, i) => expectedFor(l, i === 0 ? active : scenarioForLogin(scenarios, l.login, l.password))}
                  scenarioFor={(l, i) => (i === 0 ? active : scenarioForLogin(scenarios, l.login, l.password))}
                />
              )}
              {phase === 'done' && result?.run.ok && logins.length === 1 && (
                <RefreshSection
                  how={how} state={refresh} onRun={runRefresh} first={result.run} product={product}
                  refreshScenario={scenarioForLogin(scenarios, login, password, { refresh: true })}
                />
              )}
              {phase === 'done' && (
                <div class="sbx-trydone">
                  <button type="button" class="sbx-btn ghost" onClick={() => { runId.current++; setPhase('setup'); setResult(null); setSteps([]); setRefresh(null); }}>Run another</button>
                  <button type="button" class="sbx-btn primary" onClick={onClose}>Close</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function productOptions(target) {
  const own = target.scenario?.products?.length ? target.scenario.products : null;
  const list = own || target.products || ['income', 'employment'];
  const valid = list.filter(p => PRODUCTS.some(([v]) => v === p));
  // An income report carries employment details too, so it can be tried as employment.
  if (valid.includes('income') && !valid.includes('employment')) valid.push('employment');
  return valid.length ? valid : ['income'];
}

// What a scenario is limited to, in words, or '' when it answers any first sign-in.
function restrictionOf(s) {
  const parts = [];
  if (s.provider_id) parts.push(`the provider ${s.provider_id}`);
  if (s.company_domain) parts.push(`the employer ${s.company_domain}`);
  if (s.is_refresh === true) parts.push('refreshes');
  return parts.join(' and ');
}

function Verdict({ verdict }) {
  if (verdict.verdict === 'pending') return null;
  const pass = verdict.verdict === 'pass';
  return (
    <>
      <Chip tone={pass ? 'good' : 'bad'}>{pass ? 'Pass' : 'Fail'}</Chip>
      {!pass && (
        <ul class="sbx-reasons" aria-label="Why it failed">
          {verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {verdict.notes.map((n, i) => <p key={i} class="sbx-small">{n}</p>)}
    </>
  );
}

function Meaning({ status }) {
  const o = outcomeFor(status);
  if (!o) return null;
  return (
    <p class="sbx-small sbx-meaning">
      <strong>What it means:</strong> {o.means} <strong>What to do:</strong> {o.do}{' '}
      <a class="sbx-link" href={DOC_LINKS.lifecycle.href} target="_blank" rel="noopener noreferrer">{DOC_LINKS.lifecycle.label}</a>
    </p>
  );
}

function Result({ result, product, how, logins, expectedFor, scenarioFor }) {
  const { run, order } = result;
  const several = run.employers.length > 1;
  const blocks = several ? run.employers.map((e, i) => ({ run: e, login: logins[i] || { login: '', password: '' }, i })) : [{ run, login: logins[0], i: 0 }];
  const verdicts = blocks.map(b => judge({ scenario: scenarioFor(b.login, b.i), expected: expectedFor(b.login, b.i), run: b.run, product }));
  const overall = !run.settled ? 'pending' : verdicts.every(v => v.verdict === 'pass') ? 'pass' : 'fail';
  return (
    <div class="sbx-result">
      <div class="sbx-result-head">
        <h3>{run.settled ? 'Result' : 'No result yet'}</h3>
        {!several && <StatusChip status={run.status} />}
        {several && run.settled && <Chip tone={overall === 'pass' ? 'good' : 'bad'}>{overall === 'pass' ? 'All passed' : 'Some failed'}</Chip>}
        {!several && <Verdict verdict={verdicts[0]} />}
      </div>

      {blocks.map((b, n) => (
        <RunBlock key={b.i} block={b} verdict={verdicts[n]} several={several} product={product} scenario={scenarioFor(b.login, b.i)} expected={expectedFor(b.login, b.i)} />
      ))}

      {how === 'headless' && (
        <p class="sbx-small sbx-note">
          A headless run signs in and reads the data, but nobody finishes the order in Bridge, so the order stays unfinished and Truv sends task updates only. Use Enter creds manually to see the order complete.
        </p>
      )}

      {order && (
        <details class="sbx-rawdetails">
          <summary>The order as Truv returned it</summary>
          <JsonViewer value={order} label="Order" filename={`truv-order-${order.id || 'response'}.json`} />
        </details>
      )}
    </div>
  );
}

function RunBlock({ block, verdict, several, product, scenario, expected }) {
  const { run, login } = block;
  const rows = verdict.rows;
  return (
    <section class="sbx-runblock">
      {several && (
        <div class="sbx-result-head">
          <h4>{`Login ${block.i + 1}: ${login?.login || ''}`}</h4>
          <StatusChip status={run.status} />
          <Verdict verdict={verdict} />
        </div>
      )}
      {run.errorMessage && <p class="sbx-small">Message from the provider: <q>{run.errorMessage}</q></p>}
      {run.settled && !run.ok && <Meaning status={run.status} />}
      {run.settled && run.ok && !several && <Meaning status={run.status} />}

      {run.employments.length > 0 && rows.length === 0 && (
        <>
          <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="Employments returned">
            <table class="sbx-table">
              <thead><tr><th>Employer</th><th>Job</th><th>Paid</th><th class="r">Pay</th>{product !== 'employment' && <th class="r">Paystubs</th>}</tr></thead>
              <tbody>
                {run.employments.map((e, i) => (
                  <tr key={i}>
                    <td>{e.company}</td><td>{e.title}</td><td>{payFrequencyLabel(e.payFrequency)}</td>
                    <td class="r">{e.income ? `${e.income} ${String(e.incomeUnit || '').toLowerCase()}` : ''}</td>
                    {product !== 'employment' && <td class="r">{e.statements}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {product !== 'employment' && run.employments.some(e => e.statements === 0) && <p class="sbx-small">No paystubs came back yet. They can arrive a little after the task finishes.</p>}
        </>
      )}

      {rows.length > 0 && (
        <>
          <h4>What you wrote and what came back</h4>
          <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label={`Authored compared with returned${several ? `, login ${block.i + 1}` : ''}`}>
            <table class="sbx-table">
              <thead><tr><th>Field</th><th>You wrote</th><th>Truv returned</th><th><span class="sbx-sr">Same?</span></th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} class={r.same ? '' : 'is-diff'}>
                    <td>{r.label}</td><td>{String(r.authored)}</td><td>{String(r.returned)}</td>
                    <td>{r.same ? <span class="sbx-good">Same</span> : <span class="sbx-bad">Different</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {run.ok && run.employments.length === 0 && <p class="sbx-small">The task finished but no employment came back. {scenario ? `If you expected data, check that ${login?.login} matches the scenario exactly: it must be typed as written.` : ''}</p>}
    </section>
  );
}

// Refresh asks Truv for new data on a connection that finished in Bridge. A headless sign-in never finishes there.
function RefreshSection({ how, state, onRun, first, refreshScenario, product }) {
  if (how !== 'manual') {
    return (
      <div class="sbx-refresh">
        <h4>Refresh</h4>
        <p class="sbx-small">Truv only refreshes a connection that was finished in Bridge, and a headless run never finishes there. To test a refresh, use Enter creds manually, then come back here.</p>
      </div>
    );
  }
  return (
    <div class="sbx-refresh">
      <h4>Refresh</h4>
      {!state && (
        <>
          <p class="sbx-small">{refreshScenario ? `A refresh scenario answers this login (${refreshScenario.label}), so the new data should differ.` : 'No refresh scenario answers this login, so Truv will return the same data. Add a version for refreshes in the Build tab to see data change.'}</p>
          <button type="button" class="sbx-btn" onClick={onRun}>Run, then refresh</button>
        </>
      )}
      {state?.phase === 'running' && <p class="sbx-small"><Spinner /> Refreshing and waiting for the new data</p>}
      {state?.phase === 'failed' && (
        <>
          <Notice tone="bad" title={state.error?.title || 'The refresh did not run'}>{explain(state.error || {})}</Notice>
          <button type="button" class="sbx-btn ghost small" onClick={onRun}>Try the refresh again</button>
        </>
      )}
      {state?.phase === 'done' && <RefreshDiff first={first} second={state.run} refreshScenario={refreshScenario} product={product} />}
    </div>
  );
}

function RefreshDiff({ first, second, refreshScenario, product }) {
  const rows = refreshDiff(first, second, { product });
  const expected = refreshScenario ? (refreshScenario.behavior_status || 'done') : 'done';
  const verdict = judge({ scenario: refreshScenario, expected, run: second, refresh: true, product });
  const changed = rows.filter(r => r.changed).length;
  return (
    <>
      <div class="sbx-result-head">
        <StatusChip status={second.status} />
        {refreshScenario && <Verdict verdict={verdict} />}
        <span class="sbx-small">{changed ? `${changed} ${changed === 1 ? 'field' : 'fields'} changed` : 'Nothing changed'}</span>
      </div>
      {second.settled && !second.ok && <Meaning status={second.status} />}
      {rows.length > 0 && (
        <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="Before and after the refresh">
          <table class="sbx-table">
            <thead><tr><th>Field</th><th>Before</th><th>After</th><th><span class="sbx-sr">Changed?</span></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} class={r.changed ? 'is-diff' : ''}>
                  <td>{r.label}</td><td>{r.before}</td><td>{r.after}</td>
                  <td>{r.changed ? <span class="sbx-bad">Changed</span> : <span class="sbx-small">Same</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
