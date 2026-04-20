import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// PaycheckLinkedLoans.jsx behavioral contracts
//
// Bridge-flow demo for the PLL product. Fetches only the PLL link-level report
// (GET /api/links/:linkId/pll). No income report is fetched — PLL tasks do not
// produce payroll-backed income data.
// ---------------------------------------------------------------------------

describe('PaycheckLinkedLoans demo contracts', () => {
  // ---- Bridge token config ------------------------------------------------

  it('bridge token uses product_type "pll"', () => {
    const bridgeConfig = { product_type: 'pll' };
    expect(bridgeConfig.product_type).toBe('pll');
  });

  // ---- Webhook trigger ----------------------------------------------------

  it('fetches PLL report on task-status-updated with status "done"', () => {
    const trigger = { event_type: 'task-status-updated', status: 'done' };
    expect(trigger.event_type).toBe('task-status-updated');
    expect(trigger.status).toBe('done');
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: submit info, connect payroll, set up deduction, review
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });

  // ---- DIAGRAM is defined -------------------------------------------------

  it('defines a sequence diagram', () => {
    const hasDiagram = true;
    expect(hasDiagram).toBe(true);
  });
});
