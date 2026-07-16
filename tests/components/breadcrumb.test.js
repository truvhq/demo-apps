import { describe, it, expect } from 'vitest';
import { Breadcrumb } from '../../src/components/Header.jsx';

// ---------------------------------------------------------------------------
// Breadcrumb rendering contract
//
// The header breadcrumb must be a real, clickable trail: the Truv logo links
// home, and every segment — including the last one (the current page) — is a
// grey <a href="#..."> anchor so hash routing navigates on click. The current
// page additionally carries aria-current="page".
//
// Breadcrumb is a pure, hook-free component, so we can call it directly and
// walk the returned preact vnode tree without a DOM.
// ---------------------------------------------------------------------------

// Flatten a preact vnode tree into every element/component vnode it contains.
function collect(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return out; }
  if (typeof node !== 'object') return out; // string / number leaf
  out.push(node);
  const kids = node.props?.children;
  if (kids !== undefined) collect(kids, out);
  return out;
}

const textOf = (v) => {
  const c = v?.props?.children;
  return Array.isArray(c) ? c.join('') : String(c ?? '');
};

describe('Breadcrumb', () => {
  it('always renders the Truv logo as a home ("#") link', () => {
    const anchors = collect(Breadcrumb({ trail: [] })).filter(n => n.type === 'a');
    expect(anchors.map(a => a.props.href)).toContain('#');
  });

  it('renders every segment — including the current page — as a grey link', () => {
    const trail = [
      { label: 'Mortgage', href: '#mortgage' },
      { label: 'POS Tasks', href: '#mortgage/pos-tasks' },
    ];
    const anchors = collect(Breadcrumb({ trail })).filter(n => n.type === 'a');
    const hrefs = anchors.map(a => a.props.href);

    // Logo (#) + both segments are links, including the current page.
    expect(hrefs).toContain('#');
    expect(hrefs).toContain('#mortgage');
    expect(hrefs).toContain('#mortgage/pos-tasks');
    expect(textOf(anchors.find(a => a.props.href === '#mortgage'))).toBe('Mortgage');

    // The current-page segment is a grey link marked aria-current="page".
    const current = anchors.find(a => a.props.href === '#mortgage/pos-tasks');
    expect(current).toBeTruthy();
    expect(current.props['aria-current']).toBe('page');
    expect(current.props.class).toContain('text-muted');
    expect(textOf(current)).toBe('POS Tasks');
  });

  it('restarts the active view when the current segment is clicked (ancestors just navigate)', () => {
    const trail = [
      { label: 'Mortgage', href: '#mortgage' },
      { label: 'LOS', href: '#mortgage/los' },
    ];
    const anchors = collect(Breadcrumb({ trail })).filter(n => n.type === 'a');
    const ancestor = anchors.find(a => a.props.href === '#mortgage');
    const current = anchors.find(a => a.props.href === '#mortgage/los');

    // Ancestors navigate via href alone — no restart handler.
    expect(ancestor.props.onClick).toBeUndefined();

    // The current segment can't fire hashchange (href === current hash), so it
    // dispatches a restart event that App turns into a remount.
    expect(typeof current.props.onClick).toBe('function');
    const events = [];
    const prev = { window: globalThis.window, CustomEvent: globalThis.CustomEvent };
    globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
    globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
    try {
      current.props.onClick();
    } finally {
      globalThis.window = prev.window;
      globalThis.CustomEvent = prev.CustomEvent;
    }
    expect(events).toContain('truv:restart-view');
  });
});

// ---------------------------------------------------------------------------
// getBreadcrumbTrail resolves the current hash into [industry, demo] segments
// against the INDUSTRIES registry. Imported dynamically after stubbing window,
// since App.jsx reads window.location during routing.
// ---------------------------------------------------------------------------
describe('getBreadcrumbTrail', () => {
  async function trailFor(hash) {
    globalThis.window = { location: { hash }, addEventListener() {}, removeEventListener() {} };
    const { getBreadcrumbTrail } = await import('../../src/App.jsx');
    return getBreadcrumbTrail();
  }

  it('returns industry + demo segments for a demo route', async () => {
    const trail = await trailFor('#mortgage/pos-tasks');
    expect(trail).toEqual([
      { label: 'Mortgage', href: '#mortgage' },
      { label: 'POS Tasks', href: '#mortgage/pos-tasks' },
    ]);
  });

  it('returns just the industry segment on an industry route', async () => {
    const trail = await trailFor('#consumer-credit');
    expect(trail).toEqual([{ label: 'Consumer Credit', href: '#consumer-credit' }]);
  });

  it('returns an empty trail at the Home root', async () => {
    expect(await trailFor('')).toEqual([]);
  });
});
