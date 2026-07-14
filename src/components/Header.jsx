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
      {/* Trail segments are hidden on mobile; the logo alone remains as the Home link */}
      <span class="hidden sm:flex items-center gap-2 min-w-0">
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

// Props:
//   trail  : breadcrumb segments [{ label, href }] (last = current page)
//   badge  : small label pill shown after the breadcrumb (root pages only)
//   sticky : whether the header sticks to the top on scroll
export function Header({ trail, badge, sticky }) {
  return (
    <header class={`flex items-center justify-between h-12 px-3 sm:px-6 bg-white/80 backdrop-blur-xl border-b border-border/40 ${sticky ? 'sticky top-0 z-10' : ''}`}>
      <div class="flex items-center gap-3 min-w-0">
        <Breadcrumb trail={trail} />
        {/* Optional badge label */}
        {badge && <div class="hidden sm:block text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md truncate">{badge}</div>}
      </div>
      <HeaderActions />
    </header>
  );
}
