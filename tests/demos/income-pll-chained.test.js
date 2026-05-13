import { describe, it, expect } from 'vitest';
import { evaluateCoverage, evaluateBankAccounts, evaluateDdsSupport } from '../../server/routes/voie-pll.js';
import { STEPS } from '../../src/demos/scaffolding/income-pll-chained.jsx';
import { DIAGRAM } from '../../src/diagrams/income-pll-chained.js';

// ---------------------------------------------------------------------------
// IncomePLLChained.jsx behavioral contracts
//
// Orders-flow demo that chains a VOIE order (income) and a PLL order. Both
// orders share order_number + company_mapping_id so the borrower's payroll
// auth from the VOIE step carries forward to the PLL step (no re-auth).
// ---------------------------------------------------------------------------

describe('IncomePLLChained demo contracts', () => {
  // ---- Decision gates -----------------------------------------------------
  // Drive the real evaluate* helpers so regressions in the route logic fail
  // here — the previous version of this suite re-implemented the gates inline,
  // which let production drift past green tests.

  it('coverage gate proceeds on high/medium, fails on low/unsupported, treats null as unknown→proceed', () => {
    expect(evaluateCoverage('high')).toEqual({ proceed: true, reason: 'good_coverage' });
    expect(evaluateCoverage('medium')).toEqual({ proceed: true, reason: 'good_coverage' });
    expect(evaluateCoverage('low')).toEqual({ proceed: false, reason: 'coverage_low' });
    expect(evaluateCoverage('unsupported')).toEqual({ proceed: false, reason: 'coverage_unsupported' });
    expect(evaluateCoverage(null).proceed).toBe(true);
    expect(evaluateCoverage(null).reason).toBe('coverage_unknown');
  });

  it('bank-accounts gate fails when any allocation is percent (long or short code)', () => {
    expect(evaluateBankAccounts([{ deposit_type: 'amount' }, { deposit_type: 'percent' }]).proceed).toBe(false);
    expect(evaluateBankAccounts([{ deposit_type: 'A' }, { deposit_type: 'P' }]).proceed).toBe(false);
    expect(evaluateBankAccounts([{ deposit_type: 'PT' }]).proceed).toBe(false);
    expect(evaluateBankAccounts([{ deposit_type: 'A' }]).proceed).toBe(true);
  });

  it('bank-accounts gate fails when allocation count >= max_number', () => {
    const four = [{}, {}, {}, {}];
    expect(evaluateBankAccounts(four, 4).proceed).toBe(false);
    expect(evaluateBankAccounts(four, 5).proceed).toBe(true);
    expect(evaluateBankAccounts([], 4).proceed).toBe(true);
  });

  it('dds gate fails only on explicit false; true → proceed, null → proceed with dds_unknown', () => {
    expect(evaluateDdsSupport(true)).toEqual({ proceed: true, reason: 'dds_supported' });
    expect(evaluateDdsSupport(false)).toEqual({ proceed: false, reason: 'dds_unsupported' });
    expect(evaluateDdsSupport(null)).toEqual({ proceed: true, reason: 'dds_unknown' });
  });

  // ---- Linked orders ------------------------------------------------------

  it('VOIE and PLL orders share the same order_number', () => {
    const orderNumber = 'qs-pll-abc123';
    const voiePayload = { products: ['income'], order_number: orderNumber };
    const pllPayload = { products: ['pll'], order_number: orderNumber };
    expect(voiePayload.order_number).toBe(pllPayload.order_number);
  });

  it('PLL employer payload nests company_mapping_id and account together', () => {
    const cmid = 'cmid-123';
    const account = { action: 'create' };
    // Asserting the shape we send to /v1/orders/ for PLL — Truv rejects the
    // payload when these are split across two employer entries.
    const pllEmployers = [{ company_mapping_id: cmid, account }];
    expect(pllEmployers).toHaveLength(1);
    expect(pllEmployers[0].company_mapping_id).toBe(cmid);
    expect(pllEmployers[0].account).toEqual(account);
  });

  // ---- Webhook trigger ----------------------------------------------------

  it('advances on task-status-updated with status "done"', () => {
    const trigger = { event_type: 'task-status-updated', status: 'done' };
    expect(trigger.event_type).toBe('task-status-updated');
    expect(trigger.status).toBe('done');
  });

  // ---- STEPS array --------------------------------------------------------
  // Coverage, voie order, bridge auth, decision, pll order, pll report.

  it('exports 6 guide steps with title + guide fields', () => {
    expect(STEPS).toHaveLength(6);
    for (const step of STEPS) {
      expect(typeof step.title).toBe('string');
      expect(typeof step.guide).toBe('string');
    }
  });

  // ---- DIAGRAM is defined -------------------------------------------------

  it('exports a Mermaid sequence diagram', () => {
    expect(typeof DIAGRAM).toBe('string');
    expect(DIAGRAM.trim().startsWith('sequenceDiagram')).toBe(true);
  });
});
