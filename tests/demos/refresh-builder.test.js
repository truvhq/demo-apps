import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  suborders, deriveOrderStatus, classifyRefreshOutcomePerSuborder, rollupRefreshOutcome,
  REAUTH_STATUSES, NON_REAUTH_FAILURE_STATUSES, PROVIDER_BLOCKED_STATUSES,
  classifyRefreshOutcome,
} from '../../server/routes/renewals-refresh.js';
import {
  CAPTURED_RUN, RUN_LANES, RUN_SPAN, LISTENER_MODES, CORRELATION,
  OUTCOMES, OUTCOME_CLASSES, GATES, REFRESH_VS_NEW, DELIVERY,
  PROGRAM_TABLE, PROGRAM_RISKS, PROGRAM_SCRIPTS, STEPS, SCOPE_LIMITS, IDENTITY, OPEN_QUESTIONS,
  SCOPING, NEW_ORDER_PROOF, LIMITS, CORRELATION, REFRESH_VS_NEW as RVN,
} from '../../src/demos/scaffolding/refresh-builder.jsx';
import * as GuideContent from '../../src/demos/scaffolding/refresh-builder.jsx';
import { BASICS } from '../../src/demos/scaffolding/refresh-builder.jsx';

// ---------------------------------------------------------------------------
// Orders & Refresh Lifecycle
//
// The fixtures below are the real shapes captured against sandbox on 2026-09-17
// (REFRESH-FINDINGS.md): one income order, three connected employers, refreshed
// once. Home Depot refreshed; Kroger returned mfa_error; Walmart login_error.
//
// The load-bearing detail, and the reason most of these tests exist: on the
// REFRESH order a failed suborder comes back with link_id: null and
// access_token: null. So the rows that most need resolving are exactly the ones
// the refresh order cannot identify on its own.
// ---------------------------------------------------------------------------

const REFRESH_ID = '391674aa99a24057b767fe60e2632cbe';
const ORIGINAL_ID = '4272acbd523e485593f1250d8289b65a';

// The original order: every employer has a stable link and a token.
const ORIGINAL_ORDER = {
  id: ORIGINAL_ID,
  completed_at: '2026-09-17T11:24:34Z',
  employers: [
    { id: 'e13c392c', company_name: 'Home Depot', status: 'completed', last_task_status: 'done', link_id: 'c425123d', access_token: 'tok-hd' },
    { id: '10a06a90', company_name: 'Kroger', status: 'completed', last_task_status: 'done', link_id: '71b10773', access_token: 'tok-kr' },
    { id: 'c24a34ae', company_name: 'Walmart', status: 'completed', last_task_status: 'done', link_id: 'f9d9b42b', access_token: 'tok-wm' },
  ],
};

// The refresh order: new suborder ids; the two failures have no link and no token.
const REFRESH_ORDER = {
  id: REFRESH_ID,
  initial_order: ORIGINAL_ID,
  completed_at: null,
  employers: [
    { id: 'a20c8885', company_name: 'Walmart', status: 'sent', last_task_status: null, link_id: null, access_token: null },
    { id: '6cbebfad', company_name: 'Kroger', status: 'sent', last_task_status: null, link_id: null, access_token: null },
    { id: '1f99c219', company_name: 'Home Depot', status: 'completed', last_task_status: 'done', link_id: 'c425123d', access_token: 'tok-hd' },
  ],
};

// GET /v1/tasks/?user_id= — the only place the reason lives, keyed by link_id.
const TASKS = [
  { id: '25ee65f6', order_id: REFRESH_ID, link_id: 'f9d9b42b', status: 'login_error', product_type: 'income', error_message: 'Username or password is incorrect' },
  { id: '159f3ecd', order_id: REFRESH_ID, link_id: '71b10773', status: 'mfa_error', product_type: 'income', error_message: 'unanswered question: Session has expired. New MFA token is required.' },
  { id: '93a70919', order_id: REFRESH_ID, link_id: 'c425123d', status: 'done', product_type: 'income', error_message: null },
  { id: 'ba97205f', order_id: ORIGINAL_ID, link_id: 'f9d9b42b', status: 'done', product_type: 'income', error_message: null },
];

const refreshFailed = (employerId, status) => ({
  event_type: 'order-refresh-failed',
  payload: JSON.stringify({ order_id: REFRESH_ID, employer_id: employerId, status, product: 'income', link_id: null, data_source: null }),
});

const byName = (rows, n) => rows.find(r => r.company_name === n);

describe('resolving a partial refresh with NO webhook delivery', () => {
  // This is the case that was silently broken: on localhost Truv cannot POST a
  // webhook, so every row has to resolve from task state. The failed rows have no
  // link_id on the refresh order, so the join has to reach back to the original.
  const resolve = () => classifyRefreshOutcomePerSuborder({
    truvOrderId: REFRESH_ID,
    orderData: REFRESH_ORDER,
    originalOrderData: ORIGINAL_ORDER,
    webhooks: [],
    tasks: TASKS,
  });

  it('resolves all three connections from task state alone', () => {
    const rows = resolve();
    expect(rows.every(r => r.state !== 'refreshing')).toBe(true);
  });

  it('recovers the stable link_id for a failed row that has none', () => {
    const wm = byName(resolve(), 'Walmart');
    expect(wm.link_id).toBe('f9d9b42b');
    expect(wm.state).toBe('reauth_required');
    expect(wm.reason).toBe('login_error');
    expect(wm.errorMessage).toBe('Username or password is incorrect');
    expect(wm.source).toBe('task');
  });

  it('gives each connection its own verdict, not the order\'s', () => {
    const rows = resolve();
    expect(byName(rows, 'Home Depot').state).toBe('refreshed');
    expect(byName(rows, 'Kroger').reason).toBe('mfa_error');
    expect(byName(rows, 'Walmart').reason).toBe('login_error');
  });

  it('hangs those rows if the original order is withheld — the old bug', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: REFRESH_ID, orderData: REFRESH_ORDER, webhooks: [], tasks: TASKS,
    });
    expect(byName(rows, 'Walmart').state).toBe('refreshing');
    expect(byName(rows, 'Home Depot').state).toBe('refreshed');
  });

  it('ignores tasks belonging to the original order', () => {
    // ba97205f is a `done` task on the ORIGINAL order for Walmart's link. Letting
    // it match would report the failed connection as refreshed.
    expect(byName(resolve(), 'Walmart').state).not.toBe('refreshed');
  });
});

describe('resolving with webhooks', () => {
  it('uses order-refresh-failed when it arrives, keyed per employer', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: REFRESH_ID, orderData: REFRESH_ORDER, originalOrderData: ORIGINAL_ORDER,
      webhooks: [refreshFailed('a20c8885', 'login_error'), refreshFailed('6cbebfad', 'mfa_error')],
    });
    expect(byName(rows, 'Walmart').source).toBe('order-refresh-failed');
    expect(byName(rows, 'Kroger').reason).toBe('mfa_error');
  });

  it('keeps provider-class failures out of the re-auth bucket', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: REFRESH_ID, orderData: REFRESH_ORDER, originalOrderData: ORIGINAL_ORDER,
      webhooks: [refreshFailed('a20c8885', 'no_data'), refreshFailed('6cbebfad', 'unavailable')],
    });
    expect(byName(rows, 'Walmart').state).toBe('failed_other');
    expect(byName(rows, 'Kroger').state).toBe('failed_other');
  });
});

describe('order status', () => {
  it('is derived from suborders — the order object has no status field', () => {
    expect(deriveOrderStatus(REFRESH_ORDER)).toBe('sent');
    expect(deriveOrderStatus(ORIGINAL_ORDER)).toBe('completed');
  });

  it('reports the order incomplete while a connection is unresolved', () => {
    const roll = rollupRefreshOutcome(classifyRefreshOutcomePerSuborder({
      truvOrderId: REFRESH_ID, orderData: REFRESH_ORDER, originalOrderData: ORIGINAL_ORDER, tasks: TASKS,
    }));
    expect(roll.complete).toBe(false);
    expect(roll.counts).toEqual({ refreshed: 1, reauth_required: 2, failed_other: 0, refreshing: 0 });
    expect(roll.resolvedBy).toBe('order-refresh-failed');
  });
});

describe('suborders', () => {
  it('preserves each connection\'s own access_token', () => {
    expect(suborders(ORIGINAL_ORDER).map(r => r.access_token)).toEqual(['tok-hd', 'tok-kr', 'tok-wm']);
  });
  it('reports null tokens on the refresh order\'s failed rows', () => {
    const rows = suborders(REFRESH_ORDER);
    expect(rows.find(r => r.company_name === 'Walmart').access_token).toBeNull();
  });
});

describe('the captured run shown in the UI', () => {
  it('every event belongs to a declared lane', () => {
    const keys = new Set(RUN_LANES.map(l => l.key));
    for (const e of CAPTURED_RUN) expect(keys.has(e.lane), `unknown lane ${e.lane}`).toBe(true);
  });

  it('fits the axis and is ordered in time', () => {
    for (const e of CAPTURED_RUN) expect(e.t).toBeLessThanOrEqual(RUN_SPAN);
    const ts = CAPTURED_RUN.map(e => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it('shows the failures landing before the success — the whole point', () => {
    const fails = CAPTURED_RUN.filter(e => e.event === 'order-refresh-failed');
    const completed = CAPTURED_RUN.find(e => e.event === 'order-status-updated' && e.status === 'completed');
    expect(fails.length).toBe(2);
    for (const f of fails) expect(f.t).toBeLessThan(completed.t);
  });

  it('marks the misleading completed event as the trap', () => {
    const completed = CAPTURED_RUN.find(e => e.status === 'completed');
    expect(completed.trap).toBe(true);
  });

  it('the naive listener mode really does hide both failures', () => {
    const naive = LISTENER_MODES.find(m => m.key === 'naive');
    expect(naive.tone).toBe('bad');
    // It receives order-status-updated, which includes a `completed`.
    expect(CAPTURED_RUN.some(e => e.event === 'order-status-updated' && e.status === 'completed')).toBe(true);
  });
});

describe('content correctness', () => {
  // The previous version of this demo taught that a failed refresh emits no
  // further order-status-updated and the order "sits at sent". The capture
  // falsified it. This guards the regression.
  it('never repeats the falsified "no further event" claim', () => {
    const all = JSON.stringify([
      CAPTURED_RUN, LISTENER_MODES, CORRELATION, OUTCOMES, GATES, REFRESH_VS_NEW,
      DELIVERY, PROGRAM_TABLE, PROGRAM_RISKS, STEPS,
    ]);
    expect(all).not.toMatch(/sits at sent/i);
    expect(all).not.toMatch(/no further order-status-updated/i);
    expect(all).not.toMatch(/never changes the order status/i);
  });

  it('never recommends adding an employer to an existing order', () => {
    const advice = JSON.stringify([GATES, DELIVERY, STEPS, PROGRAM_TABLE]);
    expect(advice).not.toMatch(/employers\/'/);
    // The gates must route new employment to a new order instead.
    expect(GATES.some(g => /new job|new one/i.test(g.when) && g.then === 'New order')).toBe(true);
  });

  it('documents every status the server can route', () => {
    const documented = OUTCOMES.map(o => o.status);
    for (const st of [...REAUTH_STATUSES, ...NON_REAUTH_FAILURE_STATUSES]) {
      expect(documented, `${st} is routable but undocumented`).toContain(st);
    }
    expect(documented).toContain('done');
  });

  it('gives every outcome a plain-English name and a class', () => {
    for (const o of OUTCOMES) {
      expect(o.plain).toBeTruthy();
      expect(o.action).toBeTruthy();
      expect(OUTCOME_CLASSES[o.cls], `${o.status} has an unknown class`).toBeTruthy();
    }
  });

  it('flags the ambiguous statuses and only those', () => {
    expect(OUTCOMES.filter(o => o.ambiguous).map(o => o.status).sort())
      .toEqual(['login_error', 'mfa_error', 'session_expired']);
  });

  it('never tells anyone to re-auth a provider-side failure', () => {
    for (const o of OUTCOMES.filter(x => x.cls !== 'credential')) {
      expect(o.action, `${o.status}`).not.toMatch(/send the refresh order link/i);
    }
  });

  it('guards no_data against being read as zero income', () => {
    expect(OUTCOMES.find(o => o.status === 'no_data').action).toMatch(/never record as \$0/i);
  });

  it('only cites sandbox credentials that were captured', () => {
    const known = ['goodlogin', 'goodlogin.pll.reauth', 'goodlogin.pll.expired', 'goodlogin.pll.config_error'];
    for (const o of OUTCOMES.filter(x => x.cred)) expect(known).toContain(o.cred.u);
  });

  it('states what the capture did not cover', () => {
    // The guide must not read as broader than its evidence. The run was income-only
    // on payroll connections, so bank behaviour is explicitly disclaimed.
    expect(SCOPE_LIMITS.length).toBeGreaterThanOrEqual(3);
    expect(SCOPE_LIMITS.join(' ')).toMatch(/income only/i);
    expect(SCOPE_LIMITS.join(' ')).toMatch(/financial_accounts/);
    expect(OPEN_QUESTIONS.join(' ')).toMatch(/bill/i);
  });

  it('tells you to anchor on the original order and never on employer_id', () => {
    const keys = IDENTITY.keep.map(k => k.what);
    expect(keys).toContain('external_user_id');
    expect(keys.join(' ')).toMatch(/original order id/);
    expect(keys.join(' ')).toMatch(/link_id/);
    expect(IDENTITY.avoid).toMatch(/employer_id/);
  });

  it('covers both delivery shapes', () => {
    expect(DELIVERY.map(d => d.key).sort()).toEqual(['embedded', 'sms']);
    for (const d of DELIVERY) { expect(d.when).toBeTruthy(); expect(d.calls.length).toBeGreaterThan(0); expect(d.con).toBeTruthy(); }
  });
});

describe('sidebar guide', () => {
  // Panel.jsx renders `step.guide`. An earlier version authored these as `body`,
  // so all five sidebar panels rendered blank with no error — the same silent
  // field-name mismatch that blanked the walkthrough card rows.
  it('uses the field the Panel actually reads', () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(5);
    for (const s of STEPS) {
      expect(s.title, 'step needs a title').toBeTruthy();
      expect(s.guide, `step "${s.title}" has no guide content`).toBeTruthy();
      expect(s.body, `step "${s.title}" still uses body:, which Panel ignores`).toBeUndefined();
    }
  });
});

describe('the programme view stays free of engineering jargon', () => {
  // The whole reason it exists as a separate view. A programme owner cannot act on
  // `mfa_error` or an endpoint path, and blending the two audiences served neither.
  const JARGON = /POST |GET |\/v1\/|webhook|endpoint|access_token|bridge_token|suborder|link_id|employer_id|order-refresh-failed|order-status-updated|mfa_error|login_error|no_data|session_expired|cron|p90/;

  it('has none in the renewal table', () => {
    for (const r of PROGRAM_TABLE) {
      expect(JSON.stringify(r)).not.toMatch(JARGON);
    }
  });

  it('has none in the risks or the scripts', () => {
    for (const r of PROGRAM_RISKS) expect(JSON.stringify(r)).not.toMatch(JARGON);
    for (const s of PROGRAM_SCRIPTS) expect(JSON.stringify(s)).not.toMatch(JARGON);
  });

  it('raises the consent question, because counsel will', () => {
    expect(JSON.stringify(PROGRAM_RISKS)).toMatch(/consent/i);
  });

  it('names who acts and whether the applicant is contacted, for every row', () => {
    for (const r of PROGRAM_TABLE) { expect(r.who).toBeTruthy(); expect(r.does).toBeTruthy(); expect(r.contact).toBeTruthy(); }
  });

  it('ships wording a caseworker could actually send', () => {
    expect(PROGRAM_SCRIPTS.length).toBeGreaterThanOrEqual(2);
    for (const s of PROGRAM_SCRIPTS) expect(s.body.length).toBeGreaterThan(80);
  });
});

describe('the guide and the server agree on who has to act', () => {
  // This is the cross-check that was missing. The page taught that account_locked
  // is the applicant's to resolve WITH THEIR PROVIDER, while the server routed it
  // to re-authentication — so a real locked account would have shown a "send the
  // link" panel under copy saying that cannot help.
  const routed = (status) => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: 'o1',
      orderData: { id: 'o1', employers: [{ id: 'e1', company_name: 'X', status: 'sent', last_task_status: status }] },
    });
    return rows[0].state;
  };

  it('routes exactly the statuses the page calls credential-class to re-auth', () => {
    for (const o of OUTCOMES) {
      const expected = o.cls === 'credential' ? 'reauth_required' : o.status === 'done' ? 'refreshed' : 'failed_other';
      if (o.status === 'done') continue; // done comes from a task, not last_task_status alone
      expect(routed(o.status), `${o.status} (page class: ${o.cls})`).toBe(expected);
    }
  });

  it('does not treat a blocked provider account as something a sign-in fixes', () => {
    for (const st of PROVIDER_BLOCKED_STATUSES) {
      expect(REAUTH_STATUSES).not.toContain(st);
      expect(routed(st)).toBe('failed_other');
    }
  });

  it('leaves an unrecognised status pending rather than guessing', () => {
    // Truv could add an in-progress status; treating anything unknown as terminal
    // would report a live refresh as failed.
    expect(routed('some_new_in_progress_state')).toBe('refreshing');
  });

  it('fails closed when a failure event carries no status', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: 'o1',
      orderData: { id: 'o1', employers: [{ id: 'e1', company_name: 'X', status: 'sent' }] },
      webhooks: [{ event_type: 'order-refresh-failed', payload: JSON.stringify({ order_id: 'o1', employer_id: 'e1' }) }],
    });
    expect(rows[0].state).toBe('failed_other');
  });
});

describe('the order-level classifier no longer implements the trap', () => {
  it('does not report refreshed when only some connections completed', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'o1',
      orderData: { id: 'o1', employers: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'sent' }] },
    });
    expect(out.state).not.toBe('refreshed');
  });

  it('still reports refreshed when every connection completed', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'o1',
      orderData: { id: 'o1', employers: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }] },
    });
    expect(out.state).toBe('refreshed');
  });
});

describe('claims match the evidence', () => {
  it('says a refresh can drop an employer but not add one', () => {
    expect(SCOPING.code).toMatch(/employers/);
    const add = RVN.find(r => /Add an employer/i.test(r.q));
    const drop = RVN.find(r => /Drop an employer/i.test(r.q));
    expect(add.refresh).toMatch(/^No/);
    expect(drop.refresh).toMatch(/^Yes/);
    // and the gate must route the job-ended case to a scoped refresh
    expect(GATES.some(g => /job ended/i.test(g.when) && /Refresh/.test(g.then))).toBe(true);
  });

  it('states plainly what the new-order path did NOT verify', () => {
    // An earlier version labelled the whole comparison "verified in the capture"
    // when the run never completed. The disclaimer is now load-bearing.
    expect(NEW_ORDER_PROOF.observed).toBeTruthy();
    expect(NEW_ORDER_PROOF.notObserved).toMatch(/not yet verified/i);
  });

  it('points at the event that actually carries the join key', () => {
    const text = JSON.stringify(CORRELATION);
    expect(text).toMatch(/task-status-updated/);
    expect(text).toMatch(/link_id: null|link_id/);
    // and does not present polling as the only option
    expect(CORRELATION.some(c => /cannot receive inbound webhooks/i.test(c.body))).toBe(true);
  });

  it('surfaces the caps in the reader\'s path, not only the server', () => {
    const t = JSON.stringify(LIMITS);
    expect(t).toMatch(/3 refreshes per connection per 24 hours/);
    expect(t).toMatch(/300 API requests per minute/);
    expect(t).toMatch(/bills as a verification/);
  });
});

describe('the guide stays standalone', () => {
  // It is deployed on its own subdomain and sent to people outside Truv, so it
  // must not pull in the demo-apps shell. Layout brings the Header, the
  // breadcrumb back to the other Public Sector demos, and the side Panel.
  const src = readFileSync(new URL('../../src/demos/RefreshGuide.jsx', import.meta.url), 'utf8');
  // The docblock explains WHY it avoids the shell, so check the code, not the prose.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('does not render the demo-apps Layout, Header or Panel', () => {
    expect(code).not.toMatch(/\bLayout\b/);
    expect(code).not.toMatch(/\bHeader\b/);
    expect(code).not.toMatch(/usePanel/);
  });

  it('scopes its styles so nothing leaks into the demos that do use the shell', () => {
    const css = readFileSync(new URL('../../src/demos/refresh-guide.css', import.meta.url), 'utf8');
    const selectors = css.match(/^\.[a-z-]+/gm) || [];
    for (const sel of selectors) {
      expect(sel.startsWith('.rg'), `${sel} is not scoped under .rg`).toBe(true);
    }
  });

  it('anchors every section so any part can be linked to', () => {
    for (const id of ['start', 'basics', 'decide', 'returns', 'partial', 'play', 'outcomes', 'limits', 'evidence', 'program']) {
      expect(code).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('logs every request it makes, so the playground is inspectable', () => {
    // The console is the whole point of the "play" half: nothing is simulated and
    // the reader can see it.
    expect(code).toMatch(/const api = useCallback/);
    expect(code).toMatch(/setCalls/);
    // and no bare fetch that bypasses the log
    const bareFetches = (code.match(/await fetch\(/g) || []).length;
    expect(bareFetches, 'every call must go through api() so it appears in the console').toBe(1);
  });
});

describe('Integration basics', () => {
  const text = JSON.stringify(BASICS);

  it('says how to authenticate and where to send requests', () => {
    expect(text).toMatch(/X-Access-Client-Id/);
    expect(text).toMatch(/X-Access-Secret/);
    expect(text).toMatch(/https:\/\/prod\.truv\.com\/v1\//);
  });

  it('covers connecting in Bridge, including closing it', () => {
    expect(text).toMatch(/cdn\.truv\.com\/bridge\.js/);
    expect(text).toMatch(/isOrder: true/);
    expect(text).toMatch(/bridge\.close\(\)/);
  });

  it('covers reading results: paginated tasks matched by link_id', () => {
    expect(text).toMatch(/\/v1\/tasks\/\?user_id=/);
    expect(text).toMatch(/cursor/);
    expect(text).toMatch(/link_id/);
  });

  it('covers webhook registration, signing, retries and the delivery log', () => {
    expect(text).toMatch(/POST \/v1\/webhooks\//);
    expect(text).toMatch(/X-WEBHOOK-SIGN/);
    expect(text).toMatch(/HMAC-SHA256/);
    expect(text).toMatch(/3 times, 30 seconds apart/);
    expect(text).toMatch(/webhook-requests/);
  });

  it('explains the three refresh errors and the 404 body shape', () => {
    const codes = BASICS.errors.map(e => e.code);
    expect(codes).toContain('incorrect_parameters');
    expect(codes).toContain('invalid');
    expect(codes).toContain('throttled');
    expect(BASICS.errors.some(e => e.status === '404' && /detail/.test(e.message))).toBe(true);
  });

  it('gives a copy-and-paste sequence that uses only documented calls', () => {
    for (const call of ['/v1/orders/', '/v1/tasks/?user_id=', '/v1/users/USER_ID/reports/']) {
      expect(BASICS.curl).toContain(call);
    }
    expect(BASICS.curl).not.toMatch(/sk_|secret_[a-z0-9]{8}/i);
  });

  it('keeps user_id on the list of what to store', () => {
    expect(IDENTITY.keep.map(k => k.what)).toContain('user_id');
  });
});

describe('Guide wording guards', () => {
  const all = JSON.stringify(Object.values(GuideContent));

  it('states the refresh limit per connection, never per order', () => {
    expect(all).not.toMatch(/per order per 24/);
    expect(all).toMatch(/per connection/);
  });

  it('has no internal references an outside reader cannot follow', () => {
    expect(all).not.toMatch(/DS-\d+|REFRESH-FINDINGS|GOVERNMENT_|truv-context/);
  });

  it('never describes Truv as storing or keeping credentials', () => {
    expect(all).not.toMatch(/stored credential|credentials? (are|is|were) (stored|kept|saved)|saved sign-?in|stored session/i);
  });

  it('does not quote a status code where runs disagreed', () => {
    expect(all).not.toMatch(/returned 200/);
  });
});
