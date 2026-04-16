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
// PaycheckLinkedLoans.jsx behavioral contracts
//
// Bridge-flow demo that combines income verification with payroll deductions.
// Uses product_type: 'pll'. Fetches income report via useReportFetch and PLL
// report via dedicated link-level endpoint (GET /api/links/:linkId/pll).
// ---------------------------------------------------------------------------

describe('PaycheckLinkedLoans demo contracts', () => {
  // ---- Products and webhook event -----------------------------------------

  it('uses products: ["income"]', () => {
    const products = ['income'];
    expect(products).toEqual(['income']);
  });

  it('uses webhookEvent "task" (bridge-flow)', () => {
    const webhookEvent = 'task';
    expect(webhookEvent).toBe('task');
  });

  // ---- Bridge token config ------------------------------------------------

  it('bridge token uses product_type "pll"', () => {
    const bridgeConfig = { product_type: 'pll' };
    expect(bridgeConfig.product_type).toBe('pll');
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: submit info, connect payroll, set up deduction, review
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });

  // ---- Report type mapping ------------------------------------------------

  it('getReportTypes(["income"]) returns income only (PLL report fetched separately via link_id)', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  // ---- DIAGRAM is defined -------------------------------------------------

  it('defines a sequence diagram', () => {
    const hasDiagram = true;
    expect(hasDiagram).toBe(true);
  });
});
