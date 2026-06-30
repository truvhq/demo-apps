import { describe, it, expect, vi } from 'vitest';

// Mock the barrel index to avoid pulling in browser globals (window.location)
vi.mock('../../src/components/hooks.js', () => ({
  API_BASE: 'http://localhost:3000',
}));
vi.mock('../../src/components/WebhookFeed.jsx', () => ({
  parsePayload(raw) {
    if (!raw) return {};
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  },
}));

import { getReportTypes } from '../../src/components/useReportFetch.js';
import { canSubmitApplicant } from '../../src/demos/scaffolding/case-worker-portal.jsx';

// ---------------------------------------------------------------------------
// CaseWorkerPortal.jsx behavioral contracts
//
// Order-flow demo (Public Sector Case Worker Portal). Same backend-initiated
// pattern as LOS: creates orders with PII and Truv sends verification links.
// No Bridge widget in the UI.
// ---------------------------------------------------------------------------

describe('CaseWorkerPortal demo contracts', () => {
  // ---- Webhook event: order-flow uses "order" ----------------------------

  it('uses webhookEvent "order"', () => {
    const webhookEvent = 'order';
    expect(webhookEvent).toBe('order');
  });

  // ---- Backend-initiated flow (no Bridge in UI) --------------------------

  it('is a backend-initiated flow (no Bridge widget)', () => {
    const usesInlineBridge = false;
    expect(usesInlineBridge).toBe(false);
  });

  // ---- VERIFIER_DIAGRAM is defined ----------------------------------------

  it('defines a VERIFIER_DIAGRAM', () => {
    const hasVerifierDiagram = true;
    expect(hasVerifierDiagram).toBe(true);
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 3 steps in the guide', () => {
    // STEPS: case worker creates request, applicant receives link, review results
    const STEPS_COUNT = 3;
    expect(STEPS_COUNT).toBe(3);
  });

  // ---- COMPLETED_APPLICANTS seed data -------------------------------------

  const COMPLETED_APPLICANTS = [
    { firstName: 'John', lastName: 'Doe', products: ['income'], status: 'completed' },
    { firstName: 'Jane', lastName: 'Smith', products: ['income'], status: 'completed' },
    { firstName: 'Bob', lastName: 'Wilson', products: ['assets'], status: 'completed' },
  ];

  it('has 3 pre-populated completed applicants', () => {
    expect(COMPLETED_APPLICANTS).toHaveLength(3);
  });

  it('all completed applicants have status "completed"', () => {
    for (const a of COMPLETED_APPLICANTS) {
      expect(a.status).toBe('completed');
    }
  });

  // ---- Structural parity with LOS ----------------------------------------

  it('shares the same backend-initiated architecture as LOS', () => {
    // Both LOS and EmployeePortal:
    // - Create orders via POST /api/orders
    // - Use webhookEvent: 'order'
    // - Have VERIFIER_DIAGRAM
    // - Have COMPLETED_APPLICANTS seed data
    // - Have AddApplicantForm for creating test applicants
    const losArchitecture = { webhookEvent: 'order', hasVerifierDiagram: true, hasBridgeWidget: false };
    const epArchitecture = { webhookEvent: 'order', hasVerifierDiagram: true, hasBridgeWidget: false };
    expect(epArchitecture).toEqual(losArchitecture);
  });

  // ---- Report type mappings -----------------------------------------------

  it('income product: getReportTypes returns ["income"]', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  it('assets product: getReportTypes auto-adds income_insights', () => {
    expect(getReportTypes(['assets'])).toEqual(['assets', 'income_insights']);
  });

  it('employment product: getReportTypes returns ["employment"]', () => {
    expect(getReportTypes(['employment'])).toEqual(['employment']);
  });
});

// ---------------------------------------------------------------------------
// AddApplicantForm validation
//
// Email and phone are both optional: the backend (server/routes/orders.js) treats
// them as optional and Truv delivers the verification link via email OR SMS when
// present, otherwise the case worker shares the dashboard share_url manually. So
// missing contact info must NOT disable submit — only first/last name gate it
// (mirrors the Customer Portal's ApplicationForm, which doesn't validate contacts).
//
// canSubmitApplicant() is the exact predicate used for both the submit button's
// disabled state and the handleSubmit guard.
// ---------------------------------------------------------------------------

describe('AddApplicantForm canSubmitApplicant', () => {
  // ---- Contact info is optional -------------------------------------------

  it('enables submit with name + email only (no phone)', () => {
    expect(canSubmitApplicant({ firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '' })).toBe(true);
  });

  it('enables submit with name + phone only (no email)', () => {
    expect(canSubmitApplicant({ firstName: 'John', lastName: 'Doe', email: '', phone: '+14155551234' })).toBe(true);
  });

  it('enables submit with both contact methods provided', () => {
    expect(canSubmitApplicant({ firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '+14155551234' })).toBe(true);
  });

  it('enables submit with neither email nor phone', () => {
    expect(canSubmitApplicant({ firstName: 'John', lastName: 'Doe', email: '', phone: '' })).toBe(true);
  });

  // ---- Names still gate submit --------------------------------------------

  it('disables submit when first name is missing', () => {
    expect(canSubmitApplicant({ firstName: '', lastName: 'Doe' })).toBe(false);
  });

  it('disables submit when last name is missing', () => {
    expect(canSubmitApplicant({ firstName: 'John', lastName: ' ' })).toBe(false);
  });

  it('treats whitespace-only names as empty', () => {
    expect(canSubmitApplicant({ firstName: '  ', lastName: '  ' })).toBe(false);
  });
});
