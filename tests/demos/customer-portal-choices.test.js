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

// The portal layout is always the stepped wizard now; only the Truv display (inline vs the
// button-triggered dialog) is a remembered choice. loadChoices always returns layout:'slide'.
describe('Customer Portal remembered choice', () => {
  it('defaults to the inline display in the stepped layout when nothing is saved', () => {
    expect(loadChoices(fakeStorage())).toEqual({ layout: 'slide', display: 'inline' });
  });

  it('returns the saved display (and only persists display)', () => {
    const storage = fakeStorage();
    saveChoices({ display: 'dialog' }, storage);
    expect(JSON.parse(storage.data['truv-demo-customer-portal-choices'])).toEqual({ display: 'dialog' });
    expect(loadChoices(storage)).toEqual({ layout: 'slide', display: 'dialog' });
  });

  it('ignores an unknown display and falls back to inline', () => {
    const storage = fakeStorage({ 'truv-demo-customer-portal-choices': JSON.stringify({ display: 'gone' }) });
    expect(loadChoices(storage)).toEqual({ layout: 'slide', display: 'inline' });
  });

  it('falls back to the default when the stored value is not JSON', () => {
    const storage = fakeStorage({ 'truv-demo-customer-portal-choices': '{nope' });
    expect(loadChoices(storage)).toEqual({ layout: 'slide', display: 'inline' });
  });

  it('does not throw when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadChoices(blocked)).toEqual({ layout: 'slide', display: 'inline' });
    expect(() => saveChoices({ display: 'dialog' }, blocked)).not.toThrow();
  });

  it('does not throw when reading the global localStorage itself throws', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(loadChoices()).toEqual({ layout: 'slide', display: 'inline' });
      expect(() => saveChoices({ display: 'dialog' })).not.toThrow();
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig); else delete globalThis.localStorage;
    }
  });
});
