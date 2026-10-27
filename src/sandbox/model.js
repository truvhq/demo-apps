/**
 * FILE SUMMARY: The rules and helpers behind the Sandbox Data Playground. No UI, no network.
 *
 * A scenario is one object, laid out the way the sandbox API takes it: a login to match, how the task
 * behaves, and the data to return. The builder edits that object directly, so a scenario made
 * somewhere else (Postman, curl) opens in the builder with nothing dropped, including fields the
 * forms do not show.
 *
 * Everything here is pure and takes "today" as an argument, so it can be tested.
 */

import { LOGINS } from './standard-logins.js';

// --- Vocabulary (from the sandbox API reference) ---

export const DATA_SOURCES = ['payroll', 'docs', 'financial_accounts', 'education', 'credit', 'insurance'];
export const DATA_SOURCE_LABELS = {
  payroll: 'Payroll', docs: 'Documents', financial_accounts: 'Bank', education: 'Education', credit: 'Credit', insurance: 'Insurance',
};

// What the task ends as. Plain words first, the API value second.
export const STATUSES = [
  { value: 'done', label: 'Success', hint: 'The sign-in works and the data below comes back.' },
  { value: 'login_error', label: 'Wrong password', hint: 'The provider rejects the sign-in.' },
  { value: 'account_locked', label: 'Account locked', hint: 'The provider has locked the account.' },
  { value: 'mfa_error', label: 'Code rejected', hint: 'The verification code was wrong or expired.' },
  { value: 'config_error', label: 'Setup problem', hint: 'The provider needs something configured before it can connect.' },
  { value: 'no_data', label: 'Signs in, no records', hint: 'The sign-in works but the provider has nothing to return.' },
  { value: 'unavailable', label: 'Provider down', hint: 'The provider is under maintenance.' },
  { value: 'not_supported', label: 'Not supported', hint: 'Truv cannot connect to this provider for this product.' },
  { value: 'unable_to_reset', label: 'Reset failed', hint: 'A password reset could not finish.' },
  { value: 'error', label: 'Generic error', hint: 'An unspecified failure.' },
];
export const FAILURE_STATUSES = new Set(STATUSES.map(s => s.value).filter(v => v !== 'done'));
export const TERMINAL_STATUSES = new Set(['done', ...FAILURE_STATUSES]);

export const PAYROLL_PRODUCTS = ['income', 'employment'];
export const JOB_TYPES = [['F', 'Full time'], ['P', 'Part time'], ['S', 'Seasonal'], ['D', 'Per diem'], ['C', 'Contract'], ['V', 'Volunteer']];
export const INCOME_UNITS = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
export const PAY_FREQUENCIES = [['W', 'Weekly'], ['BW', 'Every two weeks'], ['SM', 'Twice a month'], ['M', 'Monthly']];
export const OTHER_PAY_FREQUENCIES = [['A', 'Annually'], ['SA', 'Twice a year'], ['C', 'Commission']];

export const payFrequencyLabel = (code) => ([...PAY_FREQUENCIES, ...OTHER_PAY_FREQUENCIES].find(f => f[0] === code) || [])[1] || code || '';

// What to type or pick on each verification screen, in order, for a scenario made here.
export function mfaSteps(s) {
  const list = s?.behavior_mfa?.challenges;
  if (!Array.isArray(list)) return [];
  return list.map((c) => {
    if (c.type === 'OPTIONS') {
      const pick = c.answers?.[0] ?? c.options?.[0]?.value;
      const label = c.options?.find(o => o.value === pick)?.label || pick;
      return label ? `choose ${label}` : 'choose any';
    }
    return c.answer ? `type ${c.answer}` : 'type anything';
  });
}

export const LIMITS = {
  scenarios: 100, payloadBytes: 1024 * 1024, employments: 10, paystubs: 60, w2s: 5, bankAccounts: 5,
  shifts: 50, mfa: 5, delay: 120, label: 128, description: 2000, message: 500, credential: 255,
};

// --- Dates (UTC, ISO strings) ---

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseISO = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  // Built in a leap year, then moved to the real one: a short year such as 0100 is not read as 2000 + 100.
  const d = new Date(Date.UTC(2000, +m[2] - 1, +m[3]));
  d.setUTCFullYear(+m[1]);
  return iso(d) === s ? d : null;
};
export const todayISO = (now = new Date()) => iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
const addDays = (s, n) => iso(new Date(parseISO(s).getTime() + n * DAY));
const daysBetween = (a, b) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
const lastOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isLastOfMonth = (s) => { const d = parseISO(s); return d.getUTCDate() === lastOfMonth(d.getUTCFullYear(), d.getUTCMonth()); };

// Move a date by whole months. A month-end date stays a month-end ("Jan 31" + 1 month = "Feb 28").
export function addMonths(s, n) {
  const d = parseISO(s);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const last = lastOfMonth(y, m);
  const day = isLastOfMonth(s) ? last : Math.min(d.getUTCDate(), last);
  return iso(new Date(Date.UTC(y, m, day)));
}

// --- Money in whole cents, so nothing drifts ---

const toCents = (v) => Math.round(parseFloat(v) * 100);
const MAX_CENTS = 99999999999999;
const fromCents = (c) => (c / 100).toFixed(2);
export const isDecimal = (v) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v);

// --- Paystubs ---

const STEP_DAYS = { W: 7, BW: 14 };

// The latest pay date on a frequency's calendar that is on or before `date`.
// W and BW keep the cadence of `anchor` (any real pay date). SM is the 15th and the last day.
// M is the last day.
export function snapPayDate(frequency, date, anchor) {
  if (STEP_DAYS[frequency]) {
    const step = STEP_DAYS[frequency];
    const k = Math.floor(daysBetween(anchor || date, date) / step);
    return addDays(anchor || date, k * step);
  }
  const d = parseISO(date);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const eom = lastOfMonth(y, m);
  if (frequency === 'M') return d.getUTCDate() === eom ? date : iso(new Date(Date.UTC(y, m, 0)));
  if (frequency === 'SM') {
    if (d.getUTCDate() === eom) return date;
    if (d.getUTCDate() >= 15) return iso(new Date(Date.UTC(y, m, 15)));
    return iso(new Date(Date.UTC(y, m, 0)));
  }
  return date;
}

// The pay date before this one.
function previousPayDate(frequency, date) {
  if (STEP_DAYS[frequency]) return addDays(date, -STEP_DAYS[frequency]);
  if (frequency === 'M') return addMonths(date, -1);
  const d = parseISO(date);
  if (d.getUTCDate() === 15) return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15)));
}

export function periodFor(frequency, payDate) {
  if (STEP_DAYS[frequency]) return { start: addDays(payDate, -(STEP_DAYS[frequency] - 1)), end: payDate };
  const d = parseISO(payDate);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (frequency === 'M') return { start: iso(new Date(Date.UTC(y, m, 1))), end: payDate };
  return d.getUTCDate() === 15
    ? { start: iso(new Date(Date.UTC(y, m, 1))), end: payDate }
    : { start: iso(new Date(Date.UTC(y, m, 16))), end: payDate };
}

// How many pay dates of this frequency fall in the pay date's year, up to and including it.
export function payPeriodsThisYear(frequency, payDate) {
  const d = parseISO(payDate);
  const jan1 = iso(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)));
  if (STEP_DAYS[frequency]) return Math.floor(daysBetween(jan1, payDate) / STEP_DAYS[frequency]) + 1;
  if (frequency === 'M') return d.getUTCMonth() + 1;
  return d.getUTCMonth() * 2 + (d.getUTCDate() === 15 ? 1 : 2);
}

export function payDates({ frequency, last, count }) {
  const out = [];
  let cur = snapPayDate(frequency, last, last);
  for (let i = 0; i < count; i++) { out.unshift(cur); cur = previousPayDate(frequency, cur); }
  return out;
}

// A run of paystubs, oldest first, each with year-to-date totals that add up.
//   hours given -> hourly: earnings carry hours and a rate, basis_of_pay is H
//   otherwise   -> salary: basis_of_pay is S
export function buildPaystubs({ frequency = 'BW', count = 2, last, gross, net, hours, currency = 'USD', lines = [] }) {
  if (!STEP_DAYS[frequency] && frequency !== 'SM' && frequency !== 'M') throw new Error(`Pay frequency ${frequency} is not supported here`);
  const grossC = toCents(gross);
  const netC = toCents(net);
  const hourly = hours !== undefined && hours !== '' && hours !== null;
  // Extra earning lines (overtime, a bonus) are part of the gross: Regular is what is left after them.
  const extra = (Array.isArray(lines) ? lines : []).filter(l => l && String(l.name || '').trim() && isDecimal(String(l.amount ?? '')));
  const extraC = extra.reduce((sum, l) => sum + toCents(l.amount), 0);
  const extraUnits = extra.reduce((sum, l) => sum + (parseFloat(l.units) || 0), 0);
  const regularC = Math.max(0, grossC - extraC);
  const regularUnits = hourly ? Math.max(0, parseFloat(hours) - extraUnits) : 0;
  const line = (name, amountC, units, mult) => ({
    name, amount: fromCents(amountC * mult),
    ...(hourly && units > 0 ? { rate: fromCents(Math.round(amountC / units)), units: (units * mult).toFixed(2) } : {}),
  });
  return payDates({ frequency, last, count }).map((payDate) => {
    const { start, end } = periodFor(frequency, payDate);
    const n = payPeriodsThisYear(frequency, payDate);
    const parts = [['Regular', regularC, regularUnits], ...extra.map(l => [String(l.name).trim(), toCents(l.amount), parseFloat(l.units) || 0])];
    return {
      pay_date: payDate,
      period_start: start,
      period_end: end,
      currency,
      gross_pay: fromCents(grossC),
      net_pay: fromCents(netC),
      gross_pay_ytd: fromCents(grossC * n),
      net_pay_ytd: fromCents(netC * n),
      ...(hourly ? { hours: parseFloat(hours).toFixed(2) } : {}),
      basis_of_pay: hourly ? 'H' : 'S',
      earnings: parts.map(([name, c, u]) => line(name, c, u, 1)),
      earnings_ytd: parts.map(([name, c, u]) => line(name, c, u, n)),
    };
  });
}

// Twice-a-month dates are the 15th and the last day. Count them in halves of a month so they can be
// moved by a whole number of pay periods.
const semiIndex = (s) => { const d = parseISO(s); return d.getUTCFullYear() * 24 + d.getUTCMonth() * 2 + (d.getUTCDate() === 15 ? 0 : 1); };
const fromSemiIndex = (n) => {
  const y = Math.floor(n / 24); const r = n - y * 24; const m = Math.floor(r / 2);
  return r % 2 === 0 ? iso(new Date(Date.UTC(y, m, 15))) : iso(new Date(Date.UTC(y, m, lastOfMonth(y, m))));
};
const onSemiCalendar = (s) => { const d = parseISO(s); return !!d && (d.getUTCDate() === 15 || isLastOfMonth(s)); };

function restateYtd(x, freq) {
  const n = payPeriodsThisYear(freq, x.pay_date);
  if (isDecimal(x.gross_pay)) x.gross_pay_ytd = fromCents(toCents(x.gross_pay) * n);
  if (isDecimal(x.net_pay)) x.net_pay_ytd = fromCents(toCents(x.net_pay) * n);
  // Each year-to-date earning follows the earning of the same name on this stub (Regular, Overtime, ...).
  if (Array.isArray(x.earnings) && Array.isArray(x.earnings_ytd)) {
    x.earnings_ytd = x.earnings_ytd.map((y) => {
      const e = x.earnings.find(z => z && z.name === y?.name);
      if (!e) return y;
      const out = { ...y };
      if (isDecimal(e.amount)) out.amount = fromCents(toCents(e.amount) * n);
      if (isDecimal(e.units)) out.units = (parseFloat(e.units) * n).toFixed(2);
      return out;
    });
  }
}

// Paystub dates are literal strings, so a scenario written months ago describes old pay. This moves
// every paystub in the payload forward by whole pay periods, keeping the amounts and the gaps
// between stubs, so the newest stub is the latest pay date on or before `today`.
export function refreshDates(payload, today) {
  const next = JSON.parse(JSON.stringify(payload || {}));
  let changed = 0;
  let skipped = 0;
  for (const emp of next.employments || []) {
    const stubs = emp.paystubs || [];
    if (!stubs.length) continue;
    const freq = emp.pay_frequency;
    const dates = stubs.map(x => x.pay_date);
    const supported = (STEP_DAYS[freq] || freq === 'SM' || freq === 'M')
      && dates.every(parseISO)
      && (freq !== 'SM' || dates.every(onSemiCalendar))
      && (freq !== 'M' || dates.every(isLastOfMonth));
    if (!supported) { skipped++; continue; }
    const latest = dates.slice().sort().at(-1);
    const target = snapPayDate(freq, today, latest);
    if (target === latest) continue;
    let move;
    if (STEP_DAYS[freq]) { const days = daysBetween(latest, target); move = (x) => addDays(x, days); }
    else if (freq === 'M') { const months = (parseISO(target).getUTCFullYear() - parseISO(latest).getUTCFullYear()) * 12 + parseISO(target).getUTCMonth() - parseISO(latest).getUTCMonth(); move = (x) => addMonths(x, months); }
    else { const steps = semiIndex(target) - semiIndex(latest); move = (x) => fromSemiIndex(semiIndex(x) + steps); }
    for (const x of stubs) {
      const was = x.pay_date;
      x.pay_date = move(was);
      if (STEP_DAYS[freq]) { for (const k of ['period_start', 'period_end']) if (parseISO(x[k])) x[k] = move(x[k]); }
      else if (x.period_start || x.period_end) { const p = periodFor(freq, x.pay_date); x.period_start = p.start; x.period_end = p.end; }
    }
    // Year-to-date totals belong to the date they sit on, so they are worked out again for the new dates.
    for (const x of stubs) restateYtd(x, freq);
    changed++;
  }
  return { payload: next, changed, skipped };
}

// --- The scenario object ---

const clone = (o) => JSON.parse(JSON.stringify(o));

export function blankScenario(overrides = {}) {
  return {
    data_source: 'payroll',
    label: '',
    description: '',
    products: [],
    enabled: true,
    username: '',
    password: '',
    provider_id: null,
    company_domain: null,
    is_refresh: null,
    behavior_status: 'done',
    behavior_error_message: '',
    behavior_duration_seconds: 0,
    behavior_mfa: {},
    payload: { employments: [] },
    ...overrides,
  };
}

export function blankEmployment(overrides = {}) {
  return {
    profile: { full_name: 'Jane Roe', ssn: '991-91-9991' },
    company: { name: 'Acme Inc.', domain: 'acme.com' },
    job_title: 'Staff Engineer',
    job_type: 'F',
    start_date: '2022-03-01',
    is_active: true,
    income: '124800.00',
    income_unit: 'YEARLY',
    income_currency: 'USD',
    pay_frequency: 'BW',
    paystubs: [],
    ...overrides,
  };
}

// Starting points for the builder. Each returns a scenario body; username and label are filled in by the caller.
export const PRESETS = [
  {
    id: 'salaried',
    name: 'Salaried, paid every two weeks',
    blurb: 'One full-time job, a yearly salary and two paystubs.',
    build: (today) => blankScenario({ payload: { employments: [blankEmployment({
      paystubs: buildPaystubs({ frequency: 'BW', count: 2, last: today, gross: '4800.00', net: '3312.00' }),
    })] } }),
  },
  {
    id: 'hourly',
    name: 'Hourly with overtime',
    blurb: 'Paid by the hour, hours vary, overtime on the latest stub.',
    build: (today) => {
      const stubs = buildPaystubs({ frequency: 'BW', count: 3, last: today, gross: '2400.00', net: '1656.00', hours: '80' });
      const last = stubs.at(-1);
      last.hours = '90.00';
      last.gross_pay = '2850.00';
      last.net_pay = '1966.50';
      last.earnings = [{ name: 'Regular', amount: '2400.00', rate: '30.00', units: '80.00' }, { name: 'Overtime', amount: '450.00', rate: '45.00', units: '10.00' }];
      return blankScenario({ payload: { employments: [blankEmployment({
        profile: { full_name: 'John Doe', ssn: '991-91-9992' }, job_title: 'Line Cook', income: '30.00', income_unit: 'HOURLY', paystubs: stubs,
      })] } });
    },
  },
  {
    id: 'two-jobs',
    name: 'Two jobs',
    blurb: 'A full-time job and a part-time job at different employers.',
    build: (today) => blankScenario({ payload: { employments: [
      blankEmployment({ paystubs: buildPaystubs({ frequency: 'BW', count: 2, last: today, gross: '4800.00', net: '3312.00' }) }),
      blankEmployment({
        company: { name: 'Northwind Retail', domain: 'northwind.com' }, job_title: 'Sales Associate', job_type: 'P',
        start_date: '2025-11-02', income: '22.50', income_unit: 'HOURLY', pay_frequency: 'W',
        paystubs: buildPaystubs({ frequency: 'W', count: 2, last: today, gross: '540.00', net: '432.00', hours: '24' }),
      }),
    ] } }),
  },
  {
    id: 'terminated',
    name: 'Employment that ended',
    blurb: 'An end date, not active. No recent pay.',
    build: () => blankScenario({ payload: { employments: [blankEmployment({
      profile: { full_name: 'Sam Doe', ssn: '991-91-9993' }, job_title: 'Warehouse Associate', start_date: '2021-06-14',
      end_date: '2026-03-31', is_active: false, income: '48000.00', pay_frequency: 'SM',
    })] } }),
  },
  {
    id: 'blank',
    name: 'Start from nothing',
    blurb: 'One job with placeholder values to change.',
    build: () => blankScenario({ payload: { employments: [blankEmployment({ paystubs: [] })] } }),
  },
];

// Quick ways to make a login fail. Each sets how the task ends, nothing else.
export const FAILURES = [
  { id: 'locked', label: 'Account locked', status: 'account_locked', message: 'Your account has been locked after too many attempts.' },
  { id: 'wrong', label: 'Wrong password', status: 'login_error', message: 'The username or password is incorrect.' },
  { id: 'config', label: 'Setup problem', status: 'config_error', message: 'Your employer has not finished setting up this connection.' },
  { id: 'empty', label: 'No records', status: 'no_data', message: '' },
  { id: 'down', label: 'Provider down', status: 'unavailable', message: 'The payroll provider is down for maintenance.' },
  { id: 'unsupported', label: 'Not supported', status: 'not_supported', message: '' },
];

export const MFA_PRESETS = [
  { id: 'code', label: 'Asks for a code', challenges: [{ type: 'TEXT', label: 'Enter the code we sent to your phone', answer: '12345' }] },
  {
    id: 'method', label: 'Code, then how to send it',
    challenges: [
      { type: 'TEXT', label: 'Enter the code we sent to your phone', answer: '12345' },
      { type: 'OPTIONS', label: 'Where should we send your code?', options: [{ value: 'sms', label: 'Text message' }, { value: 'email', label: 'Email' }], answers: ['sms', 'email'] },
    ],
  },
  {
    id: 'choice-code', label: 'How to send it, then a code',
    challenges: [
      { type: 'OPTIONS', label: 'Where should we send your code?', options: [{ value: 'sms', label: 'Text message' }, { value: 'email', label: 'Email' }], answers: ['sms', 'email'] },
      { type: 'TEXT', label: 'Enter the code we sent you', answer: '12345' },
    ],
  },
];

// What a screen holds when its type changes: the old label and answer would not make sense for the new kind.
export function retypeChallenge(c, type) {
  if (c.type === type) return c;
  return type === 'OPTIONS'
    ? { type, label: '', options: [], answers: [] }
    : { type, label: '', answer: '' };
}

// Move item `at` of a list by `by` places (-1 up, +1 down); out of range returns the list as it was.
export function moveItem(list, at, by) {
  const to = at + by;
  if (at < 0 || at >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

// --- Matching ---

// Two scenarios of one data source cannot match the same input. The API refuses a duplicate and
// names the one in the way. `is_refresh` counts here, which is how a refresh pair can share a login.
export const matchKey = (s) => [s.data_source || 'payroll', s.username || '', s.password || '', s.provider_id || '', s.company_domain || '', s.is_refresh === null || s.is_refresh === undefined ? '' : String(s.is_refresh)].join('');

// Logins Truv uses for its own test data. Custom scenarios cannot take these.
export const HARD_RESERVED = new Set(['goodlogin', 'error.user']);
export const KNOWN_LOGINS = new Set(LOGINS.map(l => l.login));

export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);

// A username from a label: "Hourly with overtime" under prefix "qa" -> "qa.hourly.with.overtime".
export function suggestUsername(label, prefix = 'qa', taken = []) {
  const p = slug(prefix);
  const l = slug(label);
  // A name that already starts with the prefix does not get it twice.
  const joined = (p && (l === p || l.startsWith(`${p}.`)) ? l : [p, l].filter(Boolean).join('.')) || 'qa.login';
  // A cut name can end on a dot, and a bare reserved word would be refused, so neither is suggested.
  const trimmed = joined.slice(0, 40).replace(/\.+$/, '') || 'qa.login';
  const base = HARD_RESERVED.has(trimmed) ? `${trimmed}.test` : trimmed;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!used.has(`${base}.${i}`)) return `${base}.${i}`;
  return base;
}

// --- Validation ---
// Mirrors the API's rules so mistakes show up as you type. The API stays the judge: anything it
// refuses is shown with its own words (see describeError).

const SSN = /^9\d\d-\d\d-\d{4}$/;
const ENUM = {
  job_type: new Set(JOB_TYPES.map(j => j[0])),
  income_unit: new Set(INCOME_UNITS),
  pay_frequency: new Set([...PAY_FREQUENCIES, ...OTHER_PAY_FREQUENCIES].map(p => p[0])),
};

// Values of the wrong type, such as a number where a name goes. A scenario pasted or edited as JSON can
// carry them, and neither the form nor the rules below can read one, so they are reported first.
export function typeProblems(s) {
  const out = [];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const nothing = (v) => v === undefined || v === null;
  const bad = (path, what) => out.push({ path, message: `${friendlyField(path) || path} should be ${what}.` });
  // Text or a number, never an object or a list: those cannot be drawn into a text box.
  const plain = (path, v) => { if (!nothing(v) && typeof v === 'object') bad(path, 'text or a number'); };
  const list = (path, v, each) => {
    if (nothing(v)) return;
    if (!Array.isArray(v)) { bad(path, 'a list'); return; }
    v.forEach((x, i) => each(x, `${path}[${i}]`));
  };
  const item = (path, x, fields) => {
    if (!isObj(x)) { bad(path, 'an object'); return false; }
    for (const k of fields) plain(`${path}.${k}`, x[k]);
    return true;
  };
  if (!isObj(s)) return [{ path: '$', message: 'A scenario should be a JSON object.' }];
  for (const k of ['label', 'description', 'username', 'password', 'provider_id', 'company_domain', 'behavior_status', 'behavior_error_message', 'data_source']) {
    if (!nothing(s[k]) && typeof s[k] !== 'string') bad(k, 'text');
  }
  if (!nothing(s.behavior_duration_seconds) && typeof s.behavior_duration_seconds !== 'number') bad('behavior_duration_seconds', 'a number');
  for (const k of ['is_refresh', 'enabled']) if (!nothing(s[k]) && typeof s[k] !== 'boolean') bad(k, 'true or false');
  list('products', s.products, (x, at) => plain(at, x));
  if (!nothing(s.behavior_mfa)) {
    if (!isObj(s.behavior_mfa)) bad('behavior_mfa', 'an object');
    else {
      list('behavior_mfa.challenges', s.behavior_mfa.challenges, (c, at) => {
        if (!item(at, c, ['type', 'label', 'answer'])) return;
        list(`${at}.options`, c.options, (o, oat) => item(oat, o, ['value', 'label']));
        list(`${at}.answers`, c.answers, (x, aat) => plain(aat, x));
      });
    }
  }
  if (!nothing(s.payload)) {
    if (!isObj(s.payload)) bad('payload', 'an object');
    else {
      list('payload.employments', s.payload.employments, (e, at) => {
        if (!item(at, e, ['job_title', 'job_type', 'income', 'income_unit', 'pay_frequency', 'pay_rate', 'start_date', 'end_date', 'original_hire_date', 'income_currency'])) return;
        if (!nothing(e.company)) item(`${at}.company`, e.company, ['name', 'domain']);
        if (!nothing(e.profile)) item(`${at}.profile`, e.profile, ['ssn', 'full_name']);
        list(`${at}.paystubs`, e.paystubs, (x, pat) => item(pat, x, ['pay_date', 'gross_pay', 'net_pay', 'gross_pay_ytd', 'net_pay_ytd', 'hours', 'period_start', 'period_end']));
        list(`${at}.w2s`, e.w2s, (x, wat) => {
          if (!item(wat, x, ['year', 'document_id'])) return;
          if (!nothing(x.fields)) item(`${wat}.fields`, x.fields, ['wages']);
        });
        list(`${at}.bank_accounts`, e.bank_accounts, (x, bat) => item(bat, x, ['bank_name', 'account_name', 'account_number', 'routing_number', 'account_type', 'deposit_type', 'deposit_value']));
        list(`${at}.shifts`, e.shifts, (x, sat) => item(sat, x, []));
      });
    }
  }
  return out;
}

export function validate(s, { others = [], self = null, requireNew = false, prefix = 'qa' } = {}) {
  const typed = typeProblems(s);
  if (typed.length) return typed.map(t => ({ level: 'error', path: t.path, message: t.message }));
  const out = [];
  const err = (path, message) => out.push({ level: 'error', path, message });
  const warn = (path, message) => out.push({ level: 'warn', path, message });

  if (!s.label || !s.label.trim()) err('label', 'Give it a name so you can find it in the list.');
  else if (s.label.length > LIMITS.label) err('label', `Keep the name under ${LIMITS.label} characters.`);
  if ((s.description || '').length > LIMITS.description) err('description', `Keep the notes under ${LIMITS.description} characters.`);

  const matchers = ['username', 'password', 'provider_id', 'company_domain'].filter(k => s[k]);
  if (!matchers.length) err('username', 'Set a username, a password, a provider or a company. Otherwise this would answer every sign-in on the account.');
  for (const k of ['username', 'password']) if ((s[k] || '').length > LIMITS.credential) err(k, `Keep it under ${LIMITS.credential} characters.`);
  if ((s.provider_id || '').length > 64) err('provider_id', 'Keep the provider under 64 characters.');
  if ((s.company_domain || '').length > 128) err('company_domain', 'Keep the website under 128 characters.');
  if (s.data_source && !DATA_SOURCES.includes(s.data_source)) err('data_source', `The data source has to be one of: ${DATA_SOURCES.join(', ')}.`);
  if (s.username && HARD_RESERVED.has(s.username.toLowerCase())) err('username', `${s.username} is one of Truv's own test logins, so the API will not accept it. Use your own name, such as ${suggestUsername(s.label, prefix)}.`);
  else if (s.username && KNOWN_LOGINS.has(s.username.toLowerCase())) warn('username', `${s.username} is also one of Truv's standard test logins. The API may refuse it, and if it does not, it will not replace the standard one.`);
  if (s.username && /\s/.test(s.username)) warn('username', 'This username has a space in it. People will have to type it exactly.');
  if (/\{\{.*\}\}/.test(`${s.username || ''}${s.password || ''}`)) warn('username', 'This looks like a template placeholder that was never filled in.');

  const status = s.behavior_status || 'done';
  if (s.behavior_status && !STATUSES.some(x => x.value === status)) err('behavior_status', 'That is not a status the API knows.');
  if ((s.behavior_error_message || '').length > LIMITS.message) err('behavior_error_message', `Keep the message under ${LIMITS.message} characters.`);
  const delay = s.behavior_duration_seconds;
  if (delay !== undefined && delay !== null && (!Number.isInteger(delay) || delay < 0 || delay > LIMITS.delay)) err('behavior_duration_seconds', `The delay is a whole number of seconds from 0 to ${LIMITS.delay}.`);

  const challenges = s.behavior_mfa?.challenges || [];
  if (challenges.length > LIMITS.mfa) err('behavior_mfa', `Up to ${LIMITS.mfa} screens.`);
  challenges.forEach((c, i) => {
    if (!['TEXT', 'OPTIONS'].includes(c.type)) err(`behavior_mfa.challenges[${i}].type`, 'A screen is either a code (TEXT) or a choice (OPTIONS).');
    if (!c.label) err(`behavior_mfa.challenges[${i}].label`, 'Say what the screen asks.');
    if (c.type === 'OPTIONS' && !(c.options || []).length) err(`behavior_mfa.challenges[${i}].options`, 'A choice needs at least one option.');
    if ((c.label || '').length > 255) err(`behavior_mfa.challenges[${i}].label`, 'Keep what it asks under 255 characters.');
    if ((c.answer || '').length > 255) err(`behavior_mfa.challenges[${i}].answer`, 'Keep the accepted code under 255 characters.');
    if ((c.options || []).length > 20) err(`behavior_mfa.challenges[${i}].options`, 'Up to 20 choices.');
    if ((c.answers || []).length > 20) err(`behavior_mfa.challenges[${i}].answers`, 'Up to 20 accepted answers.');
    if (c.answer && (c.answers || []).length) err(`behavior_mfa.challenges[${i}].answer`, 'Use a code or a list of answers, not both.');
  });
  if (challenges.length && FAILURE_STATUSES.has(status)) warn('behavior_mfa', 'This login ends in a failure, so the screens will be answered and then it fails.');

  const emps = s.payload?.employments || [];
  if (s.data_source === 'payroll' || !s.data_source) {
    if (!emps.length && !FAILURE_STATUSES.has(status)) err('payload.employments', 'Add at least one job, or make the login fail.');
    if (emps.length > LIMITS.employments) err('payload.employments', `Up to ${LIMITS.employments} jobs.`);
    emps.forEach((e, i) => validateEmployment(e, `payload.employments[${i}]`, err, warn, emps.length > 1 ? `Job ${i + 1}: ` : ''));
  }
  if (JSON.stringify(s.payload || {}).length > LIMITS.payloadBytes) err('payload', 'The data is over 1 MB.');

  if (s.is_refresh === true) {
    const sibling = others.some(o => o !== self && o.id !== self?.id && o.data_source === s.data_source && o.username === s.username && o.password === s.password && o.is_refresh !== true);
    if (!sibling) warn('is_refresh', 'This only answers refreshes. Make the original sign-in scenario too, or the first sign-in gets Truv\'s built-in data.');
  }

  // Names are unique within a data source, exactly as typed (capitals count, spaces at the ends do not).
  const name = String(s.label ?? '').trim();
  const sameName = name && others.find(o => o !== self && (!self?.id || o.id !== self.id) && (o.data_source || 'payroll') === (s.data_source || 'payroll') && String(o.label ?? '').trim() === name);
  if (sameName) err('label', `"${name}" is already the name of another scenario. Give this one a different name.`);

  const clash = others.find(o => o !== self && (!self?.id || o.id !== self.id) && matchKey(o) === matchKey(s));
  if (clash) err('username', `"${clash.label}" already answers this exact login. Change the username, the password or a matching field, or edit that one.`);
  if (requireNew && others.length >= LIMITS.scenarios) err('label', `This account is at its limit of ${LIMITS.scenarios} scenarios. Delete one first.`);

  return out;
}

const stubsAfter = (e) => (e.paystubs || []).some(p => p && parseISO(p.pay_date) && p.pay_date > e.end_date);

function validateEmployment(e, base, err, warn, who = '') {
  const date = (k) => { if (e[k] && !parseISO(e[k])) err(`${base}.${k}`, 'Use a date like 2026-03-31.'); };
  ['start_date', 'end_date', 'original_hire_date'].forEach(date);
  if (e.start_date && e.end_date && parseISO(e.start_date) && parseISO(e.end_date) && e.end_date < e.start_date) err(`${base}.end_date`, 'The end date cannot be before the start date.');
  const ssn = e.profile?.ssn;
  if (ssn && !SSN.test(ssn)) err(`${base}.profile.ssn`, 'Sandbox SSNs are made up: NNN-NN-NNNN with the first three digits from 900 to 999.');
  const given = (v) => v !== undefined && v !== null && v !== '';
  const person = e.profile;
  if (person && typeof person === 'object') {
    if (given(person.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) err(`${base}.profile.email`, 'Use an email like jane@example.com.');
    if (given(person.date_of_birth) && (!parseISO(person.date_of_birth) || person.date_of_birth > todayISO())) err(`${base}.profile.date_of_birth`, 'Use a past date like 1988-04-17.');
    if (given(person.phone) && String(person.phone).replace(/\D/g, '').length < 7) err(`${base}.profile.phone`, 'A phone number needs at least seven digits.');
    const home = person.home_address;
    if (home && typeof home === 'object') {
      if (given(home.zip) && !/^\d{5}(-\d{4})?$/.test(home.zip)) err(`${base}.profile.home_address.zip`, 'Use a ZIP code like 94105.');
      if (given(home.state) && !/^[A-Za-z]{2}$/.test(home.state)) err(`${base}.profile.home_address.state`, 'Use the two-letter state, like CA.');
    }
  }
  if (!given(e.income) && !given(e.pay_rate)) warn(`${base}.income`, `${who}No pay amount. An income report will show no pay for this job.`);
  if (given(e.income) && !isDecimal(e.income)) err(`${base}.income`, 'Use digits and a decimal point, like 124800.00.');
  else if (given(e.income) && parseFloat(e.income) <= 0) err(`${base}.income`, 'Pay has to be more than zero.');
  else if (given(e.income) && toCents(e.income) > MAX_CENTS) err(`${base}.income`, 'That amount is too large. Keep it under 1,000,000,000,000.');
  if ((e.income_currency || '').length > 3) err(`${base}.income_currency`, 'A currency is three letters, like USD.');
  if (e.job_type && !ENUM.job_type.has(e.job_type)) err(`${base}.job_type`, 'Pick one of the job types.');
  if (e.income_unit && !ENUM.income_unit.has(e.income_unit)) err(`${base}.income_unit`, 'Pick one of the income units.');
  if (e.pay_frequency && !ENUM.pay_frequency.has(e.pay_frequency)) err(`${base}.pay_frequency`, 'Pick one of the pay frequencies.');
  if (e.pay_frequency === 'A' && e.income_unit === 'YEARLY') warn(`${base}.pay_frequency`, 'Truv returns no pay frequency for a yearly salary paid "Annually". Pick the real cadence, like every two weeks.');
  if (e.pay_rate && e.income_unit && e.income_unit !== 'YEARLY') warn(`${base}.pay_rate`, 'Truv drops the pay rate unless the income is yearly.');
  if (e.end_date && parseISO(e.end_date) && stubsAfter(e)) warn(`${base}.end_date`, 'A paystub is dated after the end date.');
  if (e.is_active === true && e.end_date) warn(`${base}.is_active`, 'This has an end date but is marked active.');
  if (e.is_active === false && !e.end_date) warn(`${base}.end_date`, 'Not active, but no end date. Truv returns it as is.');
  const stubs = e.paystubs || [];
  const over = [];
  if (stubs.length > LIMITS.paystubs) err(`${base}.paystubs`, `Up to ${LIMITS.paystubs} paystubs per job.`);
  stubs.forEach((p, i) => {
    const at = `${base}.paystubs[${i}]`;
    if (!p.pay_date || !parseISO(p.pay_date)) err(`${at}.pay_date`, 'Every paystub needs a pay date like 2026-08-14.');
    for (const k of ['gross_pay', 'net_pay', 'gross_pay_ytd', 'net_pay_ytd', 'hours']) {
      if (!given(p[k])) continue;
      if (!isDecimal(p[k])) err(`${at}.${k}`, 'Use digits and a decimal point, like 4800.00.');
      else if (parseFloat(p[k]) < 0) err(`${at}.${k}`, 'This cannot be negative.');
      else if (k === 'hours' && parseFloat(p[k]) === 0) err(`${at}.${k}`, 'Hours have to be more than zero, or left empty.');
      else if (toCents(p[k]) > MAX_CENTS) err(`${at}.${k}`, 'That amount is too large. Keep it under 1,000,000,000,000.');
    }
    if (isDecimal(p.gross_pay) && isDecimal(p.net_pay) && toCents(p.net_pay) > toCents(p.gross_pay)) over.push(i);
  });
  const blank = stubs.filter(p => p && !given(p.gross_pay) && !given(p.net_pay)).length;
  if (blank) warn(`${base}.paystubs`, `${who}${blank === 1 ? 'A paystub has' : `${blank} paystubs have`} no gross or net pay.`);
  if (over.length) warn(`${base}.paystubs[${over[0]}].net_pay`, over.length === 1 ? 'Net pay is higher than gross pay.' : `Net pay is higher than gross pay on ${over.length} paystubs.`);
  if ((e.w2s || []).length > LIMITS.w2s) err(`${base}.w2s`, `Up to ${LIMITS.w2s} W-2s per job.`);
  (e.w2s || []).forEach((w, i) => {
    if (!w.document_id) err(`${base}.w2s[${i}].document_id`, 'A W-2 needs a PDF from the library, or Truv drops it.');
    if (!/^\d{4}$/.test(w.year || '')) err(`${base}.w2s[${i}].year`, 'Use a four-digit year.');
  });
  if ((e.bank_accounts || []).length > LIMITS.bankAccounts) err(`${base}.bank_accounts`, `Up to ${LIMITS.bankAccounts} bank accounts per job.`);
  (e.bank_accounts || []).forEach((a, i) => {
    if (a.deposit_type !== 'P' && a.deposit_type !== 'A') return;
    const at = `${base}.bank_accounts[${i}].deposit_value`;
    if (!given(a.deposit_value)) err(at, a.deposit_type === 'P' ? 'Say what percent of the paycheck goes here.' : 'Say how much goes here.');
    else if (!isDecimal(a.deposit_value) || parseFloat(a.deposit_value) <= 0) err(at, 'Use a number more than zero, like 25.');
    else if (a.deposit_type === 'P' && parseFloat(a.deposit_value) > 100) err(at, 'A percent cannot be more than 100.');
  });
  if ((e.shifts || []).length > LIMITS.shifts) err(`${base}.shifts`, `Up to ${LIMITS.shifts} shifts per job.`);
}

// --- Request bodies ---

// A scenario with the fields people look for first, in an order that reads top to bottom: who, how it behaves, then the data.
const KEY_ORDER = ['data_source', 'label', 'description', 'username', 'password', 'enabled', 'products', 'provider_id', 'company_domain', 'is_refresh', 'behavior_status', 'behavior_error_message', 'behavior_duration_seconds', 'behavior_mfa', 'payload'];
export function orderKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const first = KEY_ORDER.filter(k => k in obj);
  const rest = Object.keys(obj).filter(k => !KEY_ORDER.includes(k)).sort();
  return Object.fromEntries([...first, ...rest].map(k => [k, obj[k]]));
}

const dropEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));

// What to send to create a scenario: empty optional fields left out.
// An emptied date is not a date: left in, the API refuses the whole job as "wrong format".
function cleanPayload(body) {
  const emps = body.payload?.employments;
  if (Array.isArray(emps)) {
    body.payload.employments = emps.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const out = { ...e };
      for (const k of ['start_date', 'end_date', 'original_hire_date']) if (out[k] === '') delete out[k];
      // Identity details left empty in the form are not sent: an empty email or ZIP is refused as the wrong format.
      if (out.profile && typeof out.profile === 'object' && !Array.isArray(out.profile)) {
        const profile = { ...out.profile };
        for (const k of ['email', 'phone', 'date_of_birth']) if (profile[k] === '') delete profile[k];
        if (profile.home_address && typeof profile.home_address === 'object') {
          const home = Object.fromEntries(Object.entries(profile.home_address).filter(([, v]) => v !== ''));
          if (Object.keys(home).length) profile.home_address = home; else delete profile.home_address;
        }
        out.profile = profile;
      }
      return out;
    });
  }
  return body;
}

export function toCreateBody(s) {
  const body = cleanPayload(dropEmpty({ ...clone(s) }));
  delete body.id; delete body.created_at; delete body.updated_at;
  if (Array.isArray(body.products) && !body.products.length) delete body.products;
  if (body.behavior_mfa && !Object.keys(body.behavior_mfa).length) delete body.behavior_mfa;
  if (body.behavior_duration_seconds === 0) delete body.behavior_duration_seconds;
  if (body.behavior_status === 'done') delete body.behavior_status;
  return orderKeys(body);
}

// --- Export and import ---

export const BUNDLE_KIND = 'truv-sandbox-scenarios';

export function toBundle(list) {
  return { kind: BUNDLE_KIND, version: 1, scenarios: list.map(toCreateBody) };
}

// Reads what someone pasted or chose: a file from Export, a plain list of scenarios, or one scenario
// (such as a request body copied from Postman).
export function parseBundle(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, problem: 'That is not valid JSON.' }; }
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.scenarios)) list = data.scenarios;
  else if (data && typeof data === 'object' && ['label', 'username', 'payload'].some(k => k in data)) list = [data];
  else return { ok: false, problem: 'Expected a file from Export, a list of scenarios, or one scenario.' };
  if (!list.length) return { ok: false, problem: 'There are no scenarios in it.' };
  if (list.length > LIMITS.scenarios) return { ok: false, problem: `That is ${list.length} scenarios. An account holds ${LIMITS.scenarios}.` };
  const bad = list.findIndex(x => !x || typeof x !== 'object' || Array.isArray(x));
  if (bad >= 0) return { ok: false, problem: `Item ${bad + 1} is not a scenario.` };
  return { ok: true, scenarios: list.map(x => ({ data_source: 'payroll', ...toCreateBody(x) })) };
}

// What importing would do with each scenario, in order: create it, or skip it and say why. Each one is
// checked against the account and against the ones before it in the same file.
export function planImport(scenarios, existing, { update = false } = {}) {
  const placed = [...existing];
  const taken = new Set();
  return scenarios.map((body) => {
    // With "update" on, a scenario with the same name (in the same data source) changes the one on the account.
    const mine = update ? existing.find(o => (o.data_source || 'payroll') === (body.data_source || 'payroll') && String(o.label ?? '').trim() === String(body.label ?? '').trim()) : null;
    if (mine && taken.has(mine.id)) return { body, action: 'skip', reason: 'Another scenario in this file already updates the one with this name.' };
    const others = mine ? placed.filter(o => o !== mine && o.id !== mine.id) : placed;
    const problem = validate(body, { others, self: mine || null, requireNew: !mine }).find(i => i.level === 'error');
    if (problem) {
      const clash = others.find(o => matchKey(o) === matchKey(body));
      return { body, action: 'skip', reason: clash && /already answers/.test(problem.message) ? `Same login as "${clash.label}". Change the username or password.` : problem.message };
    }
    if (mine) { taken.add(mine.id); placed.splice(placed.indexOf(mine), 1, { ...mine, ...body }); return { body, action: 'update', id: mine.id, reason: '' }; }
    placed.push(body);
    return { body, action: 'create', reason: '' };
  });
}

// What to send to change one. A top-level key you send replaces the old one, so a cleared field is
// sent as null (or empty) rather than left out, or the old value would stay. data_source is fixed.
export function toUpdateBody(s) {
  const body = cleanPayload(clone(s));
  for (const k of ['id', 'created_at', 'updated_at', 'data_source', 'filenames', 'ssn_last4', 'date_of_birth', 'phone']) delete body[k];
  for (const k of ['provider_id', 'company_domain']) if (!body[k]) body[k] = null;
  // A key left out of an update keeps its old value, so a field removed from the JSON is sent as the API's own "nothing".
  if (body.password === undefined || body.password === '') body.password = null;
  if (body.description === undefined || body.description === null) body.description = '';
  if (body.behavior_error_message === undefined || body.behavior_error_message === null) body.behavior_error_message = '';
  if (body.behavior_mfa === undefined || body.behavior_mfa === null) body.behavior_mfa = {};
  if (body.behavior_duration_seconds === undefined || body.behavior_duration_seconds === null) body.behavior_duration_seconds = 0;
  if (body.behavior_status === undefined || body.behavior_status === null || body.behavior_status === '') body.behavior_status = 'done';
  if (body.is_refresh === undefined) body.is_refresh = null;
  if (body.products === undefined || body.products === null) body.products = [];
  if (body.enabled === undefined || body.enabled === null) body.enabled = true;
  return body;
}

// Copy a scenario to start another: a new name, a new login, no id.
export function duplicate(s, { label, username }) {
  const copy = clone(s);
  for (const k of ['id', 'created_at', 'updated_at']) delete copy[k];
  copy.label = label || `${s.label} (copy)`;
  copy.username = username ?? '';
  return copy;
}

// --- Describing things ---

export function summarizeScenario(s) {
  const emps = (Array.isArray(s?.payload?.employments) ? s.payload.employments : []).filter(e => e && typeof e === 'object');
  const parts = [];
  if (FAILURE_STATUSES.has(s.behavior_status)) parts.push(STATUSES.find(x => x.value === s.behavior_status)?.label || s.behavior_status);
  const screens = Array.isArray(s.behavior_mfa?.challenges) ? s.behavior_mfa.challenges.length : 0;
  if (screens) parts.push(`${screens} MFA screen${screens === 1 ? '' : 's'}`);
  if (s.behavior_duration_seconds) parts.push(`${s.behavior_duration_seconds}s delay`);
  if (emps.length) {
    const e = emps[0];
    const iu = typeof e.income_unit === 'string' ? e.income_unit : '';
    const unit = iu === 'HOURLY' ? 'Hourly' : iu === 'YEARLY' ? 'Salaried' : iu ? iu[0] + iu.slice(1).toLowerCase() : '';
    const freq = [...PAY_FREQUENCIES, ...OTHER_PAY_FREQUENCIES].find(p => p[0] === e.pay_frequency)?.[1];
    const count = (k) => emps.reduce((n, x) => n + (Array.isArray(x[k]) ? x[k].length : 0), 0);
    const stubs = count('paystubs');
    parts.push([unit, freq && freq.toLowerCase() !== unit.toLowerCase() && freq.toLowerCase()].filter(Boolean).join(', '));
    if (emps.length > 1) parts.push(`${emps.length} jobs`);
    parts.push(`${stubs} paystub${stubs === 1 ? '' : 's'}`);
    const banks = count('bank_accounts');
    const w2s = count('w2s');
    if (banks) parts.push(`${banks} bank account${banks === 1 ? '' : 's'}`);
    if (w2s) parts.push(`${w2s} W-2${w2s === 1 ? '' : 's'}`);
  }
  return parts.filter(Boolean).join(' · ');
}

export function latestPayDate(s) {
  const emps = Array.isArray(s.payload?.employments) ? s.payload.employments : [];
  const dates = emps.flatMap(e => (Array.isArray(e?.paystubs) ? e.paystubs : []).map(p => p?.pay_date)).filter(d => typeof d === 'string' && parseISO(d));
  return dates.length ? dates.sort().at(-1) : null;
}

// Things worth knowing about a scenario in a list. level: 'warn' | 'info'.
export function lint(s, today, others = []) {
  const out = [];
  if (/\{\{.*\}\}/.test(`${s.username || ''}${s.password || ''}`)) out.push({ level: 'warn', id: 'placeholder', text: 'The username is a template placeholder that was never filled in, so nobody can sign in with it.' });
  if (s.enabled === false) out.push({ level: 'info', id: 'disabled', text: "Off. Sign-ins skip it and get Truv's built-in data." });
  const last = latestPayDate(s);
  if (last && today) {
    const age = daysBetween(last, today);
    if (age > 45) out.push({ level: 'info', id: 'stale', text: `The newest paystub is from ${last}, ${age} days ago. Dates do not move on their own.` });
  }
  if (s.is_refresh === true) {
    const hasFirst = others.some(o => o.id !== s.id && o.data_source === s.data_source && o.username === s.username && o.password === s.password && o.is_refresh !== true);
    if (!hasFirst) out.push({ level: 'warn', id: 'refresh-orphan', text: 'Only answers refreshes, and nothing answers the first sign-in for this login.' });
  }
  return out;
}

// --- Errors from the API ---

const FIELD_PATHS = { employments: 'payload.employments', non_field_errors: '' };

// Turn an envelope { status, data } (or a thrown network error) into something a person can act on.
// Everything worth showing about a failure in one line: the headline, then the API's own reasons.
export function errorText(err) {
  const head = joinSentences(err.title, err.detail);
  const reasons = (err.fields || []).filter(f => f.message && !head.includes(f.message)).map((f) => {
    const where = friendlyField(f.field);
    return where ? `${where}: ${f.message}` : f.message;
  });
  return joinSentences(head, ...reasons);
}

// What to tell someone after a failure: the detail, each reason with where it applies, then what to do.
export function explain(err) {
  const reasons = (err.fields || []).filter(f => f.message && !String(err.detail || '').includes(f.message)).map((f) => {
    const where = friendlyField(f.field);
    return where ? `${where}: ${f.message}` : f.message;
  });
  return joinSentences(err.detail, ...reasons, err.hint);
}

// Sentences put together with a full stop after each, so nothing runs into the next.
export function joinSentences(...parts) {
  return parts.map(x => String(x ?? '').trim()).filter(Boolean).map(x => (/[.!?:]$/.test(x) ? x : `${x}.`)).join(' ');
}

const FIELD_NAMES = {
  end_date: 'end date', start_date: 'start date', original_hire_date: 'hire date', income: 'pay amount', income_unit: 'pay unit', pay_frequency: 'pay frequency',
  job_title: 'job title', job_type: 'job type', 'profile.ssn': 'SSN', 'profile.full_name': 'person\'s name', gross_pay: 'gross pay', net_pay: 'take-home pay',
  gross_pay_ytd: 'gross pay year to date', net_pay_ytd: 'take-home year to date', pay_date: 'pay date', document_id: 'PDF', deposit_value: 'deposit value',
};
const LIST_NAMES = { paystubs: 'Paystub', w2s: 'W-2', bank_accounts: 'Bank account', shifts: 'Shift', challenges: 'Screen', options: 'Choice', answers: 'Answer', products: 'Product' };

// An API field path in words a person would use: payload.employments.0.profile.ssn -> "Job 1, SSN".
export function friendlyField(field = '') {
  if (!field || field === 'non_field_errors' || field === '$') return '';
  const parts = String(field).replace(/\[(\d+)\]/g, '.$1').replace(/^payload\./, '').split('.');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    const index = /^\d+$/.test(parts[i + 1] ?? '') ? Number(parts[i + 1]) + 1 : null;
    if (k === 'employments') { if (index) { out.push(`Job ${index}`); i++; } else out.push('Jobs'); continue; }
    if (k === 'behavior_mfa') { out.push('Verification'); continue; }
    if (LIST_NAMES[k] && index) { out.push(`${LIST_NAMES[k]} ${index}`); i++; continue; }
    const rest = parts.slice(i).join('.');
    out.push(FIELD_NAMES[rest] || rest.replace(/[._]/g, ' '));
    break;
  }
  return out.join(', ');
}

export function describeError(env) {
  if (!env) return { title: 'Something went wrong', detail: 'No answer came back.', fields: [], hint: null };
  const status = env.status;
  if (status === 0) return { title: 'Could not reach the server', detail: 'Check your connection and try again.', fields: [], hint: null, code: 'network_error' };
  const e = env.data?.error || {};
  const code = e.code || env.error || '';
  const fields = (e.extra?.['invalid-params'] || []).map(p => ({ path: FIELD_PATHS[p.field] ?? p.field, field: p.field, message: p.message }));
  const detail = e.message || env.message || '';
  if (code === 'env_not_sandbox' || (status === 403 && !code)) return { title: 'This is a production key', detail: 'The Sandbox Data Playground only works with a sandbox key.', fields: [], hint: 'Switch to a key from the sandbox section of the Truv dashboard.', code: 'env_not_sandbox' };
  if (code === 'session_required' || status === 401) return { title: 'You are signed out', detail: 'Your session ended or the key was not accepted.', fields: [], hint: 'Sign in again.', code: 'session_required' };
  if (code === 'reserved_credential') return { title: 'That login belongs to Truv', detail, fields: [{ path: 'username', field: 'username', message: detail }], hint: 'Pick your own name, such as a short prefix and a word: acme.salaried.', code };
  if (code === 'data_source_required') return { title: 'Say which kind of data this is', detail, fields: [], hint: 'Set the data source to payroll.', code };
  if (code === 'sandbox_limit_exceeded') return { title: 'You hit a sandbox limit', detail, fields, hint: 'Delete something you no longer need, or ask Truv Support for more room.', code };
  if (code === 'resource_in_use') return { title: 'A scenario still uses this file', detail: detail || 'Remove the file from the scenarios that use it first.', fields: [], hint: 'Open those scenarios, take the file off the paystub or W-2, then delete it.', code };
  if (code === 'incorrect_parameters' || status === 400) return { title: 'Truv did not accept this', detail: detail && detail !== 'Incorrect request parameters' ? detail : (fields.length ? `${fields.length} thing${fields.length === 1 ? '' : 's'} to fix.` : 'Check the fields below.'), fields, hint: null, code: code || 'incorrect_parameters' };
  if (status === 404) return { title: 'Not found', detail: 'It may have been deleted already, here or by someone else on this account.', fields: [], hint: 'Reload the list.', code: 'not_found' };
  if (status === 429) return { title: 'Too many requests', detail: 'Wait a few seconds and try again.', fields: [], hint: null, code: 'rate_limited' };
  if (status >= 500 || status === 502) return { title: 'Truv did not answer', detail: 'The request failed on the way to Truv.', fields: [], hint: 'Try again in a moment.', code: 'server_error' };
  return { title: 'The request failed', detail: detail || `Status ${status}`, fields, hint: null, code };
}

// --- Reading a run ---

// Where a run stands, from the user's tasks and the order. `settled` is true once nothing is still working.
const newestFirst = (list) => [...list].sort((x, y) => String(y?.pay_date || '').localeCompare(String(x?.pay_date || '')));

function readEmployment(e) {
  const statements = Array.isArray(e.statements) ? e.statements : [];
  return {
    company: e.company?.name || e.company_name || '',
    title: e.job_title || '',
    jobType: e.job_type || '',
    active: e.is_active,
    startDate: e.start_date || '',
    endDate: e.end_date || '',
    income: e.income, incomeUnit: e.income_unit, payFrequency: e.pay_frequency,
    statements: statements.length,
    latest: newestFirst(statements)[0] || null,
    profile: e.profile || null,
    raw: e,
  };
}

// Where a run stands, from the user's tasks and the order. With one employer the answer is that employer's. With
// several (one login each), a task belongs to the employer whose link it ran on, and the run is settled only when
// every one of them is, and ok only when all of them worked.
// `names` is the order the employers were made in. Truv lists them in its own order, so they are put back in ours.
export function readRun({ tasks = [], order = null, names = null } = {}) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const listed = Array.isArray(order?.employers) ? order.employers : [];
  const rank = (e) => { const at = names ? names.indexOf(e?.company_name) : -1; return at < 0 ? names?.length ?? 0 : at; };
  const emps = Array.isArray(names) && names.length > 1 ? [...listed].sort((a, b) => rank(a) - rank(b)) : listed;
  const many = emps.length > 1;
  const one = (emp, mine) => {
    const task = mine.length ? mine[mine.length - 1] : null;
    const status = task?.status || (many ? emp?.last_task_status : null) || null;
    return {
      company: emp?.company_name || '',
      status,
      settled: !!status && TERMINAL_STATUSES.has(status),
      ok: status === 'done',
      errorMessage: task?.error_message || null,
      employments: (emp?.employments || order?.employments || []).map(readEmployment),
      suborderStatus: emp?.last_task_status || emp?.status || null,
    };
  };
  const employers = many
    ? emps.map(emp => one(emp, taskList.filter(t => t.link_id && t.link_id === emp.link_id)))
    : [one(emps[0] || null, taskList)];
  const settled = employers.every(x => x.settled);
  const ok = employers.every(x => x.ok);
  const failed = employers.find(x => x.settled && !x.ok);
  const status = many
    ? (employers.every(x => x.status === employers[0].status) ? employers[0].status : (failed?.status || employers.find(x => !x.settled)?.status || null))
    : employers[0].status;
  return {
    status, settled, ok,
    errorMessage: (many ? failed?.errorMessage : employers[0].errorMessage) || null,
    employments: employers.flatMap((x, employerIndex) => x.employments.map(e => ({ ...e, employerIndex }))),
    employers,
    statuses: taskList.map(t => t.status),
    suborderStatus: employers[0].suborderStatus,
  };
}

// Does signing in with these need the real widget (a person has to type a code)?
export function needsWidget({ login = '', password = '', scenario = null } = {}) {
  if (scenario && (scenario.behavior_mfa?.challenges || []).length) return true;
  if (login === 'goodlogin' && /^mfa/.test(password)) return true;
  return false;
}

// What to type on the verification screen of the standard MFA logins (from the Truv docs).
const STANDARD_MFA = { mfa: ['type 12345'], mfa_captcha: ['type 9M4BP'], mfa_select: ['choose any method'] };
export const standardMfaSteps = (login, password) => (login === 'goodlogin' ? STANDARD_MFA[password] || [] : []);

// A status in plain words. Task statuses use snake_case, which is not for people.
export function statusName(status) {
  if (!status) return '';
  if (status === 'mfa') return 'Asks to verify';
  return STATUSES.find(x => x.value === status)?.label || String(status).replace(/_/g, ' ');
}

// The status a login should end with, as far as we can tell without running it.
export function expectedStatus({ login = '', password = '', scenario = null, status = null } = {}) {
  if (scenario) return scenario.behavior_status || 'done';
  if (status) return status === 'mfa' ? 'done' : status;
  const known = LOGINS.find(l => l.login === login && l.password === password);
  // The catalog marks the MFA logins 'mfa' for the screen they stop at; once it is answered they work.
  if (known) return known.status === 'mfa' ? 'done' : known.status;
  if (login === 'error.user') return password;
  // Nothing answers this sign-in, so Truv does: an unknown login is refused.
  return 'login_error';
}

// The scenario that would answer this sign-in, if one is switched on and matches both login and password.
export function scenarioForLogin(scenarios, login, password, { refresh = false } = {}) {
  if (!login) return null;
  return (scenarios || []).find(s => (s.data_source || 'payroll') === 'payroll' && s.enabled !== false
    && s.username === login && (s.password || '') === (password || '') && (s.is_refresh === true) === refresh) || null;
}

// --- Passing or failing a run ---

const authoredMessage = (scenario) => String(scenario?.behavior_error_message || '').trim();

// Did this run do what the scenario said it would? { verdict: 'pass' | 'fail' | 'pending', reasons: [...], notes: [...], rows }
// `scenario` is only passed when it really answers the typed login; with none, only the status is checked.
export function judge({ scenario = null, expected = null, run = null, product = 'income', refresh = false } = {}) {
  if (!run || !run.settled) return { verdict: 'pending', reasons: [], notes: [], rows: [] };
  const reasons = [];
  const notes = [];
  const want = expected || 'done';
  if (run.status !== want) reasons.push(`Expected ${statusName(want)}, got ${statusName(run.status) || 'no status'}.`);
  const rows = want === 'done' && run.ok && scenario ? compareToScenario(scenario, run, { product, refresh }) : [];
  for (const row of rows) if (!row.same) reasons.push(`${row.label}: expected ${row.authored || 'nothing'}, got ${row.returned || 'nothing'}.`);
  if (want !== 'done' && scenario) {
    const wrote = authoredMessage(scenario);
    if (wrote && run.errorMessage && run.errorMessage.trim() !== wrote) notes.push(`Truv returned "${run.errorMessage}" while the scenario says "${wrote}".`);
    if (wrote && !run.errorMessage) notes.push(`The scenario has a failure message ("${wrote}") but the task returned none.`);
  }
  return { verdict: reasons.length ? 'fail' : 'pass', reasons, notes, rows };
}

// --- Before and after a refresh ---

const money = (x) => (x === undefined || x === null || x === '' ? '' : String(x));

// What changed between two runs of the same login, job by job: pay, dates, paystubs.
export function refreshDiff(before, after, { product = 'income' } = {}) {
  const a = before?.employments || [];
  const b = after?.employments || [];
  const used = new Set();
  const pairs = a.map((x) => {
    let at = b.findIndex((y, i) => !used.has(i) && y.company === x.company);
    if (at < 0) at = b.findIndex((_, i) => !used.has(i));
    if (at >= 0) used.add(at);
    return [x, at >= 0 ? b[at] : null];
  });
  b.forEach((y, i) => { if (!used.has(i)) pairs.push([null, y]); });
  const rows = [];
  pairs.forEach(([x, y], n) => {
    const prefix = pairs.length > 1 ? `Job ${n + 1}: ` : '';
    const add = (label, was, now) => rows.push({ label: `${prefix}${label}`, before: money(was), after: money(now), changed: money(was) !== money(now) });
    const pay = (e) => (e ? `${money(e.income)} ${String(e.incomeUnit || '').toLowerCase()}`.trim() : '');
    const yes = (e) => (e ? (e.active === false ? 'No' : 'Yes') : '');
    add('Employer', x?.company, y?.company);
    add('Job title', x?.title, y?.title);
    if (product !== 'employment') add('Pay amount', pay(x), pay(y));
    if (product !== 'employment') add('Pay frequency', x ? payFrequencyLabel(x.payFrequency) : '', y ? payFrequencyLabel(y.payFrequency) : '');
    add('Still employed', yes(x), yes(y));
    add('End date', x?.endDate, y?.endDate);
    if (product !== 'employment') {
      add('Paystubs', x?.statements, y?.statements);
      add('Newest paystub date', x?.latest?.pay_date, y?.latest?.pay_date);
      add('Newest gross pay', x?.latest?.gross_pay, y?.latest?.gross_pay);
      add('Newest take-home', x?.latest?.net_pay, y?.latest?.net_pay);
    }
  });
  return rows;
}

// --- Suite results ---

const csvCell = (v) => {
  let t = String(v ?? '');
  // A cell that starts with = + - @ would run as a formula when the file is opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const SUITE_COLUMNS = ['Scenario', 'Login', 'Expected', 'Result', 'Verdict', 'Seconds', 'Order id', 'Notes'];

export function suiteRow(r) {
  return {
    Scenario: r.label || '', Login: r.login || '', Expected: statusName(r.expected) || '', Result: statusName(r.status) || (r.skipped ? 'Not run' : ''),
    Verdict: r.skipped ? 'Skipped' : r.verdict === 'pass' ? 'Pass' : r.verdict === 'fail' ? 'Fail' : r.verdict === 'error' ? 'Could not run' : '',
    Seconds: r.seconds ?? '', 'Order id': r.orderId || '', Notes: [r.skipped, ...(r.reasons || []), r.note].filter(Boolean).join(' ') ,
  };
}

export function suiteCsv(results) {
  return [SUITE_COLUMNS.join(','), ...results.map(r => { const row = suiteRow(r); return SUITE_COLUMNS.map(c => csvCell(row[c])).join(','); })].join('\n');
}

// Scenarios the suite can run on its own: switched on, payroll, with a login and password, and nobody has to type a code.
export function suiteSkip(s) {
  if (s.enabled === false) return 'Switched off.';
  if ((s.data_source || 'payroll') !== 'payroll') return 'Not a payroll scenario.';
  if (!s.username) return 'Needs a login.';
  if (s.is_refresh === true) return 'Only answers refreshes.';
  if (s.provider_id || s.company_domain) return 'Only answers one provider or employer, so a sign-in here would not match it.';
  if ((s.behavior_mfa?.challenges || []).length) return 'Asks for a code, which only Bridge can answer.';
  return '';
}

// One line of a suite from a scenario you made.
export function suiteItemFromScenario(s) {
  return { key: s.id, label: s.label, login: s.username || '', password: s.password || 'password', scenario: s, expected: expectedStatus({ scenario: s }), skip: suiteSkip(s) };
}

// One line of a suite from a standard login (a row of the catalog).
export function suiteItemFromLogin(l) {
  return { key: `${l.login}/${l.password}`, label: `${l.login} / ${l.password}`, login: l.login, password: l.password, scenario: null, expected: expectedStatus({ login: l.login, password: l.password, status: l.status }), skip: '' };
}

// --- Finding scenarios ---

const SYNONYMS = { terminated: ['ended', 'not active', 'former'], ended: ['terminated'], fail: ['error', 'failure'], hourly: ['overtime'], mfa: ['code', 'verify', 'verification'] };

// Everything a person might type to find a scenario: its fields, its employers, and what it does.
const safelySummary = (s) => { try { return summarizeScenario(s); } catch { return ''; } };
export function searchText(s) {
  const emps = (Array.isArray(s?.payload?.employments) ? s.payload.employments : []).filter(e => e && typeof e === 'object');
  const parts = [s.label, s.username, s.password, s.description, s.provider_id, s.company_domain,
    ...emps.flatMap(e => [e.company?.name, e.company?.domain, e.job_title, e.profile?.full_name]),
    statusName(s.behavior_status || 'done'), safelySummary(s), (s.behavior_mfa?.challenges || []).length ? 'mfa code verify' : '',
    emps.some(e => e.is_active === false || e.end_date) ? 'terminated ended' : '', s.is_refresh ? 'refresh' : ''];
  return parts.filter(Boolean).join('\n').toLowerCase();
}

export function matchesQuery(s, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = searchText(s);
  const words = q.split(/\s+/);
  return words.every(w => hay.includes(w) || (Object.hasOwn(SYNONYMS, w) ? SYNONYMS[w] : []).some(x => hay.includes(x)));
}

export const SORTS = [['name', 'Name'], ['updated', 'Recently updated'], ['login', 'Login']];
export function sortScenarios(list, by = 'name') {
  const cmp = {
    name: (a, b) => String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base', numeric: true }),
    login: (a, b) => String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base', numeric: true }),
    updated: (a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')),
  }[by] || (() => 0);
  return [...list].sort(cmp);
}

// --- Sharing ---

// The curl command that would create this scenario, with placeholders where the keys go.
export function toCurl(body) {
  return [
    "curl --request POST \\",
    "  --url https://prod.truv.com/v1/sandbox/scenarios/ \\",
    "  --header 'X-Access-Client-Id: YOUR_TRUV_CLIENT_ID' \\",
    "  --header 'X-Access-Secret: YOUR_TRUV_SANDBOX_SECRET' \\",
    "  --header 'Content-Type: application/json' \\",
    `  --data '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`,
  ].join('\n');
}

const API_BASE = 'https://prod.truv.com/v1';

// A shell script that creates every scenario with curl. The keys come from the environment, never from this file.
export function toCurlScript(list) {
  const lines = ['#!/usr/bin/env bash', '# Creates sandbox scenarios. Set TRUV_CLIENT_ID and TRUV_SANDBOX_SECRET first.', 'set -euo pipefail', ''];
  list.forEach((s, i) => {
    const body = toCreateBody(s);
    lines.push(`# ${i + 1}. ${String(body.label || '').replace(/[\r\n]+/g, ' ')}`);
    lines.push(`curl --fail-with-body --request POST \\`, `  --url ${API_BASE}/sandbox/scenarios/ \\`, "  --header \"X-Access-Client-Id: $TRUV_CLIENT_ID\" \\", "  --header \"X-Access-Secret: $TRUV_SANDBOX_SECRET\" \\", "  --header 'Content-Type: application/json' \\", `  --data '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`, 'echo', '');
  });
  return lines.join('\n');
}

// A Postman collection (v2.1) with one create request per scenario, the keys as variables.
export function toPostman(list, name = 'Truv sandbox scenarios') {
  return {
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'client_id', value: '' }, { key: 'sandbox_secret', value: '' }],
    item: list.map((s) => {
      const body = toCreateBody(s);
      return {
        name: body.label || 'Scenario',
        request: {
          method: 'POST',
          header: [{ key: 'X-Access-Client-Id', value: '{{client_id}}' }, { key: 'X-Access-Secret', value: '{{sandbox_secret}}' }, { key: 'Content-Type', value: 'application/json' }],
          url: { raw: `${API_BASE}/sandbox/scenarios/`, protocol: 'https', host: ['prod', 'truv', 'com'], path: ['v1', 'sandbox', 'scenarios', ''] },
          body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } },
        },
      };
    }),
  };
}

// "3 minutes ago", for the list of deleted scenarios.
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'a moment ago';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// --- Starting amounts for generated paystubs ---

export const PERIODS_PER_YEAR = { W: 52, BW: 26, SM: 24, M: 12 };

// Gross, take-home and hours for one paystub, worked out from the employment's income and pay
// frequency. They are a starting point to edit: take-home assumes 70% of gross, and an hourly
// worker is assumed to work 40 hours a week.
export function defaultStubAmounts(emp) {
  const ppy = PERIODS_PER_YEAR[emp?.pay_frequency];
  const income = parseFloat(emp?.income);
  if (!ppy || !isFinite(income)) return { gross: '', net: '', hours: '' };
  const perYear = { YEARLY: income, MONTHLY: income * 12, WEEKLY: income * 52, DAILY: income * 260 }[emp.income_unit];
  let gross; let hours = '';
  if (emp.income_unit === 'HOURLY') {
    const h = (40 * 52) / ppy;
    hours = h.toFixed(2);
    gross = income * h;
  } else if (perYear !== undefined) {
    gross = perYear / ppy;
  } else return { gross: '', net: '', hours: '' };
  return { gross: gross.toFixed(2), net: (Math.round(gross * 70) / 100).toFixed(2), hours };
}

// --- PDF library ---

// The ids of the library files a scenario points at (paystub PDFs and W-2s).
export function documentRefs(s) {
  const ids = new Set();
  for (const e of s?.payload?.employments || []) {
    for (const p of e.paystubs || []) if (p.document_id) ids.add(p.document_id);
    for (const w of e.w2s || []) if (w.document_id) ids.add(w.document_id);
  }
  return ids;
}

// Which scenarios use this file.
export const usedBy = (docId, scenarios) => (scenarios || []).filter(s => documentRefs(s).has(docId));

// --- Comparing what was authored with what came back ---

// Truv drops legal endings from company names, so "Acme Inc." is read back as "Acme".
export const stripLegalSuffix = (name) => String(name || '').replace(/[,\s]+(inc|llc|l\.l\.c|ltd|corp|corporation|co|company)\.?$/i, '').trim();

// Line up each job of a scenario with the job a run returned for it (by employer name, then by position).
// Each row: { label, authored, returned, same }. With more than one job the labels say which. An employment-only run
// returns no pay and no paystubs, so those rows are left out for it.
export function compareToScenario(scenario, run, { product = 'income', refresh = false } = {}) {
  const authored = (Array.isArray(scenario?.payload?.employments) ? scenario.payload.employments : []).filter(e => e && typeof e === 'object');
  const returned = run?.employments || [];
  if (!authored.length || !returned.length) return [];
  const withPay = product !== 'employment';
  const same = (a, b) => parseFloat(a) === parseFloat(b);
  const used = new Set();
  const rows = [];
  authored.forEach((a, n) => {
    const name = stripLegalSuffix(a.company?.name);
    let at = returned.findIndex((r, i) => !used.has(i) && String(r.company || '').trim() === name);
    if (at < 0) at = returned.findIndex((_, i) => !used.has(i));
    const r = at >= 0 ? returned[at] : null;
    if (at >= 0) used.add(at);
    const prefix = authored.length > 1 ? `Job ${n + 1}: ` : '';
    const add = (label, wrote, got, ok) => rows.push({ label: `${prefix}${label}`, authored: wrote ?? '', returned: got ?? '', same: ok ?? (String(wrote ?? '') === String(got ?? '')) });
    if (!r) { add('Employer', a.company?.name, 'Not returned', false); return; }
    add('Employer', a.company?.name, r.company, name === String(r.company || '').trim());
    if (a.job_title) add('Job title', a.job_title, r.title);
    if (a.start_date) add('Start date', a.start_date, r.startDate);
    if (a.end_date) add('End date', a.end_date, r.endDate);
    add('Still employed', a.is_active === false ? 'No' : 'Yes', r.active === false ? 'No' : 'Yes');
    if (withPay && a.pay_frequency) add('Pay frequency', payFrequencyLabel(a.pay_frequency), payFrequencyLabel(r.payFrequency), a.pay_frequency === r.payFrequency);
    if (withPay && a.income) add('Pay amount', `${a.income} ${String(a.income_unit || '').toLowerCase()}`.trim(), r.income === undefined ? '' : `${r.income} ${String(r.incomeUnit || '').toLowerCase()}`.trim(), same(a.income, r.income) && String(a.income_unit || '').toUpperCase() === String(r.incomeUnit || '').toUpperCase());
    const stubs = (Array.isArray(a.paystubs) ? a.paystubs : []).filter(x => x && typeof x === 'object');
    if (withPay && stubs.length) {
      // A refresh adds its paystubs to the ones already there, so it can only return more than it was given.
      add(refresh ? 'Paystubs (a refresh adds to the old ones)' : 'Paystubs', stubs.length, r.statements, refresh ? r.statements >= stubs.length : stubs.length === r.statements);
      const newest = newestFirst(stubs)[0];
      const got = r.latest || {};
      if (newest.pay_date) add('Newest paystub date', newest.pay_date, got.pay_date || '');
      if (newest.gross_pay) add('Newest gross pay', newest.gross_pay, got.gross_pay ?? '', same(newest.gross_pay, got.gross_pay));
      if (newest.net_pay) add('Newest take-home', newest.net_pay, got.net_pay ?? '', same(newest.net_pay, got.net_pay));
      if (newest.hours) add('Newest hours', newest.hours, got.hours ?? '', same(newest.hours, got.hours));
      const isOvertime = (x) => /overtime/i.test(x?.name || '');
      const overtime = (Array.isArray(newest.earnings) ? newest.earnings : []).find(isOvertime);
      if (overtime?.amount) add('Newest overtime', overtime.amount, (Array.isArray(got.earnings) ? got.earnings : []).find(isOvertime)?.amount ?? '', same(overtime.amount, (Array.isArray(got.earnings) ? got.earnings : []).find(isOvertime)?.amount));
    }
  });
  return rows;
}
