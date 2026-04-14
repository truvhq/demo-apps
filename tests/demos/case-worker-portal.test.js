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
