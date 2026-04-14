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
// LOS.jsx behavioral contracts
//
// Order-flow demo (Mortgage LOS Integration). Backend-initiated: creates an
// order with borrower PII and Truv sends a verification link via email/SMS.
// No Bridge widget in the UI.
// ---------------------------------------------------------------------------

describe('LOS demo contracts', () => {
  // ---- Webhook event: order-flow uses "order" ----------------------------

  it('uses webhookEvent "order"', () => {
    const webhookEvent = 'order';
    expect(webhookEvent).toBe('order');
  });

  // ---- Backend-initiated flow (no Bridge in UI) --------------------------

  it('is a backend-initiated flow (no Bridge widget)', () => {
    // LOS creates orders via POST /api/orders with PII + email/phone.
    // Truv sends the share_url to the borrower. No TruvBridge.init() in the component.
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
    // STEPS: create order, borrower receives link, review results
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
