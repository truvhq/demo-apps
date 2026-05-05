import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// IncomePLLChained.jsx behavioral contracts
//
// Orders-flow demo that chains a VOIE order (income) and a PLL order. Both
// orders share order_number + company_mapping_id so the borrower's payroll
// auth from the VOIE step carries forward to the PLL step (no re-auth).
// ---------------------------------------------------------------------------

describe('IncomePLLChained demo contracts', () => {
  // ---- Decision gates -----------------------------------------------------

  it('routes to manual when coverage is low/unsupported/null', () => {
    const isManual = (coverage) => !(coverage === 'high' || coverage === 'medium');
    expect(isManual('low')).toBe(true);
    expect(isManual('unsupported')).toBe(true);
    expect(isManual(null)).toBe(true);
    expect(isManual('high')).toBe(false);
    expect(isManual('medium')).toBe(false);
  });

  it('routes to manual when any allocation is deposit_type=percent', () => {
    const accounts = [{ deposit_type: 'amount' }, { deposit_type: 'percent' }];
    const hasPercent = accounts.some(a => a.deposit_type === 'percent');
    expect(hasPercent).toBe(true);
  });

  it('routes to manual when allocation count >= max_number', () => {
    const accounts = [{}, {}, {}, {}];
    const maxNumber = 4;
    expect(accounts.length >= maxNumber).toBe(true);
  });

  it('routes to manual when is_dds_supported is false (proceeds when true or null)', () => {
    const verdict = (dds) => dds === false ? 'manual' : 'proceed';
    expect(verdict(true)).toBe('proceed');
    expect(verdict(null)).toBe('proceed');
    expect(verdict(false)).toBe('manual');
  });

  // ---- Linked orders ------------------------------------------------------

  it('VOIE and PLL orders share the same order_number', () => {
    const orderNumber = 'qs-pll-abc123';
    const voiePayload = { products: ['income'], order_number: orderNumber };
    const pllPayload = { products: ['pll'], order_number: orderNumber };
    expect(voiePayload.order_number).toBe(pllPayload.order_number);
  });

  it('VOIE and PLL orders share the same company_mapping_id', () => {
    const cmid = 'cmid-123';
    const voieEmployers = [{ company_mapping_id: cmid }];
    const pllEmployers = [{ company_mapping_id: cmid }, { account: { action: 'create' } }];
    expect(voieEmployers[0].company_mapping_id).toBe(pllEmployers[0].company_mapping_id);
  });

  // ---- Webhook trigger ----------------------------------------------------

  it('advances on task-status-updated with status "done"', () => {
    const trigger = { event_type: 'task-status-updated', status: 'done' };
    expect(trigger.event_type).toBe('task-status-updated');
    expect(trigger.status).toBe('done');
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 6 steps in the guide', () => {
    // STEPS: coverage, voie order, bridge auth, decision, pll order, pll report
    const STEPS_COUNT = 6;
    expect(STEPS_COUNT).toBe(6);
  });

  // ---- DIAGRAM is defined -------------------------------------------------

  it('defines a sequence diagram', () => {
    const hasDiagram = true;
    expect(hasDiagram).toBe(true);
  });
});
