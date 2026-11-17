/**
 * FILE SUMMARY: Use-case (vertical) switcher for the app header
 * DATA FLOW: Presentational: reads the current hash, navigates via #<industry>
 *
 * A small, deliberately understated control in the top-left header cluster that
 * lets you jump between the verticals (Mortgage, Public Sector, Consumer Credit,
 * Retail Banking, Coverage Analysis). Public Sector is the default landing (see
 * parseHash in App.jsx), so the other verticals are otherwise only reachable
 * here — buried, but one click away. Public Sector is listed first; the vertical
 * matching the current hash is marked active.
 *
 * The dropdown lives in a plain `relative` wrapper (no overflow-hidden ancestor
 * inside the header), so the menu is never clipped. Closes on outside click,
 * Escape (which restores focus to the trigger), or selecting an item.
 *
 * Semantics: this is a disclosure (a button toggling a panel of ordinary nav
 * links), not an ARIA `menu`. The items are plain <a> links in the natural tab
 * order, operated with Enter like any link — so there is no menu-pattern
 * keyboard contract (arrow-key roving) to implement or mis-advertise.
 */
import { useState, useRef, useEffect, useId } from 'preact/hooks';
import { VERTICAL_META } from '../industries.meta.js';

// Single-demo builds (VITE_STANDALONE_DEMO) open straight on one demo and have
// no cross-vertical navigation, so the switcher is hidden there.
const STANDALONE = (import.meta.env?.VITE_STANDALONE_DEMO || '').trim();

// Current industry id from the hash, mirroring parseHash's empty-hash default.
// Exported for unit testing.
export function currentIndustryId() {
  const seg = (window.location.hash.slice(1).split('/')[0] || '').trim();
  return seg || 'public-sector';
}

// Public Sector first (the default), then the rest in registry order.
// Exported for unit testing.
export function orderedIndustries() {
  const ps = VERTICAL_META.filter(i => i.id === 'public-sector');
  const rest = VERTICAL_META.filter(i => i.id !== 'public-sector');
  return [...ps, ...rest];
}

// 2x2 grid glyph (an "all use cases" affordance) + caret, self-contained so the
// control carries no dependency on either icon set.
function GridGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="shrink-0">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  );
}
function Caret() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 opacity-60">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}

export function VerticalSwitcher({ theme }) {
  if (STANDALONE) return null;
  const checkr = theme === 'checkr';
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const activeId = currentIndustryId();

  // Close on outside click or Escape while open. Escape returns focus to the
  // trigger (disclosure pattern) so keyboard users are not stranded on a
  // removed element.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerClass = checkr
    ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-[#474c52] rounded-[6px] px-2 py-1 hover:text-[#1b1c1f] hover:bg-[#f0f2f5] transition-colors duration-[400ms]'
    : 'inline-flex items-center gap-1.5 text-[13px] font-medium text-muted rounded-lg px-2 py-1 hover:text-text hover:bg-[#f5f5f7] transition-colors';

  // Positioning: below `sm` the trigger sits close to the left edge, so a 280px
  // panel anchored to it would overrun a ~320px phone viewport and force
  // horizontal scrolling. There, pin the panel to the viewport with equal
  // 12px gutters (fixed, left-3/right-3) under the header. From `sm` up it
  // reverts to the original left-anchored 280px dropdown — desktop unchanged.
  const panelPos = 'fixed left-3 right-3 top-14 w-auto sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[280px]';
  const panelVisual = checkr
    ? 'rounded-xl border border-[#d8dee5] bg-white shadow-lg ring-1 ring-black/5 p-1.5 z-50'
    : 'rounded-xl border border-border/60 bg-white shadow-lg ring-1 ring-black/5 p-1.5 z-50';
  const panelClass = `${panelPos} ${panelVisual}`;

  const labelClass = checkr ? 'text-[#5b616b]' : 'text-muted';
  const hoverBg = checkr ? 'hover:bg-[#f0f2f5]' : 'hover:bg-[#f5f5f7]';

  return (
    <div ref={rootRef} class="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Switch use case"
        class={triggerClass}
      >
        <GridGlyph />
        <span class="hidden sm:inline">Use cases</span>
        <Caret />
      </button>

      {open && (
        <div id={panelId} class={panelClass}>
          <div class={`px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>
            Switch use case
          </div>
          {orderedIndustries().map((ind) => {
            const isActive = ind.id === activeId;
            return (
              <a
                key={ind.id}
                href={`#${ind.id}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => setOpen(false)}
                class={`group flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${hoverBg} transition-colors ${isActive ? (checkr ? 'bg-[#f0f2f5]' : 'bg-[#f5f5f7]') : ''}`}
              >
                <div class="min-w-0 flex-1">
                  <div class={`text-[13px] font-medium ${checkr ? 'text-[#1b1c1f]' : 'text-text'}`}>{ind.name}</div>
                  <div class={`mt-0.5 text-[11px] leading-snug line-clamp-2 ${labelClass}`}>{ind.desc}</div>
                </div>
                <span class={`mt-0.5 ${isActive ? (checkr ? 'text-[#1b1c1f]' : 'text-primary') : 'invisible'}`}>
                  <Check />
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
