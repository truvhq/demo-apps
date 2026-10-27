import { describe, it, expect } from 'vitest';
import {
  readRun, judge, compareToScenario, refreshDiff, buildPaystubs, orderKeys, planImport, validate, blankScenario, blankEmployment,
  toCurlScript, toPostman, suiteItemFromScenario, suiteItemFromLogin, suiteCsv, suiteSkip, matchesQuery, sortScenarios, scenarioForLogin, retypeChallenge, moveItem, MFA_PRESETS,
} from '../../src/sandbox/model.js';
import { OUTCOMES, outcomeFor } from '../../src/sandbox/outcomes.js';
import { STATUSES } from '../../src/sandbox/model.js';

const emp = (o = {}) => ({ company_name: 'Acme', link_id: 'l1', last_task_status: 'done', employments: [{ company: { name: 'Acme' }, job_title: 'Engineer', is_active: true, income: '124800.00', income_unit: 'YEARLY', pay_frequency: 'BW', statements: [{ pay_date: '2026-07-01', gross_pay: '4800.00', net_pay: '3312.00' }, { pay_date: '2026-07-15', gross_pay: '4800.00', net_pay: '3312.00' }] }], ...o });

describe('reading a run with several logins', () => {
  it('settles only when every employer has', () => {
    const order = { employers: [emp({ link_id: 'a' }), emp({ link_id: 'b', company_name: 'Two' })] };
    const half = readRun({ tasks: [{ link_id: 'a', status: 'done' }, { link_id: 'b', status: 'parse' }], order });
    expect(half.settled).toBe(false);
    expect(half.employers).toHaveLength(2);
    const all = readRun({ tasks: [{ link_id: 'a', status: 'done' }, { link_id: 'b', status: 'login_error', error_message: 'nope' }], order });
    expect(all).toMatchObject({ settled: true, ok: false, status: 'login_error', errorMessage: 'nope' });
    expect(all.employers.map(e => e.ok)).toEqual([true, false]);
  });

  it('puts the employers back in the order they were made, whatever order Truv lists them in', () => {
    const order = { employers: [emp({ link_id: 'b', company_name: 'Sandbox login 2', last_task_status: 'login_error' }), emp({ link_id: 'a', company_name: 'Sandbox login 1' })] };
    const run = readRun({ tasks: [], order, names: ['Sandbox login 1', 'Sandbox login 2'] });
    expect(run.employers.map(e => e.company)).toEqual(['Sandbox login 1', 'Sandbox login 2']);
    expect(run.employers.map(e => e.ok)).toEqual([true, false]);
  });

  it('keeps the single-employer answer the same', () => {
    const run = readRun({ tasks: [{ status: 'login' }, { status: 'done' }], order: { employers: [emp()] } });
    expect(run).toMatchObject({ status: 'done', settled: true, ok: true });
    expect(run.employments[0]).toMatchObject({ company: 'Acme', statements: 2, latest: { pay_date: '2026-07-15' } });
  });

  it('is not settled with no task at all', () => {
    expect(readRun({ tasks: [], order: { employers: [emp({ last_task_status: null })] } })).toMatchObject({ settled: false, ok: false });
  });
});

describe('judging a run', () => {
  const scenario = { behavior_status: 'done', payload: { employments: [{ company: { name: 'Acme Inc.' }, job_title: 'Engineer', is_active: true, start_date: '2022-03-01', pay_frequency: 'BW', income: '124800.00', income_unit: 'YEARLY', paystubs: [{ pay_date: '2026-07-15', gross_pay: '4800.00', net_pay: '3312.00' }] }] } };
  const run = (o = {}) => ({ settled: true, ok: true, status: 'done', employments: [{ company: 'Acme', title: 'Engineer', active: true, startDate: '2022-03-01', payFrequency: 'BW', income: '124800.00', incomeUnit: 'YEARLY', statements: 1, latest: { pay_date: '2026-07-15', gross_pay: '4800.00', net_pay: '3312.00' } }], ...o });

  it('waits for a settled run', () => {
    expect(judge({ run: { settled: false } }).verdict).toBe('pending');
  });
  it('passes when status and data match', () => {
    expect(judge({ scenario, expected: 'done', run: run() })).toMatchObject({ verdict: 'pass', reasons: [] });
  });
  it('fails on a wrong status and says what', () => {
    const v = judge({ scenario, expected: 'done', run: run({ status: 'login_error', ok: false, employments: [] }) });
    expect(v.verdict).toBe('fail');
    expect(v.reasons[0]).toMatch(/Expected Success, got Wrong password/);
  });
  it('fails on a changed paystub', () => {
    const r = run(); r.employments[0].latest.gross_pay = '1.00';
    const v = judge({ scenario, expected: 'done', run: r });
    expect(v.verdict).toBe('fail');
    expect(v.reasons.join(' ')).toMatch(/Newest gross pay/);
  });
  it('ignores pay for an employment-only run', () => {
    const r = run({ employments: [{ company: 'Acme', title: 'Engineer', active: true, startDate: '2022-03-01' }] });
    expect(judge({ scenario, expected: 'done', run: r, product: 'employment' }).verdict).toBe('pass');
    expect(compareToScenario(scenario, r, { product: 'employment' }).map(x => x.label)).not.toContain('Pay amount');
  });
  it('only notes a differing failure message', () => {
    const bad = { behavior_status: 'account_locked', behavior_error_message: 'Locked out' };
    const v = judge({ scenario: bad, expected: 'account_locked', run: { settled: true, ok: false, status: 'account_locked', errorMessage: 'Something else', employments: [] } });
    expect(v.verdict).toBe('pass');
    expect(v.notes[0]).toMatch(/Something else/);
  });
  it('lets a refresh return more paystubs than it was given', () => {
    const r = run(); r.employments[0].statements = 2;
    expect(judge({ scenario, expected: 'done', run: r }).verdict).toBe('fail');
    expect(judge({ scenario, expected: 'done', run: r, refresh: true }).verdict).toBe('pass');
    r.employments[0].statements = 0;
    expect(judge({ scenario, expected: 'done', run: r, refresh: true }).verdict).toBe('fail');
  });
  it('checks only the status when no scenario answers', () => {
    expect(judge({ scenario: null, expected: 'done', run: run() }).verdict).toBe('pass');
  });
  it('compares dates and the active flag', () => {
    const r = run(); r.employments[0].active = false; r.employments[0].startDate = '2020-01-01';
    expect(judge({ scenario, expected: 'done', run: r }).reasons.join(' ')).toMatch(/Still employed.*Start date|Start date.*Still employed/s);
  });
});

describe('finding the scenario for a typed login', () => {
  const list = [{ id: 1, username: 'a', password: 'p', enabled: true }, { id: 2, username: 'a', password: 'p', is_refresh: true }, { id: 3, username: 'b', password: 'p', enabled: false }];
  it('matches login and password, skips off and refresh-only', () => {
    expect(scenarioForLogin(list, 'a', 'p').id).toBe(1);
    expect(scenarioForLogin(list, 'a', 'x')).toBeNull();
    expect(scenarioForLogin(list, 'b', 'p')).toBeNull();
    expect(scenarioForLogin(list, 'a', 'p', { refresh: true }).id).toBe(2);
  });
});

describe('before and after a refresh', () => {
  const run = (gross, date, n = 2) => ({ employments: [{ company: 'Acme', title: 'Eng', income: '1', incomeUnit: 'YEARLY', payFrequency: 'BW', active: true, statements: n, latest: { pay_date: date, gross_pay: gross, net_pay: '1.00' } }] });
  it('marks what changed', () => {
    const rows = refreshDiff(run('100.00', '2026-07-01'), run('150.00', '2026-07-15', 3));
    expect(rows.filter(r => r.changed).map(r => r.label)).toEqual(['Paystubs', 'Newest paystub date', 'Newest gross pay']);
  });
  it('shows a job that appears or goes away', () => {
    const rows = refreshDiff({ employments: [] }, run('1.00', '2026-07-01'));
    expect(rows.find(r => r.label === 'Employer')).toMatchObject({ before: '', after: 'Acme', changed: true });
  });
});

describe('generated paystubs with an overtime line', () => {
  it('splits the gross into regular and overtime and keeps year-to-date honest', () => {
    const [s] = buildPaystubs({ frequency: 'BW', count: 1, last: '2026-07-15', gross: '2850.00', net: '1966.50', hours: '90', lines: [{ name: 'Overtime', amount: '450.00', units: '10' }] });
    expect(s.earnings).toEqual([{ name: 'Regular', amount: '2400.00', rate: '30.00', units: '80.00' }, { name: 'Overtime', amount: '450.00', rate: '45.00', units: '10.00' }]);
    expect(s.gross_pay).toBe('2850.00');
    const n = parseFloat(s.gross_pay_ytd) / 2850;
    expect(parseFloat(s.earnings_ytd[1].amount)).toBeCloseTo(450 * n);
  });
  it('ignores empty lines', () => {
    const [s] = buildPaystubs({ frequency: 'BW', count: 1, last: '2026-07-15', gross: '100.00', net: '80.00', lines: [{ name: '', amount: '' }] });
    expect(s.earnings).toHaveLength(1);
  });
});

describe('key order', () => {
  it('puts identity and behaviour first, the data last', () => {
    expect(Object.keys(orderKeys({ payload: {}, zed: 1, username: 'u', label: 'l', data_source: 'payroll', alpha: 2 }))).toEqual(['data_source', 'label', 'username', 'payload', 'alpha', 'zed']);
  });
});

describe('import that updates', () => {
  const jobs = { employments: [blankEmployment()] };
  const existing = [{ id: 'x1', label: 'Same', data_source: 'payroll', username: 'u', password: 'p', payload: jobs }];
  const incoming = [{ label: 'Same', data_source: 'payroll', username: 'u', password: 'p', description: 'new', payload: jobs }, { label: 'Brand new', username: 'n', password: 'p', data_source: 'payroll', payload: jobs }];
  it('skips a same-named scenario by default', () => {
    expect(planImport(incoming, existing).map(p => p.action)).toEqual(['skip', 'create']);
  });
  it('updates it when asked', () => {
    const plan = planImport(incoming, existing, { update: true });
    expect(plan.map(p => p.action)).toEqual(['update', 'create']);
    expect(plan[0].id).toBe('x1');
  });
});

describe('identity fields and other checks', () => {
  const withProfile = (profile) => blankScenario({ username: 'u1', password: 'p', label: 'L', payload: { employments: [blankEmployment({ profile })] } });
  const errs = (s, o) => validate(s, o).filter(i => i.level === 'error').map(i => i.path);
  it('accepts good identity details', () => {
    expect(errs(withProfile({ full_name: 'A B', ssn: '991-91-9991', email: 'a@b.co', phone: '415-555-0100', date_of_birth: '1988-04-17', home_address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94105' } }))).toEqual([]);
  });
  it('rejects bad ones', () => {
    const paths = errs(withProfile({ email: 'nope', date_of_birth: '2999-01-01', phone: '12', home_address: { zip: '9', state: 'California' } }));
    expect(paths).toEqual(expect.arrayContaining(['payload.employments[0].profile.email', 'payload.employments[0].profile.date_of_birth', 'payload.employments[0].profile.phone', 'payload.employments[0].profile.home_address.zip', 'payload.employments[0].profile.home_address.state']));
  });
  it('warns about no pay amount, naming the job when there are several', () => {
    const s = blankScenario({ username: 'u1', password: 'p', label: 'L', payload: { employments: [blankEmployment(), blankEmployment({ income: '' })] } });
    expect(validate(s).find(i => i.path === 'payload.employments[1].income').message).toMatch(/^Job 2: /);
  });
  it('uses the typed prefix in the reserved-login hint', () => {
    const s = blankScenario({ username: 'goodlogin', password: 'p', label: 'My Case' });
    expect(validate(s, { prefix: 'eric' }).find(i => i.path === 'username').message).toMatch(/eric\.my\.case/);
  });
});

describe('exports', () => {
  const list = [{ label: "It's mine", username: 'u', password: 'p', data_source: 'payroll', payload: { employments: [] }, behavior_status: 'login_error' }];
  it('writes a script with the keys from the environment', () => {
    const sh = toCurlScript(list);
    expect(sh).toContain('$TRUV_CLIENT_ID');
    expect(sh).toContain("It'\\''s mine");
    expect(sh).not.toMatch(/YOUR_TRUV/);
  });
  it('writes a Postman collection with variables for the keys', () => {
    const c = toPostman(list);
    expect(c.item).toHaveLength(1);
    expect(c.item[0].request.header[0].value).toBe('{{client_id}}');
    expect(JSON.parse(c.item[0].request.body.raw).label).toBe("It's mine");
  });
});

describe('suite results', () => {
  it('writes CSV with quotes escaped and formulas defused', () => {
    const csv = suiteCsv([{ label: '=SUM(A1)', login: 'a,b', expected: 'done', status: 'done', verdict: 'pass', seconds: 3, orderId: 'o1', note: 'said "hi"' }]);
    const [head, row] = csv.split('\n');
    expect(head).toBe('Scenario,Login,Expected,Result,Verdict,Seconds,Order id,Notes');
    expect(row).toBe('\'=SUM(A1),"a,b",Success,Success,Pass,3,o1,"said ""hi"""');
  });
  it('says why a scenario cannot be run on its own', () => {
    expect(suiteSkip({ username: 'u', password: 'p' })).toBe('');
    expect(suiteSkip({ username: 'u', password: 'p', enabled: false })).toMatch(/off/i);
    expect(suiteSkip({ username: 'u', password: 'p', behavior_mfa: { challenges: [{}] } })).toMatch(/code/);
    expect(suiteSkip({ username: 'u' })).toBe('');
    expect(suiteSkip({ password: 'p' })).toMatch(/login/);
    expect(suiteSkip({ username: 'u', password: 'p', is_refresh: true })).toMatch(/refresh/);
  });
});

describe('finding and sorting', () => {
  const list = [
    { label: 'b one', username: 'x', description: 'Paid late', updated_at: '2026-01-02', payload: { employments: [{ company: { name: 'Northwind' }, is_active: false, end_date: '2026-01-01' }] } },
    { label: 'a two', username: 'y', behavior_status: 'account_locked', updated_at: '2026-03-01' },
  ];
  it('matches employers, notes, status names and synonyms', () => {
    expect(matchesQuery(list[0], 'northwind')).toBe(true);
    expect(matchesQuery(list[0], 'paid late')).toBe(true);
    expect(matchesQuery(list[0], 'terminated')).toBe(true);
    expect(matchesQuery(list[1], 'locked')).toBe(true);
    expect(matchesQuery(list[1], 'northwind')).toBe(false);
  });
  it('sorts by name, login and recent update', () => {
    expect(sortScenarios(list, 'name').map(s => s.label)).toEqual(['a two', 'b one']);
    expect(sortScenarios(list, 'login').map(s => s.username)).toEqual(['x', 'y']);
    expect(sortScenarios(list, 'updated').map(s => s.label)).toEqual(['a two', 'b one']);
  });
});

describe('editing multi-factor screens', () => {
  it('clears the label and answer when the type changes', () => {
    expect(retypeChallenge({ type: 'TEXT', label: 'x', answer: '1' }, 'OPTIONS')).toMatchObject({ type: 'OPTIONS', label: '', options: [] });
    const same = { type: 'TEXT', label: 'x' };
    expect(retypeChallenge(same, 'TEXT')).toBe(same);
  });
  it('moves a screen up or down, and stops at the ends', () => {
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    const l = [1, 2];
    expect(moveItem(l, 0, -1)).toBe(l);
  });
  it('has a choice-then-code preset', () => {
    expect(MFA_PRESETS.find(p => p.id === 'choice-code').challenges.map(c => c.type)).toEqual(['OPTIONS', 'TEXT']);
  });
});

describe('the outcome glossary', () => {
  it('covers every status the builder offers', () => {
    expect(OUTCOMES.map(o => o.status).sort()).toEqual(STATUSES.map(s => s.value).sort());
    expect(outcomeFor('no_data').do).toMatch(/document/i);
  });
});

describe('suite lines', () => {
  it('builds a line from a scenario, with its expected result and why it would be skipped', () => {
    const s = { id: 'a', label: 'Locked', username: 'u', password: 'p', behavior_status: 'account_locked' };
    expect(suiteItemFromScenario(s)).toMatchObject({ key: 'a', login: 'u', password: 'p', expected: 'account_locked', skip: '' });
    expect(suiteItemFromScenario({ ...s, password: '' }).password).toBe('password');
    expect(suiteItemFromScenario({ ...s, enabled: false }).skip).toMatch(/off/i);
  });
  it('builds a line from a standard login', () => {
    expect(suiteItemFromLogin({ login: 'error.user', password: 'login_error', status: 'login_error' })).toMatchObject({ label: 'error.user / login_error', expected: 'login_error', skip: '' });
  });
});

describe('review fixes', () => {
  it('searching for names that exist on every object does not crash', () => {
    expect(matchesQuery({ label: 'a' }, 'constructor')).toBe(false);
    expect(matchesQuery({ label: 'constructor test' }, 'constructor')).toBe(true);
  });
  it('does not run a scenario limited to one provider or employer', () => {
    expect(suiteSkip({ username: 'u', password: 'p', provider_id: 'adp' })).toMatch(/provider/);
    expect(suiteSkip({ username: 'u', password: 'p', company_domain: 'acme.com' })).toMatch(/employer/);
  });
  it('lets only one scenario in a file update each existing one', () => {
    const jobs = { employments: [blankEmployment()] };
    const existing = [{ id: 'x1', label: 'Same', data_source: 'payroll', username: 'u', password: 'p', payload: jobs }];
    const body = { label: 'Same', data_source: 'payroll', username: 'u', password: 'p', payload: jobs };
    const plan = planImport([body, { ...body }], existing, { update: true });
    expect(plan.map(p => p.action)).toEqual(['update', 'skip']);
  });
});

describe('what Truv does when nothing answers', () => {
  it('refuses an unknown login', async () => {
    const { expectedStatus } = await import('../../src/sandbox/model.js');
    expect(expectedStatus({ login: 'nobody.here', password: 'x' })).toBe('login_error');
    expect(expectedStatus({ login: 'goodlogin', password: 'goodpassword' })).toBe('done');
  });
  it('leaves pay out of a refresh comparison for employment', () => {
    const run = { employments: [{ company: 'A', title: 'x', income: '1', incomeUnit: 'YEARLY', payFrequency: 'BW', active: true, statements: 1, latest: { pay_date: '2026-01-01', gross_pay: '1', net_pay: '1' } }] };
    expect(refreshDiff(run, run, { product: 'employment' }).map(r => r.label)).not.toContain('Pay amount');
  });
});
