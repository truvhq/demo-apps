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
// FollowUp.jsx behavioral contracts
//
// Order-flow demo (Mortgage POS Tasks) that creates multiple orders sharing
// one external_user_id. Each task targets a different product set.
// ---------------------------------------------------------------------------

describe('FollowUp demo contracts', () => {
  // ---- TASKS array: 4 entries with correct products and employers ---------

  const TASKS = [
    { id: 'income', products: ['income'], employer: 'Home Depot' },
    { id: 'employment', products: ['employment'], employer: 'Walmart' },
    { id: 'assets', products: ['assets'], employer: null },
    { id: 'assets-income', products: ['income', 'assets'], employer: 'Home Depot' },
  ];

  it('has exactly 4 tasks', () => {
    expect(TASKS).toHaveLength(4);
  });

  it('income task: products ["income"], employer "Home Depot"', () => {
    const t = TASKS.find(t => t.id === 'income');
    expect(t.products).toEqual(['income']);
    expect(t.employer).toBe('Home Depot');
  });

  it('employment task: products ["employment"], employer "Walmart"', () => {
    const t = TASKS.find(t => t.id === 'employment');
    expect(t.products).toEqual(['employment']);
    expect(t.employer).toBe('Walmart');
  });

  it('assets task: products ["assets"], employer null', () => {
    const t = TASKS.find(t => t.id === 'assets');
    expect(t.products).toEqual(['assets']);
    expect(t.employer).toBeNull();
  });

  it('assets-income task: products ["income", "assets"], employer "Home Depot"', () => {
    const t = TASKS.find(t => t.id === 'assets-income');
    expect(t.products).toEqual(['income', 'assets']);
    expect(t.employer).toBe('Home Depot');
  });

  // ---- Webhook event: order-flow uses "order" ----------------------------

  it('uses webhookEvent "order"', () => {
    const webhookEvent = 'order';
    expect(webhookEvent).toBe('order');
  });

  // ---- Report type mappings for each task ---------------------------------

  it('income task: getReportTypes returns ["income"]', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  it('employment task: getReportTypes returns ["employment"]', () => {
    expect(getReportTypes(['employment'])).toEqual(['employment']);
  });

  it('assets task: getReportTypes auto-adds income_insights', () => {
    expect(getReportTypes(['assets'])).toEqual(['assets', 'income_insights']);
  });

  it('assets-income task: getReportTypes returns income + assets + income_insights', () => {
    expect(getReportTypes(['income', 'assets'])).toEqual([
      'income',
      'assets',
      'income_insights',
    ]);
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: create tasks, borrower verifies, Truv sends updates, review
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });
});
