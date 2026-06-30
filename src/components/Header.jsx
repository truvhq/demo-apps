/**
 * FILE SUMMARY: App header component
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Renders the top navigation bar with the Truv logo, an optional breadcrumb trail,
 * and an optional badge label. Used across Home, IndustryPage, and Layout shells.
 */

// Imports
import { Icons } from './Icons.jsx';
import { HeaderActions } from './HeaderActions.jsx';

// Props:
//   badge      : small label shown after the logo (e.g. "POS Application")
//   breadcrumb : text shown after a chevron separator (e.g. industry name)
//   sticky     : whether the header sticks to the top on scroll
export function Header({ badge, breadcrumb, sticky }) {
  // Rendering: sticky header bar with logo, breadcrumb, badge, and actions
  return (
    <header class={`flex items-center justify-between h-12 px-3 sm:px-6 bg-white/80 backdrop-blur-xl border-b border-border/40 ${sticky ? 'sticky top-0 z-10' : ''}`}>
      <div class="flex items-center gap-3 min-w-0">
        {/* Logo link */}
        <a href="#" class="flex items-center shrink-0 hover:opacity-80 transition-opacity">
          <Icons.truvLogo height={16} className="text-text" />
        </a>
        {/* Breadcrumb with chevron separator */}
        {breadcrumb && (
          <>
            <svg class="w-3 h-3 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span class="text-[13px] font-medium text-muted truncate">{breadcrumb}</span>
          </>
        )}
        {/* Optional badge label */}
        {badge && <div class="text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md truncate">{badge}</div>}
      </div>
      <HeaderActions />
    </header>
  );
}
