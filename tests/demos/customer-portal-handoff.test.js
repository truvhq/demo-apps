import { describe, it, expect, vi } from 'vitest';

// The portal module imports the component barrel, which reads window at load.
vi.mock('../../src/components/index.js', () => ({ API_BASE: '' }));
vi.mock('../../src/demos/customer-portal.css', () => ({}));
import { doneProducts, planHandoff } from '../../src/demos/scaffolding/customer-portal-portal.jsx';

// Hand-off to the applicant's phone: never discard data already connected on this device,
// and send a phone order only for what is left.
describe('Customer Portal phone hand-off', () => {
  it('reads connected products from the order (employers = income, financial_accounts = assets)', () => {
    expect(doneProducts({})).toEqual([]);
    expect(doneProducts({ employers: [{ status: 'pending' }], financial_accounts: [{ status: 'sent' }] })).toEqual([]);
    expect(doneProducts({ employers: [{ status: 'completed' }] })).toEqual(['income']);
    expect(doneProducts({ employers: [{ status: 'pending', last_task_status: 'done' }], financial_accounts: [{ status: 'completed' }] })).toEqual(['income', 'assets']);
  });

  it('nothing connected: cancel this order and send every product', () => {
    expect(planHandoff(['income', 'assets'], [], false)).toEqual({ action: 'restart', phoneProducts: ['income', 'assets'], cancelDesk: true });
  });

  it('partly done: keep this order, send only the rest', () => {
    expect(planHandoff(['income', 'assets'], ['income'], true)).toEqual({ action: 'remaining', phoneProducts: ['assets'], cancelDesk: false });
    expect(planHandoff(['income', 'assets'], ['assets'], false)).toEqual({ action: 'remaining', phoneProducts: ['income'], cancelDesk: false });
  });

  it('a connection succeeded but the order does not show it yet: never cancel', () => {
    expect(planHandoff(['income'], [], true)).toEqual({ action: 'wait', phoneProducts: [], cancelDesk: false });
  });

  it('everything already connected: nothing to hand off', () => {
    expect(planHandoff(['income'], ['income'], true).action).toBe('complete');
  });
});
