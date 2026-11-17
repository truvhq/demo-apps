import { describe, it, expect } from 'vitest';
import { VERTICAL_META } from '../../src/industries.meta.js';
import { orderedIndustries, currentIndustryId } from '../../src/components/VerticalSwitcher.jsx';

// ---------------------------------------------------------------------------
// VerticalSwitcher — the header use-case switcher that lets you jump between
// verticals. Public Sector is the default landing (App.parseHash), so the other
// verticals are reachable only here. These cover the pure pieces: the menu order
// and the active-vertical detection. currentIndustryId reads window.location, so
// window is stubbed per case (the vitest environment is 'node', no DOM).
// ---------------------------------------------------------------------------

describe('orderedIndustries', () => {
  it('lists Public Sector first, then the rest, and nothing is dropped', () => {
    const ordered = orderedIndustries();
    expect(ordered[0].id).toBe('public-sector');
    expect(ordered.map(v => v.id).sort()).toEqual(VERTICAL_META.map(v => v.id).sort());
    expect(ordered.length).toBe(VERTICAL_META.length);
  });
});

describe('currentIndustryId', () => {
  const withHash = (hash, fn) => {
    const prev = globalThis.window;
    globalThis.window = { location: { hash } };
    try { return fn(); } finally { globalThis.window = prev; }
  };

  it('reads the first hash segment', () => {
    expect(withHash('#consumer-credit/smart-routing/bridge/abc', currentIndustryId)).toBe('consumer-credit');
    expect(withHash('#mortgage', currentIndustryId)).toBe('mortgage');
  });

  it('falls back to public-sector on the bare root (matches parseHash default)', () => {
    expect(withHash('', currentIndustryId)).toBe('public-sector');
    expect(withHash('#', currentIndustryId)).toBe('public-sector');
  });
});

// ---------------------------------------------------------------------------
// Drift guard: the switcher's labels (industries.meta.js) and the App registry
// must stay in sync — App.INDUSTRIES is built by spreading VERTICAL_META, so the
// id/name/desc the switcher shows must match what the router/landing pages use.
// App.jsx reads window.location during routing and its demo graph reads
// window.location.origin at import, so window is stubbed before the dynamic
// import.
// ---------------------------------------------------------------------------
describe('meta stays in sync with the App registry', () => {
  it('every vertical in App.INDUSTRIES has matching id/name/desc in VERTICAL_META', async () => {
    globalThis.window = { location: { hash: '', origin: 'http://localhost' }, addEventListener() {}, removeEventListener() {} };
    const { INDUSTRIES } = await import('../../src/App.jsx');
    const metaById = Object.fromEntries(VERTICAL_META.map(v => [v.id, v]));

    expect(INDUSTRIES.map(i => i.id).sort()).toEqual(VERTICAL_META.map(v => v.id).sort());
    for (const ind of INDUSTRIES) {
      expect(metaById[ind.id]).toBeTruthy();
      expect(ind.name).toBe(metaById[ind.id].name);
      expect(ind.desc).toBe(metaById[ind.id].desc);
    }
  });
});
