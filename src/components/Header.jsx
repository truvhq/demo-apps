/**
 * FILE SUMMARY: App header + breadcrumb components
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Renders the top navigation bar with the Truv logo and a clickable breadcrumb
 * trail. The <Breadcrumb> is exported on its own so the demo Layout shell can
 * reuse the exact same trail rendering. Used across Home, IndustryPage, and Layout.
 */

// Imports
import { Fragment } from 'preact';
import { Icons } from './Icons.jsx';
import { HeaderActions } from './HeaderActions.jsx';

// Chevron separator drawn between breadcrumb segments.
function Chevron() {
  return (
    <svg class="w-3 h-3 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Truv logo (links to Home) followed by a clickable breadcrumb trail.
//   trail : [{ label, href }] — every segment (including the last / current
//           page) is a grey, clickable <a href="#..."> anchor. The current
//           page additionally carries aria-current="page".
// Hash-based routing means each segment is a plain <a href="#..."> anchor;
// clicking it fires hashchange and the router re-renders the target view.
export function Breadcrumb({ trail = [] }) {
  return (
    <nav aria-label="Breadcrumb" class="flex items-center gap-2 min-w-0">
      {/* Logo is the implicit Home root of every breadcrumb */}
      <a href="#" aria-label="Truv home" class="flex items-center shrink-0 hover:opacity-80 transition-opacity">
        <Icons.truvLogo height={21} className="text-text" />
      </a>
      {/* Trail segments are hidden below md (in the demo shell the top bar also
          hosts the device toggle and panel buttons, so at sm widths the trail
          would collide with them); the logo alone remains as the Home link */}
      <span class="hidden md:flex items-center gap-2 min-w-0">
        {trail.map((seg, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={seg.href || seg.label}>
              <Chevron />
              <a
                href={seg.href}
                aria-current={isLast ? 'page' : undefined}
                // The current segment's href equals the current hash, so a click
                // won't fire hashchange. Restart the active view instead (App
                // remounts it) so the click resets the demo to its first screen.
                onClick={isLast ? () => window.dispatchEvent(new CustomEvent('truv:restart-view')) : undefined}
                class="text-[13px] font-medium text-muted hover:text-text transition-colors truncate"
              >
                {seg.label}
              </a>
            </Fragment>
          );
        })}
      </span>
    </nav>
  );
}

// The single top bar used by every page (Home, IndustryPage, demo Layout), so
// the breadcrumb and action links behave identically everywhere: their
// responsive collapse depends only on viewport width, never on which screen
// is showing.
// Props:
//   trail    : breadcrumb segments [{ label, href }] (last = current page)
//   badge    : small label pill shown after the breadcrumb (root pages only)
//   sticky   : whether the header sticks to the top on scroll
//   children : optional right-edge slot (demo Layout puts the device toggle
//              and the Dev-panel button here)
export function Header({ trail, badge, sticky, children }) {
  return (
    <header class={`flex items-center h-12 bg-white/80 backdrop-blur-xl border-b border-border/40 ${sticky ? 'sticky top-0 z-10' : ''}`}>
      {/* overflow-hidden: when the bar runs out of width the breadcrumb clips
          instead of painting over the action buttons (the logo is shrink-0). */}
      <div class="flex items-center gap-3 px-3 sm:px-6 flex-1 min-w-0 overflow-hidden">
        <Breadcrumb trail={trail} />
        {/* Optional badge label */}
        {badge && <div class="hidden sm:block text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md truncate">{badge}</div>}
      </div>
      <div class="shrink-0 pr-3 sm:pr-5">
        <HeaderActions />
      </div>
      {children}
    </header>
  );
}
