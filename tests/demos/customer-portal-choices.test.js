import { describe, it, expect, vi } from 'vitest';

// The portal module imports the component barrel, which reads window at load.
vi.mock('../../src/components/index.js', () => ({ API_BASE: '' }));
vi.mock('../../src/demos/customer-portal.css', () => ({}));
import { loadChoices, saveChoices } from '../../src/demos/scaffolding/customer-portal-portal.jsx';

// Minimal Storage stand-in.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

describe('Customer Portal remembered choices', () => {
  it('defaults to the hero layout with inline display when nothing is saved', () => {
    expect(loadChoices(fakeStorage())).toEqual({ layout: 'hero', display: 'inline' });
  });

  it('returns what was saved', () => {
    const storage = fakeStorage();
    saveChoices({ layout: 'slide', display: 'dialog' }, storage);
    expect(loadChoices(storage)).toEqual({ layout: 'slide', display: 'dialog' });
  });

  it('ignores unknown ids and falls back per field', () => {
    const storage = fakeStorage({ 'truv-demo-customer-portal-choices': JSON.stringify({ layout: 'gone', display: 'dialog' }) });
    expect(loadChoices(storage)).toEqual({ layout: 'hero', display: 'dialog' });
  });

  it('falls back to the defaults when the stored value is not JSON', () => {
    const storage = fakeStorage({ 'truv-demo-customer-portal-choices': '{nope' });
    expect(loadChoices(storage)).toEqual({ layout: 'hero', display: 'inline' });
  });

  it('does not throw when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadChoices(blocked)).toEqual({ layout: 'hero', display: 'inline' });
    expect(() => saveChoices({ layout: 'slide', display: 'inline' }, blocked)).not.toThrow();
  });
});
