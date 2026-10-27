/**
 * FILE SUMMARY: Make or change a scenario. The form edits the scenario object directly, so a scenario
 * made somewhere else (Postman, curl) opens here with nothing dropped, including fields the form
 * does not show. The JSON view edits the same object.
 */
import { useMemo, useState, useEffect, useRef } from 'preact/hooks';
import {
  PRESETS, STATUSES, FAILURES, MFA_PRESETS, JOB_TYPES, INCOME_UNITS, PAY_FREQUENCIES, OTHER_PAY_FREQUENCIES, PAYROLL_PRODUCTS, LIMITS,
  FAILURE_STATUSES, typeProblems, friendlyField, blankEmployment, buildPaystubs, defaultStubAmounts, snapPayDate, suggestUsername, parseISO, DATA_SOURCE_LABELS,
} from './model.js';
import { getIn, setIn, removeAt, isUnder } from './paths.js';
import { Field, Notice, Chip, Spinner, ConfirmDialog, announce, scrollBehavior } from './ui.jsx';

const FREQUENCY_OPTIONS = [...PAY_FREQUENCIES, ...OTHER_PAY_FREQUENCIES];
const PRODUCT_LABELS = { income: 'Income', employment: 'Employment', deposit_switch: 'Deposit switch', pll: 'Paycheck-linked loans' };

// A text box that keeps what is typed and passes the parsed value up as you go, but does not rewrite the
// box while it has focus, so punctuation you are part way through typing is left alone.
function ParsedText({ multiline, value, parse, format, onCommit, ...rest }) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(format(value)); }, [value]);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      {...rest}
      type={multiline ? undefined : 'text'}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(format(value)); }}
      onInput={(e) => { const t = e.currentTarget.value; setText(t); onCommit(parse(t)); }}
    />
  );
}
const parseChoices = (t) => t.split('\n').map(l => l.trim()).filter(Boolean).map((l) => { const [v, ...rest] = l.split(':'); return { value: v.trim(), label: (rest.join(':') || v).trim() }; });
const formatChoices = (list) => (list || []).map(o => `${o.value}: ${o.label}`).join('\n');
const parseAnswers = (t) => t.split(',').map(x => x.trim()).filter(Boolean);
const formatAnswers = (list) => (list || []).join(', ');

// What is still missing on a form nobody has touched yet, in a few words.
function missingText(errors) {
  const need = [];
  if (errors.some(i => i.path === 'label')) need.push('a name');
  if (errors.some(i => i.path === 'username')) need.push('a username');
  const others = errors.filter(i => i.path !== 'label' && i.path !== 'username').length;
  if (need.length && !others) return `Add ${need.join(' and ')}`;
  return errors.length === 1 ? '1 thing left to fill in' : `${errors.length} things left to fill in`;
}

export function Builder({
  draft, setDraft, editing, dirty, issues, serverError, documents, scenarios, today, prefix, onPrefix,
  onSave, saving, onDiscard, onMoveDates, onCheck, onRefreshVersion, pristine, focusHeading,
}) {
  const [view, setView] = useState(() => (typeProblems(draft).length ? 'json' : 'form'));
  const [jsonBad, setJsonBad] = useState(false);           // the JSON box holds text that does not parse
  const [pendingPreset, setPendingPreset] = useState(null);
  // The jobs as the last preset (or the opened scenario) left them. If they differ, a preset would lose changes.
  const basePayload = useRef(pristine ?? JSON.stringify(draft.payload ?? null));
  const payloadTouched = JSON.stringify(draft.payload ?? null) !== basePayload.current;
  const headingRef = useRef(null);
  const [delayText, setDelayText] = useState(() => String(draft.behavior_duration_seconds ?? 0));
  const delayNumber = delayText.trim() === '' ? 0 : Number(delayText);
  const delayBad = !Number.isFinite(delayNumber);       // typed something that is not a number; the draft keeps the last good one
  useEffect(() => { if (!delayBad && delayNumber !== (draft.behavior_duration_seconds || 0)) setDelayText(String(draft.behavior_duration_seconds ?? 0)); }, [draft.behavior_duration_seconds]);
  const wasSaving = useRef(false);
  const broken = useMemo(() => typeProblems(draft), [draft]);
  const payroll = (draft.data_source || 'payroll') === 'payroll';
  // A draft the form cannot read is shown as JSON from the first paint, not after it has already crashed.
  const shownView = broken.length > 0 || !payroll ? 'json' : view;
  const failing = FAILURE_STATUSES.has(draft.behavior_status);
  const errors = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');
  // A blank new form should not open covered in red: name and login complaints wait until the
  // field has been left, or a save was tried.
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState({});
  const touch = (path) => setTouched(t => (t[path] ? t : { ...t, [path]: true }));
  const quiet = (path) => !editing && !attempted && !touched[path] && (path === 'label' || path === 'username') && !draft[path];
  const shownErrors = errors.filter(i => !quiet(i.path));
  useEffect(() => { if (!dirty) { setAttempted(false); setTouched({}); } }, [dirty, editing?.id]);
  const submit = (mode) => { if (jsonBad || delayBad) return; setAttempted(true); onSave(mode); };

  useEffect(() => { if (!payroll) setView('json'); }, [payroll, editing?.id]);
  useEffect(() => { if (broken.length) setView('json'); }, [broken.length]);
  // Opened from a button elsewhere (Edit, New scenario, Duplicate): start at the heading rather than on nothing.
  useEffect(() => { if (focusHeading) headingRef.current?.focus(); }, []);
  useEffect(() => { if (shownView !== 'json') setJsonBad(false); }, [shownView]);
  // The save button is disabled while saving, which drops focus; put it back on the heading when it ends.
  useEffect(() => { if (wasSaving.current && !saving) headingRef.current?.focus(); wasSaving.current = saving; }, [saving]);

  const set = (path, value) => setDraft(d => setIn(d, path, value));
  const err = (path) => (quiet(path) ? undefined : issues.find(i => i.level === 'error' && i.path === path)?.message);
  const warn = (path) => issues.find(i => i.level === 'warn' && i.path === path)?.message;
  const text = (path, extra = {}) => ({ value: getIn(draft, path, '') ?? '', onInput: (e) => set(path, e.currentTarget.value), ...extra });

  const taken = useMemo(() => scenarios.filter(s => s.id !== editing?.id).map(s => s.username), [scenarios, editing?.id]);

  function suggest() {
    set('username', suggestUsername(draft.label, prefix, taken));
  }
  function nameBlur() {
    touch('label');
    if (!draft.username && String(draft.label ?? '').trim()) suggest();
  }
  function applyPreset(p) {
    const payload = p.build(today).payload;
    basePayload.current = JSON.stringify(payload);
    announce(`${p.name} applied. The jobs below were replaced.`);
    setDraft(d => ({ ...d, payload }));
    setPendingPreset(null);
  }
  function applyFailure(f) {
    setDraft(d => ({ ...d, behavior_status: f.status, behavior_error_message: f.message }));
  }
  function setStatus(value) {
    setDraft(d => {
      const next = { ...d, behavior_status: value };
      const match = FAILURES.find(f => f.status === value);
      const was = FAILURES.find(f => f.status === d.behavior_status)?.message;
      const untouched = !d.behavior_error_message || d.behavior_error_message === was;
      if (value === 'done') next.behavior_error_message = '';
      else if (untouched) next.behavior_error_message = match ? match.message : '';
      return next;
    });
  }

  const employments = draft.payload?.employments || [];
  const title = editing ? `Editing ${editing.label}` : 'New scenario';

  return (
    <form
      class="sbx-builder"
      onSubmit={(e) => { e.preventDefault(); submit('save'); }}
      // Enter in a box must not save the whole scenario by accident.
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }}
      // The save bar sits over the bottom of the screen, so a field tabbed into there is scrolled clear of it.
      onFocusIn={(e) => {
        const bar = e.currentTarget.querySelector('.sbx-savebar');
        const el = e.target;
        if (!bar || !el.getBoundingClientRect || bar.contains(el)) return;
        if (el.getBoundingClientRect().bottom > bar.getBoundingClientRect().top - 8) el.scrollIntoView({ block: 'center' });
      }}
      noValidate
    >
      <header class="sbx-builder-head">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>{title}{dirty && <span class="sbx-dirty" title="Changes not saved yet"> unsaved</span>}</h2>
          {editing && <p class="sbx-small">Saved on this account. Changes replace it for everyone using the sandbox key.</p>}
        </div>
        <div class="sbx-seg" role="group" aria-label="Edit as">
          <button type="button" aria-pressed={shownView === 'form'} onClick={() => setView('form')} disabled={!payroll || broken.length > 0 || jsonBad} title={broken.length || jsonBad ? 'Fix the JSON first' : undefined}>Form</button>
          <button type="button" aria-pressed={shownView === 'json'} onClick={() => setView('json')}>JSON</button>
        </div>
      </header>

      {serverError && (
        <Notice tone="bad" title={serverError.title}>
          {[serverError.fields?.some(f => f.message === serverError.detail) ? '' : serverError.detail, serverError.hint].filter(Boolean).join(' ')}
          {serverError.fields?.length > 0 && (
            <ul class="sbx-fieldlist">
              {serverError.fields.map((f, i) => <li key={i}>{friendlyField(f.field) ? <strong>{friendlyField(f.field)}: </strong> : null}{f.message}</li>)}
            </ul>
          )}
        </Notice>
      )}

      {!payroll && (
        <Notice tone="info" title={`This is a ${DATA_SOURCE_LABELS[draft.data_source] || draft.data_source} scenario`}>
          The form covers payroll scenarios. Edit this one as JSON. The data source cannot be changed after a scenario is made.
        </Notice>
      )}

      {shownView === 'json' ? (
        <JsonView draft={draft} setDraft={setDraft} onInvalid={setJsonBad} problems={broken} />
      ) : (
        <>
          {!editing && (
            <section class="sbx-card sbx-presets" aria-label="Start from an example">
              <h3>Start from an example</h3>
              <div class="sbx-presetrow">
                {PRESETS.map(p => (
                  <button type="button" key={p.id} class="sbx-preset" onClick={() => (payloadTouched ? setPendingPreset(p) : applyPreset(p))}>
                    <strong>{p.name}</strong><span>{p.blurb}</span>
                  </button>
                ))}
              </div>
              <p class="sbx-small">An example fills in the data below. Your name, login and behavior stay as they are.</p>
            </section>
          )}

          {payroll && (
            <nav class="sbx-jump" aria-label="Jump to a section">
              {[['who', 'Who signs in'], ['what', 'What happens'], ['data', 'The data it returns'], ['when', 'When it applies']].map(([id, label]) => (
                <button type="button" key={id} class="sbx-pill" onClick={() => {
                  const el = document.getElementById(`sbx-sec-${id}`);
                  if (el?.tagName === 'DETAILS') el.open = true;
                  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                  el?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
                  // A heading (or a details summary) takes focus for the moment, without becoming a Tab stop.
                  const target = el?.tagName === 'DETAILS' ? el.querySelector('summary') : el?.querySelector('h3');
                  if (target) {
                    if (!target.hasAttribute('tabindex') && target.tagName !== 'SUMMARY') { target.setAttribute('tabindex', '-1'); target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true }); }
                    target.focus({ preventScroll: true });
                  }
                }}>{label}</button>
              ))}
            </nav>
          )}

          <section class="sbx-card" id="sbx-sec-who">
            <h3>Who signs in</h3>
            <div class="sbx-grid">
              <Field label="Name" error={err('label')} hint="How you find it in the list." wide>
                {(p) => <input {...p} type="text" {...text('label', { onBlur: nameBlur })} maxLength={LIMITS.label} placeholder="Salaried, paid every two weeks" />}
              </Field>
              <Field label="Username" error={err('username')} warn={warn('username')} hint="What someone types in Bridge, matched exactly. Suggest a username builds one from the name.">
                {(p) => (
                  <div class="sbx-inputrow">
                    <input {...p} type="text" {...text('username', { onBlur: () => touch('username') })} autocomplete="off" spellcheck={false} placeholder="qa.salaried" />
                    <label class="sbx-prefixbox" title="Suggestions start with this, so yours do not collide with Truv's logins">
                      <span>Username prefix</span>
                      <input class="sbx-prefix" type="text" value={prefix} onInput={(e) => onPrefix(e.currentTarget.value)} maxLength={16} spellcheck={false} />
                    </label>
                    <button type="button" class="sbx-btn ghost small" onClick={suggest} disabled={!String(draft.label ?? '').trim()}>Suggest a username</button>
                  </div>
                )}
              </Field>
              <Field label="Password" optional error={err('password')} hint="Leave empty to match on the username alone.">
                {(p) => <input {...p} type="text" {...text('password')} autocomplete="off" spellcheck={false} placeholder="s4ndb0x" />}
              </Field>
              <Field label="Notes" optional wide error={err('description')}>
                {(p) => <textarea {...p} rows={2} {...text('description')} maxLength={LIMITS.description} placeholder="What this case is for" />}
              </Field>
            </div>
          </section>

          <section class="sbx-card" id="sbx-sec-what">
            <h3>What happens</h3>
            <fieldset class="sbx-statuses">
              <legend>How the sign-in ends</legend>
              <div class="sbx-radiogrid">
                {STATUSES.map(s => (
                  <label key={s.value} class={`sbx-radio${draft.behavior_status === s.value || (!draft.behavior_status && s.value === 'done') ? ' is-on' : ''}`}>
                    <input type="radio" name="sbx-status" value={s.value} checked={(draft.behavior_status || 'done') === s.value} onChange={() => setStatus(s.value)} />
                    <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {err('behavior_status') && <p class="sbx-error">{err('behavior_status')}</p>}

            {failing && (
              <Field label="Message" optional error={err('behavior_error_message')} hint="Shown as the task's error message.">
                {(p) => <textarea {...p} rows={2} {...text('behavior_error_message')} maxLength={LIMITS.message} />}
              </Field>
            )}

            <div class="sbx-grid">
              <Field label="Wait before it finishes" error={delayBad ? 'Use a whole number of seconds, like 5.' : err('behavior_duration_seconds')} hint={`Seconds, 0 to ${LIMITS.delay}. Use it to test loading states.`}>
                {(p) => (
                  <div class="sbx-inputrow">
                    <input {...p} type="text" inputmode="numeric" value={delayText}
                      onInput={(e) => { const v = e.currentTarget.value; setDelayText(v); const n = v.trim() === '' ? 0 : Number(v); if (Number.isFinite(n)) set('behavior_duration_seconds', n); }} aria-invalid={delayBad ? 'true' : undefined} />
                    {[0, 5, 30, 120].map(n => <button type="button" key={n} class="sbx-pill small" aria-pressed={(draft.behavior_duration_seconds || 0) === n} onClick={() => { setDelayText(String(n)); set('behavior_duration_seconds', n); }}>{n === 0 ? 'None' : `${n}s`}</button>)}
                  </div>
                )}
              </Field>
            </div>

            <MfaEditor draft={draft} set={set} err={err} warn={warn} />
          </section>

          {payroll && (
            <section class="sbx-card" id="sbx-sec-data">
              <header class="sbx-card-head">
                <h3>The data it returns</h3>
                <div class="sbx-card-tools">
                  {employments.some(e => (e.paystubs || []).length) && <button type="button" class="sbx-btn ghost small" onClick={onMoveDates}>Update paystub dates</button>}
                  <button type="button" class="sbx-btn ghost small" onClick={() => set('payload.employments', [...employments, blankEmployment({ paystubs: [] })])} disabled={employments.length >= LIMITS.employments}>Add a job</button>
                </div>
              </header>
              {failing && employments.length === 0 ? (
                <p class="sbx-small">This login fails, so it returns no data. Change how the sign-in ends above if you want it to return some.</p>
              ) : employments.length === 0 ? (
                <p class="sbx-small">No jobs yet. Pick an example above, or add a job.</p>
              ) : employments.map((e, i) => (
                <Employment key={`${i}-${employments.length}`} index={i} e={e} set={set} err={err} warn={warn} issues={issues} documents={documents} today={today}
                  onRemove={() => setDraft(d => removeAt(d, 'payload.employments', i))} canRemove={employments.length > 1 || failing} />
              ))}
              {err('payload.employments') && <p class="sbx-error">{err('payload.employments')}</p>}
            </section>
          )}

          <details class="sbx-card sbx-advanced" id="sbx-sec-when" open={!!(draft.provider_id || draft.company_domain || draft.is_refresh !== null && draft.is_refresh !== undefined || (draft.products || []).length || draft.enabled === false)}>
            <summary><h3>When it applies</h3><span class="sbx-small">Narrow it to one provider, one employer, or refreshes only</span></summary>
            <div class="sbx-grid">
              <Field label="Only for this provider" optional hint="A provider id such as adp. Leave empty for any.">
                {(p) => <input {...p} type="text" {...text('provider_id')} spellcheck={false} maxLength="64" />}
              </Field>
              <Field label="Only for this employer" optional hint="A company website such as acme.com.">
                {(p) => <input {...p} type="text" {...text('company_domain')} spellcheck={false} maxLength="128" />}
              </Field>
              <Field label="Which sign-ins" warn={warn('is_refresh')} hint="Make a refresh version to show data that changed, like a raise.">
                {(p) => (
                  <select {...p} value={draft.is_refresh === true ? 'refresh' : draft.is_refresh === false ? 'first' : 'both'}
                    onChange={(e) => set('is_refresh', e.currentTarget.value === 'refresh' ? true : e.currentTarget.value === 'first' ? false : null)}>
                    <option value="both">First sign-ins and refreshes</option>
                    <option value="first">First sign-ins only</option>
                    <option value="refresh">Refreshes only</option>
                  </select>
                )}
              </Field>
            </div>
            <fieldset class="sbx-products">
              <legend>Products <span class="sbx-small">none checked means every product</span></legend>
              {PAYROLL_PRODUCTS.map(pr => (
                <label key={pr} class="sbx-checkline">
                  <input type="checkbox" checked={(draft.products || []).includes(pr)}
                    onChange={(e) => set('products', e.currentTarget.checked ? [...(draft.products || []), pr] : (draft.products || []).filter(x => x !== pr))} />
                  {PRODUCT_LABELS[pr] || pr}
                </label>
              ))}
            </fieldset>
            <label class="sbx-checkline"><input type="checkbox" checked={draft.enabled !== false} onChange={(e) => set('enabled', e.currentTarget.checked)} /> On. A scenario that is off is ignored when a login is resolved.</label>
          </details>
        </>
      )}

      {(shownErrors.length > 0 || warns.length > 0) && (
        <section class="sbx-issues" aria-label="Things to check">
          {shownErrors.length > 0 && (
            <div role="alert">
              <strong>{shownErrors.length === 1 ? '1 thing to fix' : `${shownErrors.length} things to fix`}</strong>
              <ul>{shownErrors.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
            </div>
          )}
          {warns.length > 0 && (
            <div>
              <strong>Worth a look</strong>
              <ul>{warns.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <footer class="sbx-savebar">
        <div class="sbx-savebar-info">
          {jsonBad
            ? <span class="sbx-bad">The JSON is not valid yet</span>
            : delayBad ? <span class="sbx-bad">The wait is not a number</span>
            : shownErrors.length > 0
            ? <button type="button" class="sbx-linkbtn sbx-bad" onClick={() => document.querySelector('.sbx-issues')?.scrollIntoView({ block: 'center', behavior: scrollBehavior() })}>{shownErrors.length === 1 ? '1 thing to fix' : `${shownErrors.length} things to fix`}</button>
            : errors.length > 0 ? <span class="sbx-small">{missingText(errors)}</span>
            : editing && !dirty ? <span class="sbx-small">All changes saved</span> : <span class="sbx-good">Ready to save</span>}
          {editing && payroll && <button type="button" class="sbx-linkbtn" onClick={() => onCheck(editing)}>Check which scenario a login uses</button>}
          {editing && payroll && draft.is_refresh !== true && <button type="button" class="sbx-linkbtn" onClick={() => onRefreshVersion(editing)}>Make a refresh version</button>}
        </div>
        <div class="sbx-savebar-actions">
          <button type="button" class="sbx-btn ghost" onClick={onDiscard} disabled={saving}>{editing ? 'Close' : 'Start over'}</button>
          {payroll && <button type="button" class="sbx-btn ghost" onClick={() => submit('try')} disabled={saving || jsonBad || delayBad}>Save and try</button>}
          <button type="submit" class="sbx-btn primary" disabled={saving || jsonBad || delayBad || (!!editing && !dirty)}>{saving ? <><Spinner /> Saving...</> : editing ? 'Save changes' : 'Create scenario'}</button>
        </div>
      </footer>

      <ConfirmDialog
        open={!!pendingPreset}
        focusCancel
        title="Replace the data you changed?"
        confirmLabel="Replace"
        onCancel={() => setPendingPreset(null)}
        onConfirm={() => applyPreset(pendingPreset)}
      >
        <p>{pendingPreset?.name} replaces the jobs and paystubs below. Your name, login and behavior stay as they are.</p>
      </ConfirmDialog>
    </form>
  );
}

// --- MFA ---

function MfaEditor({ draft, set, err, warn }) {
  const challenges = draft.behavior_mfa?.challenges || [];
  const on = challenges.length > 0;
  const setChallenges = (list) => set('behavior_mfa', list.length ? { challenges: list } : {});
  const update = (i, patch) => setChallenges(challenges.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <fieldset class="sbx-mfa">
      <legend>Verification screens</legend>
      <label class="sbx-checkline">
        <input type="checkbox" checked={on} onChange={(e) => setChallenges(e.currentTarget.checked ? MFA_PRESETS[0].challenges : [])} />
        Ask for a verification code before returning data
      </label>
      {err('behavior_mfa') && <p class="sbx-error">{err('behavior_mfa')}</p>}
      {warn('behavior_mfa') && <p class="sbx-warn">{warn('behavior_mfa')}</p>}
      {on && (
        <>
          <div class="sbx-filters" role="group" aria-label="Start from">
            {MFA_PRESETS.map(p => <button type="button" key={p.id} class="sbx-pill" onClick={() => setChallenges(p.challenges)}>{p.label}</button>)}
          </div>
          <p class="sbx-small">A code is only asked for in Bridge. Running a login here cannot answer it, so use Open in Bridge to try these.</p>
          {challenges.map((c, i) => (
            <div class="sbx-mfa-screen" key={i}>
              <div class="sbx-grid">
                <Field label={`Screen ${i + 1} type`}>
                  {(p) => (
                    <select {...p} value={c.type} onChange={(e) => update(i, e.currentTarget.value === 'OPTIONS'
                      ? { type: 'OPTIONS', options: c.options?.length ? c.options : [{ value: 'sms', label: 'Text message' }, { value: 'email', label: 'Email' }], answers: c.answers || [] }
                      : { type: 'TEXT', options: undefined, answers: undefined })}>
                      <option value="TEXT">A code to type</option>
                      <option value="OPTIONS">A choice to pick</option>
                    </select>
                  )}
                </Field>
                <Field label="What it asks" error={err(`behavior_mfa.challenges[${i}].label`)}>
                  {(p) => <input {...p} type="text" value={c.label || ''} onInput={(e) => update(i, { label: e.currentTarget.value })} />}
                </Field>
                {c.type === 'OPTIONS' ? (
                  <>
                    <Field label="Choices" hint="One per line, as value: label" error={err(`behavior_mfa.challenges[${i}].options`)}>
                      {(p) => <ParsedText {...p} multiline rows={3} value={c.options} parse={parseChoices} format={formatChoices} onCommit={(options) => update(i, { options })} />}
                    </Field>
                    <Field label="Accepted answers" optional hint="Values, separated by commas. Empty accepts any.">
                      {(p) => <ParsedText {...p} value={c.answers} parse={parseAnswers} format={formatAnswers} onCommit={(answers) => update(i, { answers })} />}
                    </Field>
                  </>
                ) : (
                  <Field label="Accepted code" optional hint="Empty accepts anything typed.">
                    {(p) => <input {...p} type="text" value={c.answer || ''} onInput={(e) => update(i, { answer: e.currentTarget.value })} />}
                  </Field>
                )}
              </div>
              <button type="button" class="sbx-linkbtn" onClick={() => setChallenges(challenges.filter((_, k) => k !== i))}>Remove screen {i + 1}</button>
            </div>
          ))}
          {challenges.length < LIMITS.mfa && (
            <button type="button" class="sbx-btn ghost small" onClick={() => setChallenges([...challenges, { type: 'TEXT', label: 'Enter the code we sent you', answer: '12345' }])}>Add a screen</button>
          )}
        </>
      )}
    </fieldset>
  );
}

// --- One job ---

function Employment({ index, e, set, err, warn, issues, documents, today, onRemove, canRemove }) {
  const base = `payload.employments[${index}]`;
  const f = (k) => `${base}.${k}`;
  const text = (k, extra = {}) => ({ value: getIn(e, k, '') ?? '', onInput: (ev) => set(f(k), ev.currentTarget.value), ...extra });
  const issueCount = issues.filter(i => i.level === 'error' && isUnder(i.path, base)).length;
  const stubs = e.paystubs || [];
  return (
    <details class="sbx-job" role="group" aria-label={`Job ${index + 1}: ${getIn(e, 'company.name', '') || 'no employer yet'}`} open={index === 0 || issueCount > 0}>
      <summary>
        <span><strong>{getIn(e, 'company.name', '') || 'Employer'}</strong> <span class="sbx-small">{e.job_title || ''}</span></span>
        {issueCount > 0 && <Chip tone="bad">{issueCount} to fix</Chip>}
        <span class="sbx-small">{stubs.length} paystub{stubs.length === 1 ? '' : 's'}</span>
      </summary>
      <div class="sbx-grid">
        <Field label="Employer" hint="Truv drops endings like Inc. or LLC: Acme Inc. comes back as Acme." error={err(f('company.name'))}>
          {(p) => <input {...p} type="text" {...text('company.name')} />}
        </Field>
        <Field label="Employer website" optional>
          {(p) => <input {...p} type="text" {...text('company.domain')} spellcheck={false} placeholder="acme.com" />}
        </Field>
        <Field label="Job title" optional>
          {(p) => <input {...p} type="text" {...text('job_title')} />}
        </Field>
        <Field label="Job type" error={err(f('job_type'))}>
          {(p) => (
            <select {...p} value={e.job_type || ''} onChange={(ev) => set(f('job_type'), ev.currentTarget.value)}>
              <option value="">Not given</option>
              {JOB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </Field>
        <Field label="Started" optional error={err(f('start_date'))}>
          {(p) => <input {...p} type="date" {...text('start_date')} />}
        </Field>
        <Field label="Ended" optional error={err(f('end_date'))} warn={warn(f('end_date'))}>
          {(p) => <input {...p} type="date" {...text('end_date')} />}
        </Field>
        <Field label="Pay amount" error={err(f('income'))} hint="The amount, in the unit chosen.">
          {(p) => (
            <div class="sbx-inputrow">
              <input {...p} type="text" inputmode="decimal" {...text('income')} placeholder="124800.00" />
              <select aria-label="Pay unit" value={e.income_unit || ''} onChange={(ev) => set(f('income_unit'), ev.currentTarget.value)}>
                {INCOME_UNITS.map(u => <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          )}
        </Field>
        <Field label="Pay frequency" error={err(f('pay_frequency'))} warn={warn(f('pay_frequency'))}>
          {(p) => (
            <select {...p} value={e.pay_frequency || ''} onChange={(ev) => set(f('pay_frequency'), ev.currentTarget.value)}>
              <option value="">Not given</option>
              {FREQUENCY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </Field>
        <Field label="Name on the record" optional>
          {(p) => <input {...p} type="text" {...text('profile.full_name')} />}
        </Field>
        <Field label="SSN" optional error={err(f('profile.ssn'))} hint="Made up. First three digits 900 to 999.">
          {(p) => <input {...p} type="text" {...text('profile.ssn')} spellcheck={false} placeholder="991-91-9991" />}
        </Field>
        <label class="sbx-checkline sbx-wide"><input type="checkbox" checked={e.is_active !== false} onChange={(ev) => { set(f('is_active'), ev.currentTarget.checked); if (ev.currentTarget.checked) set(f('end_date'), ''); }} /> Still employed</label>
      </div>

      <Paystubs e={e} base={base} set={set} err={err} today={today} />
      <BankAccounts e={e} base={base} set={set} err={err} />
      <W2s e={e} base={base} set={set} err={err} documents={documents} />

      {canRemove && <button type="button" class="sbx-linkbtn sbx-danger-link" onClick={onRemove}>Remove this job</button>}
    </details>
  );
}

function Paystubs({ e, base, set, err, today }) {
  const stubs = e.paystubs || [];
  const [open, setOpen] = useState(false);
  const supported = ['W', 'BW', 'SM', 'M'].includes(e.pay_frequency);
  const defaults = useMemo(() => defaultStubAmounts(e), [e.income, e.income_unit, e.pay_frequency]);
  const [form, setForm] = useState({ count: 4, last: '', gross: '', net: '', hours: '' });
  const [problem, setProblem] = useState('');

  function openGenerator() {
    setForm({
      count: Math.min(Math.max(stubs.length, 4), 26),
      last: supported ? snapPayDate(e.pay_frequency, today, today) : today,
      gross: defaults.gross, net: defaults.net, hours: e.income_unit === 'HOURLY' ? defaults.hours : '',
    });
    setProblem('');
    setOpen(true);
  }
  function generate() {
    const count = Number(form.count);
    if (!supported) return setProblem('Pick weekly, every two weeks, twice a month or monthly under Pay frequency first.');
    if (!Number.isInteger(count) || count < 1 || count > LIMITS.paystubs) return setProblem(`Make between 1 and ${LIMITS.paystubs} paystubs.`);
    if (!parseISO(form.last)) return setProblem('Pick the date of the newest paystub.');
    if (!/^\d+(\.\d{1,2})?$/.test(form.gross) || !/^\d+(\.\d{1,2})?$/.test(form.net)) return setProblem('Enter gross and take-home as amounts with up to two decimals, like 4800.00.');
    if (form.hours && !/^\d+(\.\d{1,2})?$/.test(form.hours)) return setProblem('Enter hours as a number with up to two decimals, like 80.');
    if (parseFloat(form.gross) < 0.01 || parseFloat(form.net) < 0.01) return setProblem('Gross and take-home have to be at least 0.01.');
    if (parseFloat(form.gross) > 99999999 || parseFloat(form.net) > 99999999) return setProblem('Keep each amount under 100 million.');
    if (form.hours && parseFloat(form.hours) < 0.01) return setProblem('Hours have to be at least 0.01, or left empty.');
    set(`${base}.paystubs`, buildPaystubs({ frequency: e.pay_frequency, count, last: form.last, gross: form.gross, net: form.net, hours: form.hours || undefined, currency: e.income_currency || 'USD' }));
    setOpen(false);
  }
  const f = (k) => ({ value: form[k], onInput: (ev) => setForm(x => ({ ...x, [k]: ev.currentTarget.value })) });

  return (
    <div class="sbx-part">
      <div class="sbx-sub-head">
        <h4>Paystubs <span class="sbx-small">{stubs.length ? `${stubs.length}, newest ${stubs.map(s => s.pay_date).filter(Boolean).sort().at(-1) || 'not dated'}` : 'none'}</span></h4>
        <span class="sbx-part-actions">
          <button type="button" class="sbx-btn ghost small" onClick={open ? () => setOpen(false) : openGenerator}>{open ? 'Cancel' : stubs.length ? 'Make new ones' : 'Make paystubs'}</button>
          {stubs.length > 0 && <button type="button" class="sbx-linkbtn" onClick={() => set(`${base}.paystubs`, [])}>Remove all</button>}
        </span>
      </div>
      {open && (
        <div class="sbx-generator" onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); generate(); } }}>
          <div class="sbx-grid">
            <Field label="How many">{(p) => <input {...p} type="number" min="1" max={LIMITS.paystubs} {...f('count')} />}</Field>
            <Field label="Newest pay date">{(p) => <input {...p} type="date" {...f('last')} />}</Field>
            <Field label="Gross each">{(p) => <input {...p} type="text" inputmode="decimal" {...f('gross')} />}</Field>
            <Field label="Take-home each" hint="Starts at about 70% of gross. Change it.">{(p) => <input {...p} type="text" inputmode="decimal" {...f('net')} />}</Field>
            {e.income_unit === 'HOURLY' && <Field label="Hours each" optional>{(p) => <input {...p} type="text" inputmode="decimal" {...f('hours')} />}</Field>}
          </div>
          <p class="sbx-small">Dates step back from the newest on the pay schedule. Year-to-date totals add up. This replaces the paystubs below.</p>
          {problem && <p class="sbx-error" role="alert">{problem}</p>}
          <button type="button" class="sbx-btn primary small" onClick={generate}>Replace paystubs</button>
        </div>
      )}
      {stubs.length > 0 && (
        <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="Paystubs">
          <table class="sbx-table">
            <thead><tr><th>Pay date</th><th>Period</th><th class="r">Gross</th><th class="r">Take-home</th>{stubs.some(x => x.hours) && <th class="r">Hours</th>}<th class="r">Gross year to date</th><th><span class="sbx-sr">Remove</span></th></tr></thead>
            <tbody>
              {stubs.map((st, i) => {
                const at = `${base}.paystubs[${i}]`;
                const cell = (k, label) => (
                  <input class="sbx-cell-in" type="text" inputmode="decimal" aria-label={`Paystub ${i + 1} ${label}`} aria-invalid={err(`${at}.${k}`) ? 'true' : undefined} value={st[k] ?? ''} onInput={(ev) => set(`${at}.${k}`, ev.currentTarget.value)} />
                );
                return (
                  <tr key={i} class={err(`${at}.pay_date`) ? 'has-error' : ''}>
                    <td><input class="sbx-cell-in sbx-cell-date" type="date" aria-label={`Paystub ${i + 1} pay date`} aria-invalid={err(`${at}.pay_date`) ? 'true' : undefined} value={st.pay_date || ''} onInput={(ev) => set(`${at}.pay_date`, ev.currentTarget.value)} /></td>
                    <td class="sbx-small">{st.period_start && st.period_end ? `${st.period_start} to ${st.period_end}` : ''}</td>
                    <td class="r">{cell('gross_pay', 'gross')}</td>
                    <td class="r">{cell('net_pay', 'take-home')}</td>
                    {stubs.some(x => x.hours) && <td class="r">{cell('hours', 'hours')}</td>}
                    <td class="r">{cell('gross_pay_ytd', 'gross year to date')}</td>
                    <td><button type="button" class="sbx-linkbtn" aria-label={`Remove paystub ${i + 1}`} onClick={() => set(`${base}.paystubs`, stubs.filter((_, n) => n !== i))}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {stubs.some((s, i) => err(`${base}.paystubs[${i}].gross_pay`) || err(`${base}.paystubs[${i}].pay_date`)) && <p class="sbx-error">Some paystubs have a problem. Fix the marked dates and amounts in the table, or make new ones.</p>}
    </div>
  );
}

function BankAccounts({ e, base, set, err }) {
  const rows = e.bank_accounts || [];
  const update = (i, k, v) => set(`${base}.bank_accounts`, rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div class="sbx-part">
      <div class="sbx-sub-head">
        <h4>Direct deposit accounts <span class="sbx-small">{rows.length || 'none'}</span></h4>
        <button type="button" class="sbx-btn ghost small" disabled={rows.length >= LIMITS.bankAccounts}
          onClick={() => set(`${base}.bank_accounts`, [...rows, { bank_name: 'Acme CU', account_name: 'Everyday', account_number: String(Math.max(1234567889, ...rows.map(r => Number(r.account_number) || 0)) + 1), routing_number: '111000025', account_type: 'C', deposit_type: 'E' }])}>Add an account</button>
      </div>
      {err(`${base}.bank_accounts`) && <p class="sbx-error">{err(`${base}.bank_accounts`)}</p>}
      {rows.map((r, i) => (
        <div class="sbx-mini" key={i}>
          <div class="sbx-grid sbx-grid-4">
            <Field label="Bank">{(p) => <input {...p} type="text" value={r.bank_name || ''} onInput={(ev) => update(i, 'bank_name', ev.currentTarget.value)} />}</Field>
            <Field label="Account number">{(p) => <input {...p} type="text" value={r.account_number || ''} onInput={(ev) => update(i, 'account_number', ev.currentTarget.value)} />}</Field>
            <Field label="Type">{(p) => <select {...p} value={r.account_type || 'C'} onChange={(ev) => update(i, 'account_type', ev.currentTarget.value)}><option value="C">Checking</option><option value="S">Savings</option></select>}</Field>
            <Field label="Takes">
              {(p) => (
                <div class="sbx-inputrow">
                  <select {...p} value={r.deposit_type || 'E'} onChange={(ev) => update(i, 'deposit_type', ev.currentTarget.value)}><option value="E">Entire paycheck</option><option value="P">A percent</option><option value="A">An amount</option></select>
                  {r.deposit_type && r.deposit_type !== 'E' && <input aria-label={r.deposit_type === 'P' ? 'Percent of the paycheck' : 'Amount'} placeholder={r.deposit_type === 'P' ? 'Percent, like 25' : 'Amount, like 200.00'} aria-invalid={err(`${base}.bank_accounts[${i}].deposit_value`) ? 'true' : undefined} type="text" inputmode="decimal" value={r.deposit_value || ''} onInput={(ev) => update(i, 'deposit_value', ev.currentTarget.value)} />}
                </div>
              )}
            </Field>
          </div>
          {err(`${base}.bank_accounts[${i}].deposit_value`) && <p class="sbx-error">{err(`${base}.bank_accounts[${i}].deposit_value`)}</p>}
          <button type="button" class="sbx-linkbtn" onClick={() => set(`${base}.bank_accounts`, rows.filter((_, n) => n !== i))}>Remove account {i + 1}</button>
        </div>
      ))}
    </div>
  );
}

function W2s({ e, base, set, err, documents }) {
  const rows = e.w2s || [];
  const update = (i, patch) => set(`${base}.w2s`, rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div class="sbx-part">
      <div class="sbx-sub-head">
        <h4>W-2s <span class="sbx-small">{rows.length || 'none'}</span></h4>
        <button type="button" class="sbx-btn ghost small" disabled={rows.length >= LIMITS.w2s || documents.length === 0}
          onClick={() => set(`${base}.w2s`, [...rows, { year: String(new Date().getFullYear() - 1), fields: { wages: '' }, document_id: documents[0]?.id || '' }])}>Add a W-2</button>
      </div>
      {documents.length === 0 && <p class="sbx-small">A W-2 needs a PDF behind it. Upload one in the PDFs tab first.</p>}
      {rows.map((r, i) => (
        <div class="sbx-mini" key={i}>
          <div class="sbx-grid sbx-grid-4">
            <Field label="Year" error={err(`${base}.w2s[${i}].year`)}>{(p) => <input {...p} type="text" maxLength="4" value={r.year || ''} onInput={(ev) => update(i, { year: ev.currentTarget.value })} />}</Field>
            <Field label="Wages" optional>{(p) => <input {...p} type="text" inputmode="decimal" value={r.fields?.wages || ''} onInput={(ev) => update(i, { fields: { ...(r.fields || {}), wages: ev.currentTarget.value } })} />}</Field>
            <Field label="PDF" error={err(`${base}.w2s[${i}].document_id`)} wide>
              {(p) => (
                <select {...p} value={r.document_id || ''} onChange={(ev) => update(i, { document_id: ev.currentTarget.value })}>
                  <option value="">Choose a PDF</option>
                  {documents.map(d => <option key={d.id} value={d.id}>{d.uploaded_file?.filename || d.id}</option>)}
                </select>
              )}
            </Field>
          </div>
          <button type="button" class="sbx-linkbtn" onClick={() => set(`${base}.w2s`, rows.filter((_, n) => n !== i))}>Remove W-2 {i + 1}</button>
        </div>
      ))}
    </div>
  );
}

// --- JSON ---

function JsonView({ draft, setDraft, onInvalid, problems }) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [problem, setProblem] = useState('');
  // Follow changes made elsewhere (a preset, the form) unless the person is mid-edit with invalid JSON.
  useEffect(() => { if (!problem) setText(JSON.stringify(draft, null, 2)); }, [draft]);
  useEffect(() => { onInvalid(!!problem); return () => onInvalid(false); }, [problem]);
  function edit(value) {
    setText(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('A scenario is a JSON object.');
      setProblem('');
      setDraft(parsed);
    } catch (e) {
      setProblem(e.message);
    }
  }
  return (
    <section class="sbx-card">
      <h3>The scenario as JSON</h3>
      <p class="sbx-small">This is the scenario as the API holds it. Changes here show up in the form, and the other way round. Empty fields are left out when it is sent.</p>
      {problems.length > 0 && (
        <Notice tone="bad" title="The form cannot open this yet">
          <ul class="sbx-fieldlist">{problems.slice(0, 6).map(t => <li key={t.path}>{t.message}</li>)}</ul>
        </Notice>
      )}
      <label class="sbx-sr" for="sbx-json">Scenario JSON</label>
      <textarea id="sbx-json" class="sbx-jsonedit" spellcheck={false} value={text} rows={26} onInput={(e) => edit(e.currentTarget.value)} aria-invalid={problem ? 'true' : undefined} aria-describedby={problem ? 'sbx-json-problem' : undefined} />
      {problem && <p class="sbx-error" id="sbx-json-problem" role="alert">Not valid yet: {problem}. Saving is switched off until it parses.</p>}
    </section>
  );
}
