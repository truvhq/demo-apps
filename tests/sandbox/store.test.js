import { beforeEach, describe, expect, it } from 'vitest';

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); }, clear: () => data.clear() };
}
const store = await import('../../src/sandbox/store.js');

beforeEach(() => { globalThis.localStorage = fakeStorage(); });

describe('recently deleted', () => {
  it('keeps scenarios deleted in the same moment apart, so one can be restored without the other', () => {
    const after = store.pushTrash([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    expect(new Set(after.map(t => t.id)).size).toBe(3);
    const b = after.find(t => t.scenario.label === 'B');
    const left = store.dropTrash(b.id);
    expect(left.map(t => t.scenario.label).sort()).toEqual(['A', 'C']);
    expect(store.loadTrash()).toHaveLength(2);
  });

  it('puts the newest first and keeps only the most recent fifty', () => {
    for (let i = 0; i < 55; i++) store.pushTrash({ label: `s${i}` });
    const all = store.loadTrash();
    expect(all).toHaveLength(store.TRASH_LIMIT);
    expect(all[0].scenario.label).toBe('s54');
  });

  it('gives entries saved before ids existed a stable id of their own', () => {
    localStorage.setItem('sbx-trash', JSON.stringify([{ at: 5, scenario: { label: 'old' } }, { at: 5, scenario: { label: 'older' } }]));
    const [first, second] = store.loadTrash();
    expect(first.id).not.toBe(second.id);
    expect(store.loadTrash()[0].id).toBe(first.id);
    expect(store.dropTrash(first.id).map(t => t.scenario.label)).toEqual(['older']);
  });

  it('survives storage that is blocked', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(store.loadTrash()).toEqual([]);
    expect(() => store.pushTrash({ label: 'x' })).not.toThrow();
    expect(store.loadPrefix()).toBe('qa');
  });
});

describe('made here', () => {
  it('remembers ids and forgets them again', () => {
    store.rememberMade(['a', 'b']);
    store.forgetMade('a');
    expect([...store.loadMade()]).toEqual(['b']);
  });
});

describe('damaged storage', () => {
  it('reads a wrong shape as nothing, instead of breaking the page', () => {
    for (const bad of ['{}', '5', '"x"', '[null]', '[5]', '[{"at":1}]', '[{"scenario":5}]']) {
      localStorage.setItem('sbx-trash', bad);
      expect(store.loadTrash(), bad).toEqual([]);
    }
    for (const bad of ['{}', '5', '"x"', '[5, {}]']) {
      localStorage.setItem('sbx-made-ids', bad);
      expect([...store.loadMade()].every(x => typeof x === 'string'), bad).toBe(true);
    }
    localStorage.setItem('sbx-prefix', '123456789012345678901234');
    expect(store.loadPrefix()).toBe('qa');
    localStorage.setItem('sbx-prefix', '5');
    expect(store.loadPrefix()).toBe('qa');
  });
  it('keeps the usable entries among unusable ones', () => {
    localStorage.setItem('sbx-trash', JSON.stringify([null, { id: 'a', at: 1, scenario: { label: 'ok' } }, { at: 2 }]));
    expect(store.loadTrash().map(t => t.scenario.label)).toEqual(['ok']);
  });
});
