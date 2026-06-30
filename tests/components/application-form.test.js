import { describe, it, expect, vi } from 'vitest';

// Mock the API base module to avoid pulling in browser globals (window.location),
// which ApplicationForm reaches via its CompanySearch import.
vi.mock('../../src/components/hooks.js', () => ({
  API_BASE: 'http://localhost:3000',
}));

import { getEmployerError } from '../../src/components/ApplicationForm.jsx';

// ---------------------------------------------------------------------------
// ApplicationForm employer validation (IMP-183)
//
// Some products (pll, deposit_switch) deeplink Bridge into a specific employer
// via company_mapping_id. Submitting without an employer selection used to send
// the request to Truv anyway, which rejected it with an opaque 500 ("Internal
// server error"). The form now takes a `requireEmployer` prop: when set, submit
// is blocked with an inline error until an employer is selected from the list.
//
// getEmployerError() is the exact gate handleSubmit uses: a non-null return
// blocks the submit and is rendered as the inline error message; null means
// onSubmit fires.
// ---------------------------------------------------------------------------

describe('ApplicationForm getEmployerError', () => {
  // ---- requireEmployer: blocks submit without an employer -----------------

  it('blocks submit (returns the inline error message) when requireEmployer is set and no employer is selected', () => {
    const err = getEmployerError(true, { name: '', id: null });
    expect(err).toBe('Please select an employer from the list — this product requires one.');
  });

  it('blocks submit when the user typed a name but never picked one from the list (no id)', () => {
    // CompanySearch only assigns an id when a result is clicked; free text alone
    // has no company_mapping_id and would still fail at Truv.
    const err = getEmployerError(true, { name: 'Home Depot', id: null });
    expect(err).not.toBeNull();
  });

  // ---- requireEmployer: submits once an employer is selected --------------

  it('allows submit (returns null) when requireEmployer is set and an employer is selected', () => {
    expect(getEmployerError(true, { name: 'Home Depot', id: 'cmp_42' })).toBeNull();
  });

  // ---- without requireEmployer: employer stays optional -------------------

  it('allows submit with no employer when requireEmployer is false (default behavior)', () => {
    expect(getEmployerError(false, { name: '', id: null })).toBeNull();
  });

  it('allows submit even with a missing employer object when requireEmployer is false', () => {
    expect(getEmployerError(false, undefined)).toBeNull();
  });
});
