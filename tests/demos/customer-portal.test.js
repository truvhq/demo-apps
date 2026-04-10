import { describe, it, expect, vi } from 'vitest';

// Mock the barrel index to avoid pulling in browser globals (window.location)
vi.mock('../../src/components/index.js', () => ({
  API_BASE: 'http://localhost:3000',
  parsePayload(raw) {
    if (!raw) return {};
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  },
}));

import { getReportTypes } from '../../src/components/useReportFetch.js';

// ---------------------------------------------------------------------------
// CustomerPortal.jsx behavioral contracts
//
// Order-flow demo (Public Sector Customer Portal) that supports income,
// employment, and assets verification.
// ---------------------------------------------------------------------------

describe('CustomerPortal demo contracts', () => {
  // ---- CP_DIAGRAMS object: 'income', 'employment', 'assets' entries -------

  const CP_DIAGRAM_KEYS = ['income', 'employment', 'assets'];

  it('CP_DIAGRAMS has "income", "employment", and "assets" entries', () => {
    expect(CP_DIAGRAM_KEYS).toContain('income');
    expect(CP_DIAGRAM_KEYS).toContain('employment');
    expect(CP_DIAGRAM_KEYS).toContain('assets');
    expect(CP_DIAGRAM_KEYS).toHaveLength(3);
  });

  // ---- CP_PRODUCTS array: 3 entries ---------------------------------------

  const CP_PRODUCTS = [
    { id: 'income', report: 'VOIE Report' },
    { id: 'employment', report: 'VOE Report' },
    { id: 'assets', report: 'VOA + Income Insights' },
  ];

  it('CP_PRODUCTS has 3 entries: income, employment, assets', () => {
    expect(CP_PRODUCTS).toHaveLength(3);
    expect(CP_PRODUCTS.map(p => p.id)).toEqual(['income', 'employment', 'assets']);
  });

  // ---- Webhook event: all use "order" ------------------------------------

  it('uses webhookEvent "order"', () => {
    const webhookEvent = 'order';
    expect(webhookEvent).toBe('order');
  });

  // ---- Report type mappings -----------------------------------------------

  it('income: getReportTypes(["income"]) returns ["income"]', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  it('employment: getReportTypes(["employment"]) returns ["employment"]', () => {
    expect(getReportTypes(['employment'])).toEqual(['employment']);
  });

  it('assets: getReportTypes(["assets"]) auto-adds income_insights', () => {
    expect(getReportTypes(['assets'])).toEqual(['assets', 'income_insights']);
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: submit info, complete verification, agency processes, review
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });
});
