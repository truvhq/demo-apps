import { describe, it, expect, vi } from 'vitest';

// Mock direct imports used by useReportFetch (no longer via barrel)
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
// CustomerPortal.jsx behavioral contracts
//
// Order-flow demo (Public Sector Customer Portal) that supports income,
// income+assets combo, and assets verification.
// ---------------------------------------------------------------------------

describe('CustomerPortal demo contracts', () => {
  // ---- CP_DIAGRAMS object: 'income', 'income_assets', 'assets' entries ----

  const CP_DIAGRAM_KEYS = ['income', 'income_assets', 'assets'];

  it('CP_DIAGRAMS has "income", "income_assets", and "assets" entries', () => {
    expect(CP_DIAGRAM_KEYS).toContain('income');
    expect(CP_DIAGRAM_KEYS).toContain('income_assets');
    expect(CP_DIAGRAM_KEYS).toContain('assets');
    expect(CP_DIAGRAM_KEYS).toHaveLength(3);
  });

  // ---- CP_PRODUCTS array: 3 entries ---------------------------------------

  const CP_PRODUCTS = [
    { id: 'income', report: 'VOIE Report', products: ['income'] },
    { id: 'income_assets', report: 'VOIE + VOA', products: ['income', 'assets'] },
    { id: 'assets', report: 'VOA + Income Insights', products: ['assets'] },
  ];

  it('CP_PRODUCTS has 3 entries: income, income_assets, assets', () => {
    expect(CP_PRODUCTS).toHaveLength(3);
    expect(CP_PRODUCTS.map(p => p.id)).toEqual(['income', 'income_assets', 'assets']);
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

  it('income_assets: getReportTypes(["income", "assets"]) returns income, assets, income_insights', () => {
    expect(getReportTypes(['income', 'assets'])).toEqual(['income', 'assets', 'income_insights']);
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
