/**
 * FILE SUMMARY: Try a login. Two ways:
 *   Run here        signs in to the Truv test payroll provider for you and shows what comes back
 *   Open in Bridge  the real widget as a dialog, with the login pinned at the top to type
 * Either way the result is read from the sandbox order the same way, and compared with what a
 * scenario was authored to return.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { readRun, needsWidget, expectedStatus, payFrequencyLabel, mfaSteps, standardMfaSteps, statusName, compareToScenario, describeError, explain } from './model.js';
import { isOk } from './api.js';
import { openBridge } from './bridge.js';
import { Dialog, Field, Notice, Spinner, StatusChip, Chip } from './ui.jsx';

const PRODUCTS = [
  ['income', 'Income'], ['employment', 'Employment'], ['assets', 'Assets'], ['deposit_switch', 'Deposit switch'], ['pll', 'Paycheck-linked loans'],
];
const WHERE = { assets: 'Truv Bank (non-OAuth)' };
const where = (product) => WHERE[product] || 'Truv Payroll Provider';
const HEADLESS = new Set(['income', 'employment']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const POLL_MS = 2000;
const GIVE_UP_MS = 150_000;     // a scenario can make the task wait up to 120 seconds

export function TryIt({ target, onClose, call, logCalls, onBridgeEvent }) {
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

  // Fresh state each time it opens for a different login.
  useEffect(() => {
    runId.current++;
    if (!target) return;
    setLogin(target.login || '');
    setPassword(target.password || (target.scenario ? 'password' : ''));
    const options = productOptions(target);
    setProduct(options.includes('income') ? 'income' : options[0] || 'income');
    setPhase('setup'); setSteps([]); setError(null); setResult(null); setWaiting('');
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
  const widgetOnly = needsWidget({ login, password, scenario });
  const canRunHere = HEADLESS.has(product) && !widgetOnly;
  const expected = expectedStatus({ login, password, scenario, status: target?.status });
  const noPassword = !!scenario && !scenario.password;
  const restriction = scenario ? restrictionOf(scenario) : '';

  const note = (label, tone = 'plain') => setSteps(s => [...s, { label, tone, at: Math.round((Date.now() - started.current) / 1000) }]);

  // Read the run until it settles, noting each change. Polls are not logged one by one: the Dev panel
  // gets the first, each change of status, and the last.
  async function watch(ids, mine) {
    const live = () => runId.current === mine;
    const begun = Date.now();
    let lastStatus = null;
    let latest = { run: readRun({}), order: null };
    const read = async (logIt) => {
      const env = await call('GET', `/run/${ids.order_id}?user_id=${ids.user_id}`, undefined, { quiet: true });
      if (!live()) return null;
      if (!isOk(env)) { logCalls(env.calls); setError(describeError(env)); return null; }
      const run = readRun({ tasks: env.data.tasks, order: env.data.order });
      latest = { run, order: env.data.order };
      if (logIt || run.status !== lastStatus || run.settled) logCalls(env.calls);
      return run;
    };
    setWaiting('Waiting for the sign-in to finish');
    while (live() && Date.now() - begun < GIVE_UP_MS) {
      const first = lastStatus === null;
      const run = await read(first);
      if (!run) break;
      if (run.status && run.status !== lastStatus) {
        lastStatus = run.status;
        note(run.ok ? 'The sign-in worked' : `Task ${run.settled ? 'ended as' : 'is'} ${statusName(run.status).toLowerCase()}`, run.settled ? (run.ok ? 'good' : 'bad') : 'plain');
      }
      if (run.settled) break;
      await sleep(POLL_MS);
    }
    // Paystubs fill in a little after the task reports done. Employment returns none, so it does not wait.
    if (live() && latest.run.ok && product !== 'employment') {
      setWaiting('Waiting for paystubs to arrive');
      for (let i = 0; i < 8 && live(); i++) {
        if (latest.run.employments.some(e => e.statements > 0)) break;
        await sleep(POLL_MS);
        if (!(await read(false))) break;
      }
    }
    if (live() && !latest.run.settled) note('Still not finished after 2 and a half minutes. Stopped waiting.', 'bad');
    return live() ? latest : null;
  }

  async function finish(ids, mine) {
    const run = await watch(ids, mine);
    if (!run || runId.current !== mine) return;
    setWaiting('');
    setResult(run);
    setPhase('done');
  }

  async function runHere() {
    if (starting) return;
    const mine = ++runId.current;
    started.current = Date.now();
    setPhase('running'); setSteps([]); setError(null); setResult(null);
    note('Creating a sandbox order');
    setStarting(true);
    const env = await call('POST', '/run', { mode: 'headless', product, login, password });
    setStarting(false);
    if (runId.current !== mine) return;
    if (!isOk(env)) { setError(describeError(env)); setPhase('setup'); return; }
    note(`Signed in as ${login}`, 'good');
    await finish(env.data, mine);
  }

  async function openWidget() {
    if (starting) return;
    const mine = ++runId.current;
    started.current = Date.now();
    setError(null); setResult(null);
    setStarting(true);
    const env = await call('POST', '/run', { mode: 'widget', product });
    setStarting(false);
    if (runId.current !== mine) return;
    if (!isOk(env)) { setError(describeError(env)); return; }
    const ids = env.data;
    const handle = openBridge({
      token: ids.bridge_token,
      credentials: login ? { login, password, where: where(product), then: scenario ? mfaSteps(scenario) : standardMfaSteps(login, password) } : null,
      onLoad: () => onBridgeEvent('onLoad()', null),
      onEvent: (type, payload, source) => onBridgeEvent(`onEvent("${type}", ${payload ? 'payload' : 'undefined'}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null),
      onCompleted: () => { handle?.close(); bridge.current = null; setPhase('running'); setSteps([{ label: 'Bridge finished', tone: 'good', at: 0 }]); finish(ids, mine); },
      onLeave: () => { handle?.close(); bridge.current = null; setPhase('setup'); setError({ tone: 'info', title: 'You closed Bridge before it finished', detail: 'Nothing was returned. Open it again, or run it here if this login can be run here.', fields: [], hint: null }); },
    });
    if (!handle) { setError({ title: 'Bridge did not load', detail: 'The Truv script could not be reached. Check your network and try again.', fields: [], hint: null }); return; }
    bridge.current = handle;
  }

  function stop() { runId.current++; setPhase('setup'); }

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

              <p class="sbx-expect">
                {widgetOnly
                  ? <>Asks for a code, which only Bridge can answer. After that it should end as <StatusChip status={expected} />.</>
                  : <>Should end as <StatusChip status={expected} /></>}
              </p>

              {scenario?.enabled === false && <Notice tone="warn" title="This scenario is switched off">Signing in will not use it, so you get Truv's built-in answer instead. Switch it on first.</Notice>}
              {restriction && <Notice tone="info" title={`This scenario only answers ${restriction}`}>Trying it here signs in to the Truv payroll provider as a first sign-in, so it may not match, and the result can differ from what you wrote.</Notice>}
              {error && <Notice tone={error.tone || 'bad'} title={error.title}>{explain(error)}</Notice>}

              <div class="sbx-trychoices">
                <button type="button" class="sbx-choice" onClick={runHere} disabled={!canRunHere || starting}>
                  <strong>Run it here</strong>
                  <span>Signs in for you and shows what comes back.</span>
                  {!canRunHere && <em>{widgetOnly ? 'This login asks for a code, so it needs Bridge.' : 'Only income and employment run here.'}</em>}
                </button>
                <button type="button" class="sbx-choice" onClick={openWidget} disabled={starting}>
                  <strong>Open it in Bridge</strong>
                  <span>See what a person sees. Type the login shown at the top, then submit.</span>
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
              {phase === 'done' && result && <Result result={result} expected={expected} scenario={scenario} login={login} product={product} />}
              {phase === 'done' && (
                <div class="sbx-trydone">
                  <button type="button" class="sbx-btn ghost" onClick={() => { setPhase('setup'); setResult(null); setSteps([]); }}>Run it again</button>
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
  const list = own || target.products || ['income', 'employment', 'deposit_switch', 'pll'];
  const valid = list.filter(p => PRODUCTS.some(([v]) => v === p));
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

function Result({ result, expected, scenario, login, product }) {
  const { run, order } = result;
  const matches = run.status === expected;
  const rows = scenario ? compareToScenario(scenario, run) : [];
  return (
    <div class="sbx-result">
      <div class="sbx-result-head">
        <h3>{run.ok ? 'It worked' : run.settled ? 'It ended' : 'No result yet'}</h3>
        <StatusChip status={run.status} />
        {run.settled && <Chip tone={matches ? 'good' : 'warn'}>{matches ? 'As expected' : `Expected: ${statusName(expected).toLowerCase()}`}</Chip>}
      </div>
      {run.errorMessage && <p class="sbx-small">Message from the provider: <q>{run.errorMessage}</q></p>}

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
          <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="Authored compared with returned">
            <table class="sbx-table">
              <thead><tr><th>Field</th><th>You wrote</th><th>Truv returned</th><th><span class="sbx-sr">Same?</span></th></tr></thead>
              <tbody>
                {rows.filter(r => product !== 'employment' || r.label !== 'Paystubs').map(r => (
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
      {run.ok && run.employments.length === 0 && <p class="sbx-small">The task finished but no employment came back. {scenario ? `If you expected data, check that ${login} matches the scenario exactly: it must be typed as written.` : ''}</p>}

      {order && (
        <details class="sbx-rawdetails">
          <summary>The order as Truv returned it</summary>
          <pre class="sbx-json" tabIndex={0}>{JSON.stringify(order, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
