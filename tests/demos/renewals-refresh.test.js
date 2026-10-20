import { describe, it, expect } from 'vitest';
import { classifyRefreshOutcome, classifyRefreshOutcomePerSuborder, tasksForOrder, REAUTH_STATUSES, NON_REAUTH_FAILURE_STATUSES } from '../../server/routes/renewals-refresh.js';
import { CASELOAD, STEPS, WALKTHROUGH_STAGES, OUTCOME_DISPLAY } from '../../src/demos/scaffolding/renewals-refresh.jsx';
import { RENEWALS_DIAGRAM, REFRESH_FORK_DIAGRAM } from '../../src/diagrams/renewals-refresh.js';

// ---------------------------------------------------------------------------
// RenewalsRefresh.jsx behavioral contracts
//
// Recertification demo. A refresh either completes silently or fails and needs
// the applicant to clear a challenge. The failure path emits NO further
// order-status-updated, so the order sits at `sent` and order-refresh-failed is
// the only signal. classifyRefreshOutcome is what turns those three sources
// (webhook, refresh task, order state) into one verdict.
//
// The fixtures below are the real payload shapes captured in sandbox on
// 2026-08-19/20, not invented ones.
// ---------------------------------------------------------------------------

// Captured verbatim from the sandbox run (income refresh, mfa_captcha credential).
const REFRESH_FAILED_INCOME = {
  event_type: 'order-refresh-failed',
  status: 'mfa_error',
  payload: JSON.stringify({
    webhook_id: 'e9700ddbfb3048b7bae46e0ae69997ae',
    event_type: 'order-refresh-failed',
    product: 'income',
    order_id: 'b1b4777851ba4d159a7272c6cdeb6ab2',
    employer_id: 'b09cf8bae2af421398b40e1e4e981a84',
    status: 'mfa_error',
  }),
};

// Same shape on the bank path, which is the reason the demo covers both products.
const REFRESH_FAILED_ASSETS = {
  event_type: 'order-refresh-failed',
  status: 'mfa_error',
  payload: JSON.stringify({
    event_type: 'order-refresh-failed',
    product: 'assets',
    order_id: '425606afae424cb7be0808c711a2adbb',
    status: 'mfa_error',
  }),
};

describe('classifyRefreshOutcome', () => {
  it('reads order-refresh-failed as re-auth required, carrying reason and product', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'b1b4777851ba4d159a7272c6cdeb6ab2',
      orderData: { employers: [{ status: 'sent' }] },
      webhooks: [REFRESH_FAILED_INCOME],
    });
    expect(out.state).toBe('reauth_required');
    expect(out.reason).toBe('mfa_error');
    expect(out.product).toBe('income');
    expect(out.source).toBe('order-refresh-failed');
  });

  it('resolves the assets path identically, with product: assets', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: '425606afae424cb7be0808c711a2adbb',
      orderData: { financial_accounts: [{ status: 'sent' }] },
      webhooks: [REFRESH_FAILED_ASSETS],
    });
    expect(out.state).toBe('reauth_required');
    expect(out.product).toBe('assets');
  });

  it('ignores an order-refresh-failed belonging to a different order', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'some-other-order',
      orderData: { employers: [{ status: 'sent' }] },
      webhooks: [REFRESH_FAILED_INCOME],
    });
    // Not this order's failure, and this order has not completed, so still pending.
    expect(out.state).toBe('refreshing');
  });

  it('treats a completed suborder as a silent success', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'x',
      orderData: { employers: [{ status: 'completed' }] },
      webhooks: [],
    });
    expect(out.state).toBe('refreshed');
    expect(out.source).toBe('order');
  });

  // REGRESSION GUARD. The first version of this fallback filtered on `is_refresh`,
  // which exists on the internal Task model but is NOT in the public
  // GET /v1/tasks/ response — it comes back absent. That made the whole
  // no-webhook path dead on localhost, and an earlier version of this test missed
  // it because the fixture was hand-written with `is_refresh: true` instead of the
  // real payload. This fixture is the real one, captured 2026-08-20.
  it('falls back to the refresh task status when no webhook arrived (localhost, no tunnel)', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: '87a3403cd2c14ae1970df51673dd86c6',
      orderData: { financial_accounts: [{ status: 'sent', last_task_status: null }] },
      webhooks: [],
      tasks: [
        // Note: no `is_refresh` key at all, exactly as the API returns it.
        { id: '6d2f84e03ef9462bb16f3e9fc5644945', status: 'mfa_error', product_type: 'assets', order_id: '87a3403cd2c14ae1970df51673dd86c6', error_message: 'unanswered question: Session has expired. New MFA token is required.' },
        { id: '9670c569', status: 'done', product_type: 'assets', order_id: '346408c2689e47c59c82294cc2dacc0e' },
      ],
    });
    expect(out.state).toBe('reauth_required');
    expect(out.reason).toBe('mfa_error');
    expect(out.source).toBe('task');
    expect(out.errorMessage).toContain('New MFA token is required');
  });

  it('scopes task matching to this refresh order, ignoring the original order\'s tasks', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'refresh-order',
      orderData: { employers: [{ status: 'sent' }] },
      webhooks: [],
      // A failure on the ORIGINAL order must not be reported as this refresh's outcome.
      tasks: [{ id: 't1', status: 'login_error', order_id: 'original-order' }],
    });
    expect(out.state).toBe('refreshing');
  });

  it('still honors is_refresh if a future API version starts exposing it', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'x',
      orderData: { employers: [{ status: 'sent' }] },
      webhooks: [],
      tasks: [{ id: 't', is_refresh: true, status: 'login_error' }],
    });
    expect(out.state).toBe('reauth_required');
  });

  it('reads last_task_status off the suborder when the task list cannot be matched', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'x',
      orderData: { financial_accounts: [{ status: 'sent', last_task_status: 'session_expired' }] },
      webhooks: [],
      tasks: [],
    });
    expect(out.state).toBe('reauth_required');
    expect(out.source).toBe('suborder');
  });

  it('separates provider problems from credential problems so they do not prompt the applicant', () => {
    for (const status of NON_REAUTH_FAILURE_STATUSES) {
      const viaWebhook = classifyRefreshOutcome({
        truvOrderId: 'x',
        orderData: { employers: [{ status: 'sent' }] },
        webhooks: [{ event_type: 'order-refresh-failed', payload: JSON.stringify({ order_id: 'x', status }) }],
      });
      expect(viaWebhook.state, `${status} via webhook`).toBe('failed_other');

      const viaTask = classifyRefreshOutcome({
        truvOrderId: 'x',
        orderData: { employers: [{ status: 'sent' }] },
        webhooks: [],
        tasks: [{ is_refresh: true, status }],
      });
      expect(viaTask.state, `${status} via task`).toBe('failed_other');
    }
  });

  it('routes every credential-class status to re-auth', () => {
    for (const status of REAUTH_STATUSES) {
      const out = classifyRefreshOutcome({
        truvOrderId: 'x',
        orderData: { employers: [{ status: 'sent' }] },
        webhooks: [],
        tasks: [{ is_refresh: true, status }],
      });
      expect(out.state, status).toBe('reauth_required');
    }
  });

  it('does not match a task that names a different order, even if it carries is_refresh', () => {
    const tasks = [
      { id: 'a', order_id: 'other-order', is_refresh: true, status: 'login_error' },
      { id: 'b', order_id: 'mine', status: 'done' },
      { id: 'c', is_refresh: true, status: 'mfa_error' },
    ];
    expect(tasksForOrder(tasks, 'mine').map(t => t.id)).toEqual(['b', 'c']);
  });

  it('reports refreshed once a failed refresh order completes after the applicant re-authenticates', () => {
    const failedThenCompleted = {
      truvOrderId: 'refresh-order',
      orderData: { employers: [{ id: 'e1', status: 'completed' }] },
      webhooks: [{ event_type: 'order-refresh-failed', payload: { order_id: 'refresh-order', status: 'mfa_error' } }],
      tasks: [{ id: 't', order_id: 'refresh-order', status: 'mfa_error' }],
    };
    expect(classifyRefreshOutcome(failedThenCompleted).state).toBe('refreshed');
  });

  it('does not let completion hide a provider-class failure such as no_data', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'refresh-order',
      orderData: { employers: [{ id: 'e1', status: 'completed' }] },
      webhooks: [{ event_type: 'order-refresh-failed', payload: { order_id: 'refresh-order', status: 'no_data' } }],
    });
    expect(out.state).toBe('failed_other');
    expect(out.reason).toBe('no_data');
  });

  it('still reports re-auth while another connection on the order has not completed', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'refresh-order',
      orderData: { employers: [{ id: 'e1', status: 'completed' }, { id: 'e2', status: 'sent' }] },
      webhooks: [{ event_type: 'order-refresh-failed', payload: { order_id: 'refresh-order', status: 'mfa_error' } }],
    });
    expect(out.state).toBe('reauth_required');
  });

  it('fails closed on an unknown or missing webhook status instead of prompting the applicant', () => {
    for (const status of ['something_new', null, undefined]) {
      const out = classifyRefreshOutcome({
        truvOrderId: 'refresh-order',
        orderData: { employers: [{ id: 'e1', status: 'sent' }] },
        webhooks: [{ event_type: 'order-refresh-failed', payload: { order_id: 'refresh-order', status } }],
      });
      expect(out.state).toBe('failed_other');
    }
  });

  it('is pending, not failed, when nothing has resolved yet', () => {
    expect(classifyRefreshOutcome({ truvOrderId: 'x', orderData: { employers: [{ status: 'sent' }] } }).state).toBe('refreshing');
    expect(classifyRefreshOutcome({}).state).toBe('refreshing');
  });

  it('accepts an already-parsed webhook payload as well as a JSON string', () => {
    const out = classifyRefreshOutcome({
      truvOrderId: 'x',
      orderData: { employers: [{ status: 'sent' }] },
      webhooks: [{ event_type: 'order-refresh-failed', payload: { order_id: 'x', status: 'login_error', product: 'income' } }],
    });
    expect(out.state).toBe('reauth_required');
    expect(out.reason).toBe('login_error');
  });
});

describe('classifyRefreshOutcomePerSuborder', () => {
  const failure = (employer_id, status) => ({ event_type: 'order-refresh-failed', payload: { order_id: 'r', employer_id, status } });

  it('gives each connection its own verdict on a mixed order', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: 'r',
      orderData: { employers: [
        { id: 'a', status: 'completed', company_name: 'Home Depot' },
        { id: 'b', status: 'sent', company_name: 'Kroger' },
        { id: 'c', status: 'sent', company_name: 'Walmart' },
      ] },
      webhooks: [failure('b', 'mfa_error'), failure('c', 'no_data')],
    });
    expect(rows.map(r => r.state)).toEqual(['refreshed', 'reauth_required', 'failed_other']);
  });

  it('clears a stale credential failure once that connection completes', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: 'r',
      orderData: { employers: [{ id: 'b', status: 'completed', company_name: 'Kroger' }] },
      webhooks: [failure('b', 'mfa_error')],
    });
    expect(rows[0].state).toBe('refreshed');
  });

  it('fails closed on an unknown failure status', () => {
    const rows = classifyRefreshOutcomePerSuborder({
      truvOrderId: 'r',
      orderData: { employers: [{ id: 'b', status: 'sent' }] },
      webhooks: [failure('b', null)],
    });
    expect(rows[0].state).toBe('failed_other');
  });
});

describe('RenewalsRefresh scaffolding', () => {
  it('exposes one Guide step per stage of the flow', () => {
    expect(STEPS.length).toBe(5);
    for (const s of STEPS) {
      expect(s.title).toBeTruthy();
      expect(s.guide).toBeTruthy();
    }
  });

  it('walkthrough stages are well formed and end on the launch stage', () => {
    expect(WALKTHROUGH_STAGES.length).toBeGreaterThanOrEqual(5);
    for (const s of WALKTHROUGH_STAGES) {
      expect(s.n).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.kind).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
    // Every kind must resolve to a built-in surface, or the stage renders blank.
    const builtIn = ['hero', 'card', 'split', 'diagram'];
    for (const s of WALKTHROUGH_STAGES) expect(builtIn, `kind ${s.kind}`).toContain(s.kind);
  });

  it('the caseload covers both products and both outcomes', () => {
    const products = new Set(CASELOAD.flatMap(c => c.products));
    expect(products.has('income')).toBe(true);
    expect(products.has('assets')).toBe(true);
    const outcomes = new Set(CASELOAD.map(c => c.expect));
    expect(outcomes.has('silent')).toBe(true);
    expect(outcomes.has('reauth')).toBe(true);
  });

  it('the two default cases alone still cover both axes, so a presenter needs only two connects', () => {
    const defaults = CASELOAD.filter(c => !c.optional);
    expect(defaults.length).toBe(2);
    expect(new Set(defaults.map(c => c.expect))).toEqual(new Set(['silent', 'reauth']));
    expect(new Set(defaults.flatMap(c => c.products))).toEqual(new Set(['income', 'assets']));
  });

  it('bank cases use the mfa credential, never mfa_captcha (the bank sandbox rejects it)', () => {
    for (const c of CASELOAD) {
      if (c.connectorKind !== 'bank') continue;
      expect(c.credential.password).toBe('mfa');
    }
  });

  it('every classifier state has display copy, so no row can render unlabeled', () => {
    for (const state of ['refreshing', 'refreshed', 'reauth_required', 'failed_other']) {
      expect(OUTCOME_DISPLAY[state]?.label, state).toBeTruthy();
      expect(OUTCOME_DISPLAY[state]?.tone, state).toBeTruthy();
    }
  });
});

describe('RenewalsRefresh diagrams', () => {
  it('renders as mermaid definitions', () => {
    expect(RENEWALS_DIAGRAM.startsWith('sequenceDiagram')).toBe(true);
    expect(REFRESH_FORK_DIAGRAM.startsWith('flowchart')).toBe(true);
  });

  it('names the failure signal, which is the point of the demo', () => {
    expect(RENEWALS_DIAGRAM).toContain('order-refresh-failed');
    expect(REFRESH_FORK_DIAGRAM).toContain('order-refresh-failed');
  });
});
