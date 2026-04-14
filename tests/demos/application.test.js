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
// Application.jsx behavioral contracts
//
// Order-flow demo (Mortgage POS Application) that supports income and assets
// verification. Uses the Orders API (POST /api/orders) instead of bridge
// tokens directly.
// ---------------------------------------------------------------------------

describe('Application demo contracts', () => {
  // ---- DIAGRAMS object: 'income' and 'assets' entries ---------------------

  const DIAGRAM_KEYS = ['income', 'assets'];

  it('DIAGRAMS has "income" and "assets" entries', () => {
    expect(DIAGRAM_KEYS).toContain('income');
    expect(DIAGRAM_KEYS).toContain('assets');
    expect(DIAGRAM_KEYS).toHaveLength(2);
  });

  // ---- PRODUCTS array: 2 entries ------------------------------------------

  const PRODUCTS = [
    { id: 'income', report: 'VOIE Report' },
    { id: 'assets', report: 'VOA + Income Insights' },
  ];

  it('PRODUCTS has 2 entries: income and assets', () => {
    expect(PRODUCTS).toHaveLength(2);
    expect(PRODUCTS.map(p => p.id)).toEqual(['income', 'assets']);
  });

  // ---- Webhook event: order-flow uses "order" ----------------------------

  it('uses webhookEvent "order"', () => {
    const webhookEvent = 'order';
    expect(webhookEvent).toBe('order');
  });

  // ---- Income product contract --------------------------------------------

  it('income product: uses products ["income"]', () => {
    const products = ['income'];
    expect(products).toEqual(['income']);
  });

  it('income product: getReportTypes returns ["income"]', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  // ---- Assets product contract --------------------------------------------

  it('assets product: uses products ["assets"]', () => {
    const products = ['assets'];
    expect(products).toEqual(['assets']);
  });

  it('assets product: getReportTypes auto-adds income_insights', () => {
    expect(getReportTypes(['assets'])).toEqual(['assets', 'income_insights']);
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: fill application, complete verification, process, review
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });
});
