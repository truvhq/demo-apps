/**
 * FILE SUMMARY: "Which scenario answers this login?" A dry run of the sandbox resolver: type what a
 * person would type, see which scenario wins and why, without running a verification.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { describeError } from './model.js';
import { LOGINS } from './standard-logins.js';
import { isOk } from './api.js';
import { Dialog, Field, Notice, Chip, Spinner, announce } from './ui.jsx';

const MATCH_NAMES = { username: 'username', password: 'password', provider_id: 'provider', company_domain: 'employer website', product: 'product', is_refresh: 'type of sign-in' };
const PRODUCTS = [['', 'Any product'], ['income', 'Income'], ['employment', 'Employment'], ['deposit_switch', 'Deposit switch'], ['pll', 'Paycheck-linked loans']];

export function Resolve({ seed, onClose, call, onEdit }) {
  const open = !!seed;
  const [form, setForm] = useState({ username: '', password: '', provider_id: '', company_domain: '', product: '', refresh: 'first' });
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);   // { winner, matched_on } | { none: true } | { error }
  const asked = useRef(0);                       // each question has a number; an answer to an older one is dropped

  useEffect(() => {
    if (!seed) return;
    setForm({
      username: seed.username || '', password: seed.password || '', provider_id: seed.provider_id || '', company_domain: seed.company_domain || '',
      product: '', refresh: seed.is_refresh === true ? 'refresh' : 'first',
    });
    setAnswer(null);
    setBusy(false);
    asked.current++;
  }, [seed]);

  const f = (k) => ({ value: form[k], onInput: (e) => { asked.current++; setBusy(false); setAnswer(null); setForm(x => ({ ...x, [k]: e.currentTarget.value })); } });

  async function check() {
    setBusy(true); setAnswer(null);
    const mine = ++asked.current;
    const body = {
      data_source: 'payroll',
      ...(form.username ? { username: form.username } : {}),
      ...(form.password ? { password: form.password } : {}),
      ...(form.provider_id ? { provider_id: form.provider_id } : {}),
      ...(form.company_domain ? { company_domain: form.company_domain } : {}),
      ...(form.product ? { product: form.product } : {}),
      is_refresh: form.refresh === 'refresh',
    };
    const env = await call('POST', '/resolve', body);
    if (mine !== asked.current) return;        // the inputs changed, or the dialog moved on, while it was away
    setBusy(false);
    if (isOk(env)) { setAnswer({ winner: env.data.scenario, matched: env.data.matched_on || [], tier: env.data.tier }); announce(`${env.data.scenario?.label || 'A scenario'} answers it.`); }
    else if (env.status === 404) {
      const builtIn = LOGINS.find(l => l.login === form.username && (!form.password || l.password === form.password));
      setAnswer({ none: true, builtIn });
      announce('No scenario answers this.');
    } else setAnswer({ error: describeError(env) });
  }

  const sameAsSeed = answer?.winner && seed && answer.winner.id === seed.id;
  // Only worth calling a scenario shadowed when the input is still the one it was opened with.
  const untouched = !!seed && form.username === (seed.username || '') && form.password === (seed.password || '') && form.provider_id === (seed.provider_id || '') && form.company_domain === (seed.company_domain || '') && form.refresh === (seed.is_refresh === true ? 'refresh' : 'first');

  return (
    <Dialog open={open} onClose={onClose} title="Which scenario answers this login?" labelledBy="sbx-resolve-title">
      <p class="sbx-small">Type what a person would type. This asks Truv which of your scenarios would answer it, without running anything.</p>
      <div class="sbx-grid">
        <Field label="Username">{(p) => <input {...p} type="text" {...f('username')} spellcheck={false} data-autofocus />}</Field>
        <Field label="Password" optional>{(p) => <input {...p} type="text" {...f('password')} spellcheck={false} />}</Field>
        <Field label="Provider" optional>{(p) => <input {...p} type="text" {...f('provider_id')} spellcheck={false} placeholder="adp" />}</Field>
        <Field label="Employer website" optional>{(p) => <input {...p} type="text" {...f('company_domain')} spellcheck={false} placeholder="acme.com" />}</Field>
        <Field label="Product">{(p) => <select {...p} {...f('product')}>{PRODUCTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
        <Field label="Sign-in">{(p) => <select {...p} {...f('refresh')}><option value="first">A first sign-in</option><option value="refresh">A refresh</option></select>}</Field>
      </div>
      <button type="button" class="sbx-btn primary" onClick={check} disabled={busy || !(form.username || form.password || form.provider_id || form.company_domain)}>{busy ? <><Spinner /> Checking...</> : 'Find the match'}</button>

      {answer?.error && <Notice tone="bad" title={answer.error.title}>{[answer.error.detail, answer.error.hint].filter(Boolean).join(' ')}</Notice>}
      {answer?.none && (
        <Notice tone="info" title="None of your scenarios answers this">
          {answer.builtIn ? `Truv's built-in test data answers it: ${answer.builtIn.returns}.` : 'No scenario and no standard login matches this, so a sign-in would fail.'}
        </Notice>
      )}
      {answer?.winner && (
        <div class="sbx-answer">
          <p><strong>{answer.winner.label}</strong> answers it{sameAsSeed ? ', which is the one you are looking at.' : '.'}</p>
          {seed && !sameAsSeed && untouched && <Notice tone="warn" title="A different scenario wins">This is not the one you started from, so {seed.label} is shadowed for this input. A scenario that sets more matching fields, or one made only for refreshes, beats a general one.</Notice>}
          <p class="sbx-small">Matched on {answer.matched.length ? answer.matched.map((m, i) => <span key={m}>{i > 0 && <span class="sbx-sr">, </span>}<Chip>{MATCH_NAMES[m] || m}</Chip> </span>) : 'nothing in particular'}.</p>
          {onEdit && !sameAsSeed && <button type="button" class="sbx-btn ghost small" onClick={() => { onClose(); onEdit(answer.winner); }}>Open {answer.winner.label}</button>}
        </div>
      )}
    </Dialog>
  );
}
