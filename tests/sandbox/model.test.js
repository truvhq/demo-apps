import { describe, it, expect } from 'vitest';
import {
  addMonths, iso, snapPayDate, periodFor, payPeriodsThisYear, payDates, buildPaystubs, refreshDates,
  blankScenario, blankEmployment, PRESETS, matchKey, suggestUsername, slug, validate, toCreateBody, toUpdateBody,
  duplicate, payFrequencyLabel, friendlyField, joinSentences, mfaSteps, typeProblems, standardMfaSteps, statusName, errorText, describeError, expectedStatus, toBundle, parseBundle, planImport, BUNDLE_KIND, summarizeScenario, defaultStubAmounts, toCurl, ago, documentRefs, usedBy, stripLegalSuffix, compareToScenario, latestPayDate, lint, describeError, readRun, needsWidget, expectedStatus, parseISO, todayISO,
} from '../../src/sandbox/model.js';
import { LOGINS, IDENTITIES, FILES, REPORT_IDS, GROUPS } from '../../src/sandbox/standard-logins.js';

describe('dates', () => {
  it('parses only real calendar dates', () => {
    expect(parseISO('2026-02-28')).not.toBeNull();
    expect(parseISO('2026-02-30')).toBeNull();
    expect(parseISO('2026-2-3')).toBeNull();
    expect(parseISO('')).toBeNull();
  });

  it('moves by months and keeps month ends at the end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-15');
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonths('2026-04-30', 1)).toBe('2026-05-31');
  });

  it('todayISO uses the local calendar day', () => {
    expect(todayISO(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26');
  });
});

describe('pay dates', () => {
  it('walks back in fixed steps for weekly and every-two-weeks', () => {
    expect(payDates({ frequency: 'BW', last: '2026-08-28', count: 3 })).toEqual(['2026-07-31', '2026-08-14', '2026-08-28']);
    expect(payDates({ frequency: 'W', last: '2026-10-09', count: 3 })).toEqual(['2026-09-25', '2026-10-02', '2026-10-09']);
  });

  it('twice a month lands on the 15th and the last day, across a year end', () => {
    expect(payDates({ frequency: 'SM', last: '2026-01-15', count: 4 })).toEqual(['2025-11-30', '2025-12-15', '2025-12-31', '2026-01-15']);
  });

  it('monthly lands on the last day, including a leap February', () => {
    expect(payDates({ frequency: 'M', last: '2024-03-31', count: 3 })).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
  });

  it('snaps a date to the nearest earlier pay date', () => {
    expect(snapPayDate('SM', '2026-10-20')).toBe('2026-10-15');
    expect(snapPayDate('SM', '2026-10-10')).toBe('2026-09-30');
    expect(snapPayDate('SM', '2026-10-31')).toBe('2026-10-31');
    expect(snapPayDate('M', '2026-10-26')).toBe('2026-09-30');
    expect(snapPayDate('M', '2026-02-28')).toBe('2026-02-28');
    expect(snapPayDate('BW', '2026-10-26', '2026-10-09')).toBe('2026-10-23');
    expect(snapPayDate('BW', '2026-10-01', '2026-10-09')).toBe('2026-09-25');
  });

  it('gives the pay period each frequency covers', () => {
    expect(periodFor('BW', '2026-08-14')).toEqual({ start: '2026-08-01', end: '2026-08-14' });
    expect(periodFor('W', '2026-10-09')).toEqual({ start: '2026-10-03', end: '2026-10-09' });
    expect(periodFor('SM', '2026-10-15')).toEqual({ start: '2026-10-01', end: '2026-10-15' });
    expect(periodFor('SM', '2026-10-31')).toEqual({ start: '2026-10-16', end: '2026-10-31' });
    expect(periodFor('M', '2026-02-28')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('counts pay dates so far this year', () => {
    expect(payPeriodsThisYear('M', '2026-03-31')).toBe(3);
    expect(payPeriodsThisYear('SM', '2026-03-15')).toBe(5);
    expect(payPeriodsThisYear('SM', '2026-03-31')).toBe(6);
    // Jan 2 is the 1st pay date of 2026 on a 14-day cadence; Jan 16 is the 2nd; Dec 25 is the 26th.
    expect(payPeriodsThisYear('BW', '2026-01-02')).toBe(1);
    expect(payPeriodsThisYear('BW', '2026-01-16')).toBe(2);
    expect(payPeriodsThisYear('BW', '2026-12-25')).toBe(26);
    expect(payPeriodsThisYear('W', '2026-01-08')).toBe(2);
  });
});

describe('buildPaystubs', () => {
  it('builds a salaried stub with year-to-date totals that add up', () => {
    const stubs = buildPaystubs({ frequency: 'M', count: 2, last: '2026-03-31', gross: '5000.00', net: '3800.00' });
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toMatchObject({ pay_date: '2026-02-28', gross_pay: '5000.00', net_pay: '3800.00', gross_pay_ytd: '10000.00', net_pay_ytd: '7600.00', basis_of_pay: 'S' });
    expect(stubs[1]).toMatchObject({ pay_date: '2026-03-31', gross_pay_ytd: '15000.00', net_pay_ytd: '11400.00', period_start: '2026-03-01', period_end: '2026-03-31' });
    expect(stubs[1].earnings_ytd[0].amount).toBe('15000.00');
    expect(stubs[0]).not.toHaveProperty('hours');
  });

  it('builds an hourly stub with hours, a rate and hour totals', () => {
    const [s] = buildPaystubs({ frequency: 'BW', count: 1, last: '2026-01-16', gross: '2400.00', net: '1800.00', hours: '80' });
    expect(s).toMatchObject({ basis_of_pay: 'H', hours: '80.00', gross_pay_ytd: '4800.00' });
    expect(s.earnings[0]).toEqual({ name: 'Regular', amount: '2400.00', rate: '30.00', units: '80.00' });
    expect(s.earnings_ytd[0]).toEqual({ name: 'Regular', amount: '4800.00', rate: '30.00', units: '160.00' });
  });

  it('keeps cents exact where floats drift', () => {
    const [s] = buildPaystubs({ frequency: 'W', count: 1, last: '2026-01-08', gross: '0.10', net: '0.07' });
    expect(s.gross_pay_ytd).toBe('0.20');
    expect(s.net_pay_ytd).toBe('0.14');
  });

  it('refuses a frequency it cannot lay out', () => {
    expect(() => buildPaystubs({ frequency: 'A', count: 1, last: '2026-01-01', gross: '1', net: '1' })).toThrow();
  });
});

describe('refreshDates', () => {
  const emp = (freq, dates) => ({ employments: [{ pay_frequency: freq, paystubs: dates.map(d => ({ pay_date: d, period_start: d, period_end: d, gross_pay: '1.00' })) }] });

  it('moves a every-two-weeks scenario forward in whole pay periods, keeping the gap between stubs', () => {
    const { payload, changed } = refreshDates(emp('BW', ['2026-07-31', '2026-08-14']), '2026-10-26');
    expect(payload.employments[0].paystubs.map(s => s.pay_date)).toEqual(['2026-10-09', '2026-10-23']);
    expect(changed).toBe(1);
  });

  it('leaves a scenario alone that is already current', () => {
    const { payload, changed } = refreshDates(emp('BW', ['2026-10-09', '2026-10-23']), '2026-10-26');
    expect(payload.employments[0].paystubs.map(s => s.pay_date)).toEqual(['2026-10-09', '2026-10-23']);
    expect(changed).toBe(0);
  });

  it('moves a monthly scenario by whole months and keeps month ends', () => {
    const { payload } = refreshDates(emp('M', ['2026-05-31', '2026-06-30']), '2026-10-26');
    expect(payload.employments[0].paystubs.map(s => s.pay_date)).toEqual(['2026-08-31', '2026-09-30']);
  });

  it('moves a twice-a-month scenario in half-month steps so the newest stub is the latest pay date', () => {
    const { payload } = refreshDates(emp('SM', ['2026-04-15', '2026-04-30']), '2026-10-26');
    expect(payload.employments[0].paystubs.map(s => s.pay_date)).toEqual(['2026-09-30', '2026-10-15']);
  });

  it('moves a twice-a-month scenario across a year end', () => {
    const { payload } = refreshDates(emp('SM', ['2025-11-30', '2025-12-15']), '2026-01-20');
    expect(payload.employments[0].paystubs.map(s => s.pay_date)).toEqual(['2025-12-31', '2026-01-15']);
  });

  it('skips a twice-a-month or monthly scenario whose dates are not on the usual days', () => {
    expect(refreshDates(emp('SM', ['2026-04-14']), '2026-10-26').skipped).toBe(1);
    expect(refreshDates(emp('M', ['2026-04-15']), '2026-10-26').skipped).toBe(1);
  });

  it('moves period dates with the pay date', () => {
    const { payload } = refreshDates({ employments: [{ pay_frequency: 'BW', paystubs: [{ pay_date: '2026-08-14', period_start: '2026-08-01', period_end: '2026-08-14' }] }] }, '2026-10-26');
    expect(payload.employments[0].paystubs[0]).toEqual({ pay_date: '2026-10-23', period_start: '2026-10-10', period_end: '2026-10-23' });
  });

  it('skips a pay frequency it cannot move and says so', () => {
    const { payload, skipped, changed } = refreshDates(emp('A', ['2025-01-01']), '2026-10-26');
    expect(payload.employments[0].paystubs[0].pay_date).toBe('2025-01-01');
    expect(skipped).toBe(1);
    expect(changed).toBe(0);
  });

  it('does not change what it was given', () => {
    const input = emp('BW', ['2026-07-31']);
    refreshDates(input, '2026-10-26');
    expect(input.employments[0].paystubs[0].pay_date).toBe('2026-07-31');
  });
});

describe('scenario shape', () => {
  it('opens every preset as a scenario that passes validation once it has a name and login', () => {
    for (const p of PRESETS) {
      const s = { ...p.build('2026-10-23'), label: p.name, username: `qa.${p.id}` };
      const errors = validate(s).filter(x => x.level === 'error');
      expect(errors, p.id).toEqual([]);
    }
  });

  it('the two-job preset has two employers and the hourly one has overtime', () => {
    expect(PRESETS.find(p => p.id === 'two-jobs').build('2026-10-23').payload.employments).toHaveLength(2);
    const hourly = PRESETS.find(p => p.id === 'hourly').build('2026-10-23').payload.employments[0];
    expect(hourly.paystubs.at(-1).earnings.map(e => e.name)).toEqual(['Regular', 'Overtime']);
  });

  it('creates a body without empty optional fields', () => {
    const body = toCreateBody({ ...blankScenario({ label: 'A', username: 'qa.a', payload: { employments: [blankEmployment()] } }), id: 'x', created_at: 't' });
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('provider_id');
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('behavior_mfa');
    expect(body).not.toHaveProperty('products');
    expect(body).not.toHaveProperty('behavior_status');
    expect(body).toMatchObject({ data_source: 'payroll', label: 'A', username: 'qa.a', enabled: true });
  });

  it('keeps a failing status and its message when creating', () => {
    const body = toCreateBody(blankScenario({ label: 'L', username: 'qa.l', behavior_status: 'account_locked', behavior_error_message: 'Locked', payload: {} }));
    expect(body).toMatchObject({ behavior_status: 'account_locked', behavior_error_message: 'Locked' });
  });

  it('sends a cleared field as null on update, so the old value does not stay', () => {
    const body = toUpdateBody({ id: 'x', data_source: 'payroll', label: 'A', provider_id: '', company_domain: null, username: 'qa.a', filenames: [], created_at: 't' });
    expect(body.provider_id).toBeNull();
    expect(body.company_domain).toBeNull();
    for (const k of ['id', 'data_source', 'created_at', 'filenames']) expect(body).not.toHaveProperty(k);
  });

  it('copies a scenario without its id and with the new name', () => {
    const copy = duplicate({ id: 'x', created_at: 't', label: 'A', username: 'qa.a', payload: { employments: [1] } }, { label: 'B', username: 'qa.b' });
    expect(copy).toMatchObject({ label: 'B', username: 'qa.b' });
    expect(copy).not.toHaveProperty('id');
    expect(copy.payload).toEqual({ employments: [1] });
  });

  it('leaves the username empty unless asked, so the copy cannot clash with the original', () => {
    const copy = duplicate({ id: 'x', label: 'A', username: 'qa.a', password: 'pw' }, {});
    expect(copy.username).toBe('');
    expect(copy.label).toBe('A (copy)');
    expect(copy.password).toBe('pw');
  });

  it('matches on the same login, and treats a refresh version as different', () => {
    const a = blankScenario({ username: 'u', password: 'p' });
    expect(matchKey(a)).toBe(matchKey({ ...a, label: 'other', enabled: false, products: ['income'] }));
    expect(matchKey(a)).not.toBe(matchKey({ ...a, is_refresh: true }));
    expect(matchKey(a)).not.toBe(matchKey({ ...a, provider_id: 'adp' }));
    expect(matchKey(a)).not.toBe(matchKey({ ...a, data_source: 'financial_accounts' }));
  });

  it('suggests a username from the name and avoids ones already taken', () => {
    expect(slug('Hourly & overtime!')).toBe('hourly.and.overtime');
    expect(suggestUsername('Hourly with overtime', 'qa')).toBe('qa.hourly.with.overtime');
    expect(suggestUsername('Hourly', 'qa', ['qa.hourly'])).toBe('qa.hourly.2');
    expect(suggestUsername('', '')).toBe('qa.login');
  });
});

describe('validate', () => {
  const ok = () => ({ ...blankScenario({ label: 'Salaried', username: 'qa.salaried', password: 'pw' }), payload: { employments: [blankEmployment()] } });
  const errs = (s, o) => validate(s, o).filter(x => x.level === 'error').map(x => x.path);
  const warns = (s, o) => validate(s, o).filter(x => x.level === 'warn').map(x => x.path);

  it('accepts a good scenario', () => { expect(validate(ok())).toEqual([]); });

  it('needs a name, and something to match on', () => {
    expect(errs({ ...ok(), label: ' ' })).toContain('label');
    expect(errs({ ...ok(), username: '', password: '' })).toContain('username');
    expect(errs({ ...ok(), username: '', password: '', provider_id: 'adp' })).not.toContain('username');
  });

  it('refuses the two logins that belong to Truv, and warns on the other standard ones', () => {
    expect(errs({ ...ok(), username: 'goodlogin' })).toContain('username');
    expect(errs({ ...ok(), username: 'error.user' })).toContain('username');
    expect(errs({ ...ok(), username: 'fulltime' })).not.toContain('username');
    expect(warns({ ...ok(), username: 'fulltime' })).toContain('username');
  });

  it('flags an unfilled template placeholder', () => {
    expect(warns({ ...ok(), username: '{{sandbox_username}}' })).toContain('username');
  });

  it('needs data unless the login fails', () => {
    expect(errs({ ...ok(), payload: { employments: [] } })).toContain('payload.employments');
    expect(errs({ ...ok(), behavior_status: 'account_locked', payload: {} })).not.toContain('payload.employments');
  });

  it('checks the delay, the message and the MFA screens', () => {
    expect(errs({ ...ok(), behavior_duration_seconds: 121 })).toContain('behavior_duration_seconds');
    expect(errs({ ...ok(), behavior_duration_seconds: -1 })).toContain('behavior_duration_seconds');
    expect(errs({ ...ok(), behavior_duration_seconds: 1.5 })).toContain('behavior_duration_seconds');
    expect(errs({ ...ok(), behavior_duration_seconds: 120 })).toEqual([]);
    expect(errs({ ...ok(), behavior_error_message: 'x'.repeat(501) })).toContain('behavior_error_message');
    const six = { challenges: Array.from({ length: 6 }, () => ({ type: 'TEXT', label: 'Code' })) };
    expect(errs({ ...ok(), behavior_mfa: six })).toContain('behavior_mfa');
    expect(errs({ ...ok(), behavior_mfa: { challenges: [{ type: 'OPTIONS', label: 'Pick', options: [] }] } })).toContain('behavior_mfa.challenges[0].options');
    expect(errs({ ...ok(), behavior_mfa: { challenges: [{ type: 'TEXT', label: '' }] } })).toContain('behavior_mfa.challenges[0].label');
  });

  it('checks an employment the way the docs describe', () => {
    const at = (patch) => { const s = ok(); Object.assign(s.payload.employments[0], patch); return s; };
    expect(errs(at({ profile: { ssn: '123-45-6789' } }))).toContain('payload.employments[0].profile.ssn');
    expect(errs(at({ profile: { ssn: '991-91-9991' } }))).toEqual([]);
    expect(errs(at({ start_date: '2026-03-31', end_date: '2026-03-01' }))).toContain('payload.employments[0].end_date');
    expect(errs(at({ start_date: '2026-03-31', end_date: '2026-03-31' }))).toEqual([]);
    expect(errs(at({ start_date: '2026-02-30' }))).toContain('payload.employments[0].start_date');
    expect(errs(at({ income: '12,000' }))).toContain('payload.employments[0].income');
    expect(errs(at({ job_type: 'X' }))).toContain('payload.employments[0].job_type');
    expect(warns(at({ pay_frequency: 'A', income_unit: 'YEARLY' }))).toContain('payload.employments[0].pay_frequency');
    expect(warns(at({ pay_rate: '60.00', income_unit: 'HOURLY' }))).toContain('payload.employments[0].pay_rate');
  });

  it('checks paystubs and W-2s', () => {
    const s = ok();
    s.payload.employments[0].paystubs = [{ gross_pay: '12.5x' }];
    s.payload.employments[0].w2s = [{ year: '25' }];
    const e = errs(s);
    expect(e).toContain('payload.employments[0].paystubs[0].pay_date');
    expect(e).toContain('payload.employments[0].paystubs[0].gross_pay');
    expect(e).toContain('payload.employments[0].w2s[0].document_id');
    expect(e).toContain('payload.employments[0].w2s[0].year');
  });

  it('enforces the count limits', () => {
    const s = ok();
    s.payload.employments = Array.from({ length: 11 }, () => blankEmployment());
    expect(errs(s)).toContain('payload.employments');
    const t = ok();
    t.payload.employments[0].paystubs = Array.from({ length: 61 }, () => ({ pay_date: '2026-01-01' }));
    expect(errs(t)).toContain('payload.employments[0].paystubs');
  });

  it('names the scenario that already answers this login', () => {
    const other = { id: 'a', label: 'Existing', data_source: 'payroll', username: 'qa.salaried', password: 'pw', is_refresh: null };
    const result = validate(ok(), { others: [other] });
    expect(result.find(x => x.level === 'error' && x.path === 'username').message).toContain('Existing');
    // editing that same scenario is not a clash with itself
    expect(validate({ ...ok(), id: 'a' }, { others: [other], self: other }).filter(x => x.level === 'error')).toEqual([]);
    // a refresh version of the same login is allowed
    expect(errs({ ...ok(), is_refresh: true }, { others: [other] })).toEqual([]);
  });

  it('warns when a refresh-only scenario has no original to go with', () => {
    expect(warns({ ...ok(), is_refresh: true }, { others: [] })).toContain('is_refresh');
    const orig = { id: 'a', label: 'Orig', data_source: 'payroll', username: 'qa.salaried', password: 'pw', is_refresh: null };
    expect(warns({ ...ok(), is_refresh: true }, { others: [orig] })).not.toContain('is_refresh');
    // another refresh-only scenario is not the first sign-in it is waiting for
    expect(warns({ ...ok(), is_refresh: true }, { others: [{ ...orig, is_refresh: true }] })).toContain('is_refresh');
  });

  it('stops a new scenario at the account limit', () => {
    const others = Array.from({ length: 100 }, (_, i) => ({ id: String(i), label: `s${i}`, data_source: 'payroll', username: `u${i}` }));
    expect(errs(ok(), { others, requireNew: true })).toContain('label');
    expect(errs(ok(), { others: others.slice(0, 99), requireNew: true })).not.toContain('label');
  });
});

describe('describing scenarios', () => {
  it('summarizes a scenario in a line', () => {
    const s = PRESETS.find(p => p.id === 'salaried').build('2026-10-23');
    expect(summarizeScenario(s)).toBe('Salaried, every two weeks · 2 paystubs');
    expect(summarizeScenario(blankScenario({ behavior_status: 'account_locked', payload: {} }))).toBe('Account locked');
    expect(summarizeScenario(blankScenario({ behavior_mfa: { challenges: [{}, {}] }, behavior_duration_seconds: 30, payload: {} }))).toBe('2 MFA screens · 30s delay');
    expect(summarizeScenario(PRESETS.find(p => p.id === 'two-jobs').build('2026-10-23'))).toContain('2 jobs');
  });

  it('finds the newest paystub date', () => {
    expect(latestPayDate(PRESETS.find(p => p.id === 'salaried').build('2026-10-23'))).toBe('2026-10-23');
    expect(latestPayDate(blankScenario())).toBeNull();
  });

  it('points out what is worth knowing in a list', () => {
    const stale = { ...PRESETS.find(p => p.id === 'salaried').build('2026-06-01'), id: 's' };
    expect(lint(stale, '2026-10-26').map(x => x.id)).toContain('stale');
    expect(lint(stale, '2026-06-10').map(x => x.id)).not.toContain('stale');
    expect(lint({ id: 'p', username: '{{sandbox_username}}', payload: {} }, '2026-10-26').map(x => x.id)).toContain('placeholder');
    expect(lint({ id: 'd', enabled: false, payload: {} }, '2026-10-26').map(x => x.id)).toContain('disabled');
    expect(lint({ id: 'r', data_source: 'payroll', username: 'u', password: 'p', is_refresh: true, payload: {} }, '2026-10-26', []).map(x => x.id)).toContain('refresh-orphan');
  });
});

describe('describeError', () => {
  it('explains a production key and tells you what to do', () => {
    const d = describeError({ status: 403, data: { error: { code: 'env_not_sandbox', message: 'x' } } });
    expect(d.title).toMatch(/production key/i);
    expect(d.hint).toMatch(/sandbox/i);
  });

  it('lists each field the API refused', () => {
    const d = describeError({ status: 400, data: { error: { code: 'incorrect_parameters', message: 'Incorrect request parameters', extra: { 'invalid-params': [{ field: 'behavior_status', message: '"nope" is not a valid choice.' }, { field: 'employments', message: 'profile: ssn: bad' }] } } } });
    expect(d.fields).toEqual([
      { path: 'behavior_status', field: 'behavior_status', message: '"nope" is not a valid choice.' },
      { path: 'payload.employments', field: 'employments', message: 'profile: ssn: bad' },
    ]);
    expect(d.detail).toBe('2 things to fix.');
  });

  it('puts a whole-scenario problem on no field, and keeps its words', () => {
    const d = describeError({ status: 400, data: { error: { code: 'incorrect_parameters', message: 'Incorrect request parameters', extra: { 'invalid-params': [{ field: 'non_field_errors', message: "Scenario 'A' already has the same matching fields." }] } } } });
    expect(d.fields[0]).toMatchObject({ path: '', message: "Scenario 'A' already has the same matching fields." });
    expect(d.detail).toBe('1 thing to fix.');
  });

  it('handles a reserved login, a file in use, a missing item and a server failure', () => {
    expect(describeError({ status: 400, data: { error: { code: 'reserved_credential', message: "Username 'goodlogin' is reserved." } } }).fields[0].path).toBe('username');
    expect(describeError({ status: 409, data: { error: { code: 'resource_in_use', message: '' } } }).hint).toMatch(/take the file off/i);
    expect(describeError({ status: 404, data: { error: { code: 'not_found' } } }).title).toBe('Not found');
    expect(describeError({ status: 502, data: {} }).title).toMatch(/did not answer/i);
    expect(describeError({ status: 401, data: {} }).title).toMatch(/signed out/i);
    expect(describeError(undefined).title).toBeTruthy();
  });
});

describe('reading a run', () => {
  const order = { employers: [{ last_task_status: 'done', employments: [{ company: { name: 'Probe' }, job_title: 'Tester', pay_frequency: 'BW', income: '52000.00', income_unit: 'YEARLY', statements: [{ gross_pay: '2000.00' }] }] }] };

  it('is still working until a task reaches an end state', () => {
    expect(readRun({ tasks: [] }).settled).toBe(false);
    expect(readRun({ tasks: [{ status: 'parse' }] }).settled).toBe(false);
    expect(readRun({ tasks: [{ status: 'mfa' }] }).settled).toBe(false);
  });

  it('reads a finished run and its data', () => {
    const r = readRun({ tasks: [{ status: 'done' }], order });
    expect(r).toMatchObject({ status: 'done', settled: true, ok: true });
    expect(r.employments[0]).toMatchObject({ company: 'Probe', payFrequency: 'BW', statements: 1, income: '52000.00' });
  });

  it('reads a failure with its message', () => {
    const r = readRun({ tasks: [{ status: 'account_locked', error_message: 'Locked' }] });
    expect(r).toMatchObject({ settled: true, ok: false, status: 'account_locked', errorMessage: 'Locked' });
    expect(r.employments).toEqual([]);
  });

  it('knows which logins need the widget, and what each should end as', () => {
    expect(needsWidget({ login: 'goodlogin', password: 'mfa' })).toBe(true);
    expect(needsWidget({ login: 'goodlogin', password: 'mfa_captcha' })).toBe(true);
    expect(needsWidget({ login: 'goodlogin', password: 'goodpassword' })).toBe(false);
    expect(needsWidget({ login: 'x', password: 'y', scenario: { behavior_mfa: { challenges: [{}] } } })).toBe(true);
    expect(expectedStatus({ login: 'error.user', password: 'login_error' })).toBe('login_error');
    expect(expectedStatus({ login: 'goodlogin', password: 'no_data' })).toBe('no_data');
    expect(expectedStatus({ login: 'x', password: 'y', scenario: { behavior_status: 'account_locked' } })).toBe('account_locked');
    expect(expectedStatus({ login: 'pay.raise', password: 'goodpassword' })).toBe('done');
  });
});

describe('the standard logins catalog', () => {
  it('covers each group the docs list', () => {
    const groups = new Set(GROUPS.map(g => g.id));
    for (const l of LOGINS) expect(groups.has(l.group), l.id).toBe(true);
    for (const g of ['universal', 'income', 'assets', 'dds', 'pll', 'mortgage']) expect(LOGINS.some(l => l.group === g), g).toBe(true);
  });

  it('gives every login a name, a password, a status and the products it works for', () => {
    for (const l of LOGINS) {
      expect(l.login, l.id).toBeTruthy();
      expect(l.password, l.id).toBeTruthy();
      expect(l.status, l.id).toBeTruthy();
      expect(l.products.length, l.id).toBeGreaterThan(0);
      expect(l.returns, l.id).toBeTruthy();
    }
  });

  it('has a unique id on every login, no repeated row, and no em dashes', () => {
    const ids = new Set();
    const rows = new Set();
    for (const l of LOGINS) {
      expect(ids.has(l.id), l.id).toBe(false);
      ids.add(l.id);
      const key = `${l.group}|${l.login}|${l.password}|${l.returns}`;
      expect(rows.has(key), key).toBe(false);
      rows.add(key);
      expect(JSON.stringify(l)).not.toContain('\u2014');
    }
  });

  it('has the documented universal logins', () => {
    const u = LOGINS.filter(l => l.group === 'universal').map(l => `${l.login}/${l.password}`);
    for (const x of ['goodlogin/goodpassword', 'goodlogin/mfa', 'goodlogin/mfa_captcha', 'goodlogin/longcheck', 'error.user/login_error', 'error.user/config_error']) expect(u).toContain(x);
    expect(LOGINS.find(l => l.password === 'mfa').note).toMatch(/12345/);
    expect(LOGINS.find(l => l.password === 'mfa_captcha').note).toMatch(/9M4BP/);
  });

  it('has the documented pay-frequency, bank-income and education records', () => {
    expect(LOGINS.find(l => l.login === 'goodlogin.weekly').returns).toMatch(/weekly/i);
    expect(LOGINS.filter(l => l.group === 'assets' && /goodlogin\.(gig|ewa|retirement|rental|unemployment)/.test(l.login))).toHaveLength(5);
    expect(IDENTITIES).toHaveLength(29);
    expect(new Set(IDENTITIES.map(i => i.ssnLast4)).size).toBe(29);
    expect(IDENTITIES.every(i => /^99\d\d$/.test(i.ssnLast4))).toBe(true);
  });

  it('lists the test files and the pre-generated report IDs', () => {
    expect(FILES.find(f => f.filename === 'most.recent.paystub.pdf')).toBeTruthy();
    expect(FILES.filter(f => f.section === 'Fails validation')).toHaveLength(5);
    expect(REPORT_IDS).toHaveLength(20);
    expect(REPORT_IDS.every(r => /^[0-9a-f]{32}$/.test(r.id))).toBe(true);
  });
});

describe('starting amounts for generated paystubs', () => {
  it('works out gross, take-home and hours from the income', () => {
    expect(defaultStubAmounts({ income: '124800.00', income_unit: 'YEARLY', pay_frequency: 'BW' })).toEqual({ gross: '4800.00', net: '3360.00', hours: '' });
    expect(defaultStubAmounts({ income: '5000.00', income_unit: 'MONTHLY', pay_frequency: 'M' })).toEqual({ gross: '5000.00', net: '3500.00', hours: '' });
    expect(defaultStubAmounts({ income: '30.00', income_unit: 'HOURLY', pay_frequency: 'BW' })).toEqual({ gross: '2400.00', net: '1680.00', hours: '80.00' });
    expect(defaultStubAmounts({ income: '20.00', income_unit: 'HOURLY', pay_frequency: 'W' })).toEqual({ gross: '800.00', net: '560.00', hours: '40.00' });
    expect(defaultStubAmounts({ income: '1000.00', income_unit: 'WEEKLY', pay_frequency: 'BW' })).toEqual({ gross: '2000.00', net: '1400.00', hours: '' });
  });

  it('says nothing when it cannot tell', () => {
    expect(defaultStubAmounts({ income: '', income_unit: 'YEARLY', pay_frequency: 'BW' })).toEqual({ gross: '', net: '', hours: '' });
    expect(defaultStubAmounts({ income: '1', income_unit: 'YEARLY', pay_frequency: 'A' })).toEqual({ gross: '', net: '', hours: '' });
    expect(defaultStubAmounts(undefined)).toEqual({ gross: '', net: '', hours: '' });
  });
});

describe('sharing', () => {
  it('writes a curl command with placeholders for the keys and quotes escaped', () => {
    const cmd = toCurl({ label: "Bob's login" });
    expect(cmd).toContain('--url https://prod.truv.com/v1/sandbox/scenarios/');
    expect(cmd).toContain('YOUR_TRUV_SANDBOX_SECRET');
    expect(cmd).toContain("Bob'\\''s login");
  });

  it('says how long ago', () => {
    expect(ago(1000, 1000 + 30_000)).toBe('a moment ago');
    expect(ago(0, 5 * 60_000)).toBe('5 min ago');
    expect(ago(0, 3 * 3600_000)).toBe('3 h ago');
    expect(ago(0, 2 * 86400_000)).toBe('2 d ago');
  });
});

describe('the PDF library', () => {
  const s = (id, stubDoc, w2Doc) => ({ id, label: id, payload: { employments: [{ paystubs: [{ pay_date: '2026-01-01', document_id: stubDoc }], w2s: [{ year: '2025', document_id: w2Doc }] }] } });

  it('finds the files a scenario uses, on paystubs and W-2s', () => {
    expect([...documentRefs(s('a', 'd1', 'd2'))].sort()).toEqual(['d1', 'd2']);
    expect([...documentRefs({ payload: { employments: [{ paystubs: [{ pay_date: 'x' }] }] } })]).toEqual([]);
    expect([...documentRefs({})]).toEqual([]);
  });

  it('says which scenarios use a file', () => {
    const list = [s('a', 'd1', 'd2'), s('b', 'd3', 'd1'), s('c', undefined, undefined)];
    expect(usedBy('d1', list).map(x => x.id)).toEqual(['a', 'b']);
    expect(usedBy('d9', list)).toEqual([]);
    expect(usedBy('d1', undefined)).toEqual([]);
  });
});

describe('comparing what was authored with what came back', () => {
  const scenario = { payload: { employments: [{ company: { name: 'Acme Inc.' }, job_title: 'Engineer', pay_frequency: 'BW', income: '124800.00', income_unit: 'YEARLY', paystubs: [{}, {}] }] } };

  it('treats a dropped legal ending as the same employer', () => {
    expect(stripLegalSuffix('Acme Inc.')).toBe('Acme');
    expect(stripLegalSuffix('Northwind Retail, LLC')).toBe('Northwind Retail');
    expect(stripLegalSuffix('Incorporated Goods')).toBe('Incorporated Goods');
    expect(stripLegalSuffix('Costco Co')).toBe('Costco');
  });

  it('marks each line the same or different', () => {
    const run = { employments: [{ company: 'Acme', title: 'Engineer', payFrequency: 'BW', income: '124800.00', incomeUnit: 'YEARLY', statements: 2 }] };
    const rows = compareToScenario(scenario, run);
    expect(rows.map(r => [r.label, r.same])).toEqual([['Employer', true], ['Job title', true], ['Pay frequency', true], ['Pay amount', true], ['Paystubs', true]]);
    expect(rows.find(r => r.label === 'Pay frequency')).toMatchObject({ authored: 'Every two weeks', returned: 'Every two weeks' });
    const off = compareToScenario(scenario, { employments: [{ company: 'Other', title: 'Engineer', payFrequency: 'W', income: '1.00', incomeUnit: 'HOURLY', statements: 1 }] });
    expect(off.filter(r => !r.same).map(r => r.label)).toEqual(['Employer', 'Pay frequency', 'Pay amount', 'Paystubs']);
  });

  it('has nothing to compare when there is no data on either side', () => {
    expect(compareToScenario(scenario, { employments: [] })).toEqual([]);
    expect(compareToScenario({ payload: {} }, { employments: [{}] })).toEqual([]);
  });
});

describe('pay frequency names', () => {
  it('spells out the codes the API uses and passes unknown ones through', () => {
    expect(payFrequencyLabel('BW')).toBe('Every two weeks');
    expect(payFrequencyLabel('SM')).toBe('Twice a month');
    expect(payFrequencyLabel('C')).toBe('Commission');
    expect(payFrequencyLabel('ZZ')).toBe('ZZ');
    expect(payFrequencyLabel(undefined)).toBe('');
  });
});

describe('what to answer on verification screens', () => {
  it('lists each screen in order, from the scenario as authored', () => {
    const s = { behavior_mfa: { challenges: [{ type: 'TEXT', label: 'Code', answer: '12345' }, { type: 'OPTIONS', label: 'How', options: [{ value: 'sms', label: 'Text message' }, { value: 'email', label: 'Email' }], answers: ['email'] }] } };
    expect(mfaSteps(s)).toEqual(['type 12345', 'choose Email']);
  });
  it('says anything is fine when no answer is set, and is empty for no screens', () => {
    expect(mfaSteps({ behavior_mfa: { challenges: [{ type: 'TEXT', label: 'Code' }] } })).toEqual(['type anything']);
    expect(mfaSteps({ behavior_mfa: {} })).toEqual([]);
    expect(mfaSteps(null)).toEqual([]);
  });
  it('falls back to the first choice when no accepted answers are listed', () => {
    expect(mfaSteps({ behavior_mfa: { challenges: [{ type: 'OPTIONS', options: [{ value: 'sms', label: 'Text message' }] }] } })).toEqual(['choose Text message']);
  });
});

describe('export and import', () => {
  const made = (over = {}) => ({ id: 'x', created_at: 't', data_source: 'payroll', label: 'A', username: 'qa.a', password: 'pw', behavior_status: 'done', payload: { employments: [{ company: { name: 'Acme' }, income: '1000.00', income_unit: 'MONTHLY', pay_frequency: 'M' }] }, ...over });

  it('exports each scenario the way it would be created, without its id', () => {
    const b = toBundle([made(), made({ label: 'B', username: 'qa.b' })]);
    expect(b.kind).toBe(BUNDLE_KIND);
    expect(b.scenarios.map(s => s.label)).toEqual(['A', 'B']);
    expect(b.scenarios[0]).not.toHaveProperty('id');
    expect(b.scenarios[0]).not.toHaveProperty('created_at');
  });

  it('reads back what it wrote', () => {
    const r = parseBundle(JSON.stringify(toBundle([made()])));
    expect(r.ok).toBe(true);
    expect(r.scenarios[0]).toMatchObject({ data_source: 'payroll', label: 'A', username: 'qa.a' });
  });

  it('also takes a plain list or a single scenario, and fills in the data source', () => {
    expect(parseBundle(JSON.stringify([{ label: 'x', username: 'u' }])).scenarios[0].data_source).toBe('payroll');
    expect(parseBundle(JSON.stringify({ label: 'x', username: 'u', payload: {} })).scenarios).toHaveLength(1);
  });

  it('says what is wrong in plain words', () => {
    expect(parseBundle('{nope').problem).toMatch(/not valid JSON/);
    expect(parseBundle('{"hello": 1}').problem).toMatch(/Expected a file from Export/);
    expect(parseBundle('[]').problem).toMatch(/no scenarios/);
    expect(parseBundle('[1]').problem).toMatch(/Item 1/);
    expect(parseBundle(JSON.stringify(Array.from({ length: 101 }, () => ({ label: 'x' })))).problem).toMatch(/101/);
  });

  it('plans to create what is valid and skips what clashes, with the reason', () => {
    const existing = [made({ id: 'e1', label: 'Existing', username: 'qa.taken', password: 'pw' })];
    const incoming = [
      made({ label: 'New one', username: 'qa.new' }),
      made({ label: 'Clash', username: 'qa.taken' }),
      made({ label: 'Same login twice', username: 'qa.new' }),
      made({ label: '', username: 'qa.noname' }),
    ].map(s => parseBundle(JSON.stringify(s)).scenarios[0]);
    const plan = planImport(incoming, existing);
    expect(plan.map(p => p.action)).toEqual(['create', 'skip', 'skip', 'skip']);
    expect(plan[1].reason).toContain('Existing');
    expect(plan[2].reason).toContain('New one');
    expect(plan[3].reason).toMatch(/name/i);
  });

  it('stops at the account limit', () => {
    const existing = Array.from({ length: 100 }, (_, i) => made({ id: `e${i}`, label: `E${i}`, username: `u${i}` }));
    const [one] = planImport([parseBundle(JSON.stringify(made({ label: 'One more', username: 'more' }))).scenarios[0]], existing);
    expect(one.action).toBe('skip');
    expect(one.reason).toMatch(/limit/);
  });
});

describe('the one-line summary of a scenario', () => {
  const emp = (over) => ({ payload: { employments: [{ income_unit: 'YEARLY', pay_frequency: 'BW', paystubs: [{}, {}], ...over }] } });
  it('says how the pay is quoted and how often it comes', () => {
    expect(summarizeScenario(emp({}))).toBe('Salaried, every two weeks · 2 paystubs');
    expect(summarizeScenario(emp({ income_unit: 'HOURLY' }))).toBe('Hourly, every two weeks · 2 paystubs');
  });
  it('does not say the same word twice', () => {
    expect(summarizeScenario(emp({ income_unit: 'MONTHLY', pay_frequency: 'M' }))).toBe('Monthly · 2 paystubs');
    expect(summarizeScenario(emp({ income_unit: 'WEEKLY', pay_frequency: 'W' }))).toBe('Weekly · 2 paystubs');
  });
});

describe('values of the wrong type', () => {
  const ok = { label: 'A', username: 'qa.a', payload: { employments: [{ company: { name: 'Acme' }, paystubs: [], w2s: [], bank_accounts: [] }] } };

  it('finds each one and says where, without throwing', () => {
    const bad = [
      [{ label: 5 }, 'label'],
      [{ label: ['x'] }, 'label'],
      [{ label: 'a', behavior_duration_seconds: '5' }, 'behavior_duration_seconds'],
      [{ label: 'a', payload: { employments: {} } }, 'payload.employments'],
      [{ label: 'a', payload: { employments: 'x' } }, 'payload.employments'],
      [{ label: 'a', payload: { employments: [null] } }, 'payload.employments[0]'],
      [{ label: 'a', payload: { employments: [{ paystubs: 'x' }] } }, 'payload.employments[0].paystubs'],
      [{ label: 'a', payload: { employments: [{ paystubs: [null] }] } }, 'payload.employments[0].paystubs[0]'],
      [{ label: 'a', payload: { employments: [{ bank_accounts: {} }] } }, 'payload.employments[0].bank_accounts'],
      [{ label: 'a', behavior_mfa: { challenges: 'x' } }, 'behavior_mfa.challenges'],
      [{ label: 'a', behavior_mfa: { challenges: [null] } }, 'behavior_mfa.challenges[0]'],
    ];
    for (const [s, path] of bad) {
      expect(() => validate(s)).not.toThrow();
      expect(typeProblems(s).map(p => p.path)).toContain(path);
      expect(validate(s).every(i => i.level === 'error')).toBe(true);
    }
  });

  it('accepts a good scenario and an empty object, and refuses things that are not objects', () => {
    expect(typeProblems(ok)).toEqual([]);
    expect(typeProblems({})).toEqual([]);
    expect(() => validate({})).not.toThrow();
    expect(typeProblems(null)[0].path).toBe('$');
    expect(typeProblems([1])[0].path).toBe('$');
  });
});

describe('amounts', () => {
  const emp = (over) => ({ label: 'A', username: 'u', payload: { employments: [{ company: { name: 'Acme' }, ...over }] } });
  const errsOf = (s) => validate(s).filter(i => i.level === 'error').map(i => i.path);

  it('treats a null amount as empty, as the API stores a blank one', () => {
    expect(errsOf(emp({ income: null, paystubs: [{ pay_date: '2026-01-02', gross_pay: null, net_pay: null, hours: null }] }))).toEqual([]);
  });
  it('refuses zero, negative and enormous amounts', () => {
    expect(errsOf(emp({ income: '0' }))).toContain('payload.employments[0].income');
    expect(errsOf(emp({ income: '-5' }))).toContain('payload.employments[0].income');
    expect(errsOf(emp({ income: '9999999999999.00' }))).toContain('payload.employments[0].income');
    const stub = (over) => emp({ paystubs: [{ pay_date: '2026-01-02', gross_pay: '10.00', net_pay: '8.00', ...over }] });
    expect(errsOf(stub({ hours: '0' }))).toContain('payload.employments[0].paystubs[0].hours');
    expect(errsOf(stub({ gross_pay: '-1' }))).toContain('payload.employments[0].paystubs[0].gross_pay');
    expect(errsOf(stub({ net_pay_ytd: '99999999999999999' }))).toContain('payload.employments[0].paystubs[0].net_pay_ytd');
  });
  it('says net is above gross once, not once per paystub', () => {
    const stubs = Array.from({ length: 6 }, (_, i) => ({ pay_date: `2026-01-0${i + 1}`, gross_pay: '1.00', net_pay: '2.00' }));
    const warns = validate(emp({ paystubs: stubs })).filter(i => i.level === 'warn' && /Net pay/.test(i.message));
    expect(warns).toHaveLength(1);
    expect(warns[0].message).toContain('6 paystubs');
  });
  it('wants a value on a percent or amount deposit', () => {
    const acct = (over) => emp({ bank_accounts: [{ deposit_type: 'P', ...over }] });
    expect(errsOf(acct({}))).toContain('payload.employments[0].bank_accounts[0].deposit_value');
    expect(errsOf(acct({ deposit_value: '120' }))).toContain('payload.employments[0].bank_accounts[0].deposit_value');
    expect(errsOf(acct({ deposit_value: '25' }))).toEqual([]);
    expect(errsOf(emp({ bank_accounts: [{ deposit_type: 'E' }] }))).toEqual([]);
  });
});

describe('reserved logins', () => {
  it('catches them whatever the capitals', () => {
    const s = { label: 'x', username: 'GoodLogin', payload: { employments: [{ company: { name: 'A' } }] } };
    expect(validate(s).some(i => i.level === 'error' && i.path === 'username')).toBe(true);
  });
  it('drops accents when it suggests a username', () => {
    expect(suggestUsername('Élan résumé', 'qa', [])).toBe('qa.elan.resume');
  });
});

describe('an update says what was removed', () => {
  it('sends the API its own "nothing" for fields left out of the JSON', () => {
    const body = toUpdateBody({ id: 'x', label: 'A', payload: { employments: [] } });
    expect(body).toMatchObject({ password: null, description: '', behavior_error_message: '', behavior_mfa: {}, behavior_duration_seconds: 0, behavior_status: 'done', is_refresh: null, products: [], enabled: true, provider_id: null, company_domain: null });
  });
  it('keeps what is there', () => {
    const body = toUpdateBody({ label: 'A', password: 'pw', behavior_status: 'account_locked', behavior_duration_seconds: 5, enabled: false, products: ['income'], payload: {} });
    expect(body).toMatchObject({ password: 'pw', behavior_status: 'account_locked', behavior_duration_seconds: 5, enabled: false, products: ['income'] });
  });
});

describe('standard MFA logins', () => {
  it('end as done once the screen is answered, and say what to type', () => {
    expect(expectedStatus({ login: 'goodlogin', password: 'mfa' })).toBe('done');
    expect(expectedStatus({ login: 'goodlogin', password: 'mfa_captcha' })).toBe('done');
    expect(expectedStatus({ login: 'error.user', password: 'mfa_error' })).toBe('mfa_error');
    expect(expectedStatus({ login: 'goodlogin', password: 'goodpassword', status: 'config_error' })).toBe('config_error');
    expect(standardMfaSteps('goodlogin', 'mfa')).toEqual(['type 12345']);
    expect(standardMfaSteps('goodlogin', 'mfa_captcha')).toEqual(['type 9M4BP']);
    expect(standardMfaSteps('goodlogin', 'goodpassword')).toEqual([]);
    expect(standardMfaSteps('qa.x', 'mfa')).toEqual([]);
  });
});

describe('words for statuses and errors', () => {
  it('turns task statuses into plain words', () => {
    expect(statusName('login_error')).toBe('Wrong password');
    expect(statusName('mfa')).toBe('Asks to verify');
    expect(statusName('some_new_status')).toBe('some new status');
    expect(statusName(null)).toBe('');
  });
  it('puts the API reasons into one line, without repeating the headline', () => {
    const err = describeError({ status: 400, data: { error: { code: 'incorrect_parameters', message: 'Incorrect request parameters', extra: { 'invalid-params': [{ field: 'filename', message: 'A document named x already exists.' }] } } } });
    const text = errorText(err);
    expect(text).toContain('A document named x already exists.');
    expect(text.match(/already exists/g)).toHaveLength(1);
  });
  it('speaks plainly when nothing answered', () => {
    expect(describeError({ status: 0, data: { error: { code: 'network_error', message: 'Failed to fetch' } } }).title).toBe('Could not reach the server');
  });
});

describe('plain words for API fields and sentences', () => {
  it('turns a field path into where it is', () => {
    expect(friendlyField('payload.employments.0.profile.ssn')).toBe('Job 1, SSN');
    expect(friendlyField('payload.employments.2.paystubs.3.net_pay')).toBe('Job 3, Paystub 4, take-home pay');
    expect(friendlyField('username')).toBe('username');
    expect(friendlyField('non_field_errors')).toBe('');
  });
  it('puts sentences together with a stop after each', () => {
    expect(joinSentences('Truv did not answer', 'Try again in a moment.')).toBe('Truv did not answer. Try again in a moment.');
    expect(joinSentences('', null, 'Only this')).toBe('Only this.');
  });
  it('says which field a reason belongs to', () => {
    const err = describeError({ status: 400, data: { error: { code: 'incorrect_parameters', message: 'Incorrect request parameters', extra: { 'invalid-params': [{ field: 'payload.employments.0.profile.ssn', message: 'Enter a valid SSN.' }] } } } });
    expect(errorText(err)).toContain('Job 1, SSN: Enter a valid SSN.');
  });
  it('keeps raw upstream text out of a server error', () => {
    const err = describeError({ status: 502, data: { error: { message: 'upstream connect error or disconnect/reset before headers' } } });
    expect(errorText(err)).not.toContain('upstream');
  });
});

describe('dates and bodies', () => {
  const body = { label: 'A', username: 'u', payload: { employments: [{ company: { name: 'Acme' }, start_date: '2024-01-01', end_date: '', original_hire_date: '' }] } };
  it('leaves an emptied date out, so the API does not call it the wrong format', () => {
    for (const out of [toCreateBody(body), toUpdateBody(body)]) {
      expect(out.payload.employments[0]).not.toHaveProperty('end_date');
      expect(out.payload.employments[0]).not.toHaveProperty('original_hire_date');
      expect(out.payload.employments[0].start_date).toBe('2024-01-01');
    }
  });
  it('warns about a paystub dated after the job ended', () => {
    const s = { label: 'A', username: 'u', payload: { employments: [{ company: { name: 'Acme' }, is_active: false, end_date: '2025-01-01', paystubs: [{ pay_date: '2025-02-01', gross_pay: '1.00', net_pay: '1.00' }] }] } };
    expect(validate(s).some(i => i.level === 'warn' && /after the end date/.test(i.message))).toBe(true);
  });
});

describe('suggested usernames', () => {
  it('does not repeat the prefix when the name already starts with it', () => {
    expect(suggestUsername('qa salaried', 'qa', [])).toBe('qa.salaried');
    expect(suggestUsername('sbxqa2b salaried', 'sbxqa2b', [])).toBe('sbxqa2b.salaried');
    expect(suggestUsername('salaried', 'qa', [])).toBe('qa.salaried');
  });
});

describe('comparing several jobs', () => {
  const two = { payload: { employments: [{ company: { name: 'Acme Inc.' }, income: '1000.00', income_unit: 'MONTHLY', pay_frequency: 'M', paystubs: [{}] }, { company: { name: 'Northwind LLC' }, income: '20.00', income_unit: 'HOURLY', pay_frequency: 'BW' }] } };
  it('matches each job by employer, whatever order they came back in', () => {
    const run = { employments: [
      { company: 'Northwind', payFrequency: 'BW', income: '20.00', incomeUnit: 'HOURLY', statements: 0 },
      { company: 'Acme', payFrequency: 'M', income: '1000.00', incomeUnit: 'MONTHLY', statements: 1 },
    ] };
    const rows = compareToScenario(two, run);
    expect(rows.every(r => r.same)).toBe(true);
    expect(rows.map(r => r.label)).toContain('Job 2: Pay amount');
  });
  it('says so when a job did not come back', () => {
    const rows = compareToScenario(two, { employments: [{ company: 'Acme', statements: 1 }] });
    expect(rows.find(r => r.label === 'Job 2: Employer')).toMatchObject({ returned: 'Not returned', same: false });
  });
});

describe('what a scenario holds, in one line', () => {
  it('counts bank accounts and W-2s, and shrugs off bad entries', () => {
    const s = { payload: { employments: [{ income_unit: 'YEARLY', pay_frequency: 'BW', paystubs: [{}], bank_accounts: [{}, {}], w2s: [{}] }, null] } };
    expect(summarizeScenario(s)).toBe('Salaried, every two weeks · 1 paystub · 2 bank accounts · 1 W-2');
    expect(() => summarizeScenario({ payload: { employments: [null, 5, 'x'] } })).not.toThrow();
  });
});

describe('type problems in every field the screens draw', () => {
  const emp = (e) => ({ label: 'a', payload: { employments: [e] } });
  it('catches objects and lists where text belongs, and says where', () => {
    const cases = [
      [{ label: 'a', data_source: {} }, 'data_source'],
      [{ label: 'a', enabled: 'yes' }, 'enabled'],
      [{ label: 'a', is_refresh: 'x' }, 'is_refresh'],
      [{ label: 'a', products: [{}] }, 'products[0]'],
      [{ label: 'a', behavior_mfa: { challenges: [{ type: 'OPTIONS', options: 'abc' }] } }, 'behavior_mfa.challenges[0].options'],
      [{ label: 'a', behavior_mfa: { challenges: [{ type: 'OPTIONS', options: [{ value: {}, label: 'x' }] }] } }, 'behavior_mfa.challenges[0].options[0].value'],
      [{ label: 'a', behavior_mfa: { challenges: [{ type: 'OPTIONS', answers: 5 }] } }, 'behavior_mfa.challenges[0].answers'],
      [{ label: 'a', behavior_mfa: { challenges: [{ type: 'TEXT', label: {} }] } }, 'behavior_mfa.challenges[0].label'],
      [emp({ company: { name: {} } }), 'payload.employments[0].company.name'],
      [emp({ job_title: ['x'] }), 'payload.employments[0].job_title'],
      [emp({ income_unit: 5, pay_frequency: [] }), 'payload.employments[0].pay_frequency'],
      [emp({ paystubs: [{ pay_date: {} }] }), 'payload.employments[0].paystubs[0].pay_date'],
      [emp({ w2s: [{ year: {} }] }), 'payload.employments[0].w2s[0].year'],
      [emp({ bank_accounts: [{ bank_name: [] }] }), 'payload.employments[0].bank_accounts[0].bank_name'],
      [emp({ profile: 'x' }), 'payload.employments[0].profile'],
    ];
    for (const [s, path] of cases) {
      expect(typeProblems(s).map(p => p.path), JSON.stringify(s)).toContain(path);
      expect(() => validate(s)).not.toThrow();
    }
  });
  it('lets numbers stand in for text, which the API accepts', () => {
    expect(typeProblems(emp({ income: 100, income_unit: 'MONTHLY', paystubs: [{ pay_date: '2026-01-02', gross_pay: 10 }] }))).toEqual([]);
  });
  it('words the problem the way a person would', () => {
    const [p] = typeProblems(emp({ paystubs: [{ pay_date: {} }] }));
    expect(p.message).toBe('Job 1, Paystub 1, pay date should be text or a number.');
    expect(friendlyField('behavior_mfa.challenges[0].options[1].value')).toBe('Verification, Screen 1, Choice 2, value');
  });
  it('does not let summarizing a scenario throw on odd values', () => {
    expect(() => summarizeScenario({ payload: { employments: [{ income_unit: 5, pay_frequency: {}, paystubs: 'x', bank_accounts: 4 }] }, behavior_mfa: { challenges: 'x' } })).not.toThrow();
  });
});

describe('moving paystub dates keeps year-to-date honest', () => {
  it('works the totals out again for the new dates', () => {
    const stubs = buildPaystubs({ frequency: 'BW', count: 3, last: '2025-12-26', gross: '1000.00', net: '700.00' });
    const moved = refreshDates({ employments: [{ pay_frequency: 'BW', paystubs: stubs }] }, '2026-10-22').payload.employments[0].paystubs;
    for (const s of moved) {
      const n = payPeriodsThisYear('BW', s.pay_date);
      expect(s.gross_pay_ytd).toBe((1000 * n).toFixed(2));
      expect(s.net_pay_ytd).toBe((700 * n).toFixed(2));
      expect(s.earnings_ytd[0].amount).toBe((1000 * n).toFixed(2));
    }
    expect(moved.at(-1).gross_pay_ytd).not.toBe(stubs.at(-1).gross_pay_ytd);
  });
});

describe('dates in unusual years', () => {
  it('reads short and leap years correctly', () => {
    expect(iso(parseISO('0100-02-28'))).toBe('0100-02-28');
    expect(iso(parseISO('0050-01-01'))).toBe('0050-01-01');
    expect(parseISO('0100-02-29')).toBeNull();        // 100 is not a leap year
    expect(iso(parseISO('2024-02-29'))).toBe('2024-02-29');
    expect(parseISO('2023-02-29')).toBeNull();
    expect(parseISO('2026-13-01')).toBeNull();
  });
});
