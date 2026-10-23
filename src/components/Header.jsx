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
import { BrandLogo } from './BrandLogo.jsx';
import { PhosphorIcons } from './PhosphorIcons.jsx';

// Chevron separator drawn between breadcrumb segments.
function Chevron({ theme }) {
  if (theme === 'checkr') return <PhosphorIcons.chevronRight size={12} className="shrink-0 text-muted" />;
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
//   theme : 'checkr' for the Public Sector pages (Truv by Checkr logo and
//           colors); omit for the original look everywhere else.
// Hash-based routing means each segment is a plain <a href="#..."> anchor;
// clicking it fires hashchange and the router re-renders the target view.
export function Breadcrumb({ trail = [], theme }) {
  const checkr = theme === 'checkr';
  return (
    <nav aria-label="Breadcrumb" class="flex items-center gap-2 min-w-0">
      {/* Logo is the implicit Home root of every breadcrumb */}
      <a href="#" aria-label={checkr ? 'Truv by Checkr home' : 'Truv home'} class="flex items-center shrink-0 hover:opacity-80 transition-opacity">
        {checkr ? <BrandLogo height={30} /> : <Icons.truvLogo height={21} className="text-text" />}
      </a>
      {/* Trail: hidden only on phones (<sm), where the row cannot physically
          fit it; the logo alone remains as the Home link. From sm up the FULL
          trail is always shown — segments truncate rather than disappear, so the
          breadcrumb never collapses to a single element.
          Flat layout (chevrons and links are direct flex children, not per-segment
          sub-flex spans) so a squeezed link can never overflow its wrapper and
          overlap the next one. Truncation is prioritized via flex-shrink: leading
          segments collapse FIRST — down to a bare "…" in the tightest case (huge
          shrink + a floor just wide enough for the ellipsis) — and only once they
          are collapsed does the current segment start truncating (default shrink +
          a wider readable floor). */}
      <span class="hidden sm:flex items-center gap-2 min-w-0">
        {trail.map((seg, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={seg.href || seg.label}>
              <Chevron theme={theme} />
              <a
                href={seg.href}
                aria-current={isLast ? 'page' : undefined}
                // The current segment's href equals the current hash, so a click
                // won't fire hashchange. Restart the active view instead (App
                // remounts it) so the click resets the demo to its first screen.
                onClick={isLast ? () => window.dispatchEvent(new CustomEvent('truv:restart-view')) : undefined}
                // Leading segments carry a huge flex-shrink + a floor wide enough
                // for a COMPLETE ellipsis ("C…", never a clipped "C."), so they
                // collapse to that ellipsis FIRST. The current segment has min-w-0
                // (no rigid floor) so that, once the leading crumbs are ellipses,
                // it truncates cleanly with its own "…" instead of being
                // hard-clipped by the container edge.
                class={`${checkr
                  ? 'text-[13px] font-medium text-[#474c52] hover:text-[#1b1c1f] hover:underline decoration-2 underline-offset-[6px] transition-colors duration-[400ms] truncate'
                  : 'text-[13px] font-medium text-muted hover:text-text transition-colors truncate'} ${isLast ? 'min-w-0' : 'shrink-[9999] min-w-[1.5rem]'}`}
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
//   trail        : breadcrumb segments [{ label, href }] (last = current page)
//   badge        : small label pill shown after the breadcrumb (root pages only)
//   sticky       : whether the header sticks to the top on scroll
//   githubInPanel: true when the shell has a Dev button that hosts the GitHub
//                  link in the panel below lg (demo Layout) — the header then
//                  hides its own GitHub link below lg to avoid duplication
//   theme        : 'checkr' for the Public Sector pages; omit for the original look
//   children     : optional right-edge slot (demo Layout puts the device toggle
//                  and the Dev-panel button here)
export function Header({ trail, badge, sticky, githubInPanel, theme, children }) {
  const barClass = theme === 'checkr'
    ? 'flex items-center h-14 bg-white border-b border-[#d8dee5]'
    : 'flex items-center h-12 bg-white/80 backdrop-blur-xl border-b border-border/40';
  return (
    <header class={`${barClass} ${sticky ? 'sticky top-0 z-10' : ''}`}>
      {/* overflow-hidden: when the bar runs out of width the breadcrumb clips
          instead of painting over the action buttons (the logo is shrink-0). */}
      <div class="flex items-center gap-3 px-3 sm:px-6 flex-1 min-w-0 overflow-hidden">
        <Breadcrumb trail={trail} theme={theme} />
        {/* Optional badge label */}
        {badge && <div class="hidden sm:block text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md truncate">{badge}</div>}
      </div>
      <div class="shrink-0 pr-3 sm:pr-5">
        <HeaderActions githubInPanel={githubInPanel} theme={theme} />
      </div>
      {children}
    </header>
  );
}
