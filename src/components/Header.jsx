/**
 * FILE SUMMARY: App header component
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Renders the top navigation bar with the Truv logo, an optional breadcrumb trail,
 * and an optional badge label. Used across Home, IndustryPage, and Layout shells.
 */

// Imports
import { Icons } from './Icons.jsx';
import { DASHBOARD_KEYS_URL } from '../config.js';

// Props:
//   badge          : small label shown after the logo (e.g. "POS Application")
//   breadcrumb     : text shown after a chevron separator (e.g. industry name)
//   sticky         : whether the header sticks to the top on scroll
//   onUpdateKeys   : if provided, renders an "Update API keys" action on the right
//   onOverrideKeys : if provided, renders an "Override key" action that swaps
//                    credentials in place without dropping the session
export function Header({ badge, breadcrumb, sticky, onUpdateKeys, onOverrideKeys }) {
  // Rendering: sticky header bar with logo, breadcrumb, and badge
  return (
    <header class={`flex items-center justify-between h-12 px-6 bg-white/80 backdrop-blur-xl border-b border-border/40 ${sticky ? 'sticky top-0 z-10' : ''}`}>
      <div class="flex items-center gap-3">
        {/* Logo link */}
        <a href="#" class="flex items-center hover:opacity-80 transition-opacity">
          <Icons.truvLogo height={16} className="text-text" />
        </a>
        {/* Breadcrumb with chevron separator */}
        {breadcrumb && (
          <>
            <svg class="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span class="text-[13px] font-medium text-muted">{breadcrumb}</span>
          </>
        )}
        {/* Optional badge label */}
        {badge && <div class="text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md">{badge}</div>}
      </div>
      <div class="flex items-center gap-2">
        <a
          href={DASHBOARD_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          class="text-[13px] font-medium text-[#171717] bg-white border border-[#e8e8ed] rounded-md px-3 py-1.5 hover:bg-[#f5f5f7] hover:border-[#d1d1d6] transition-colors inline-flex items-center gap-1.5"
        >
          Truv Dashboard
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
        {onOverrideKeys && (
          <button
            type="button"
            onClick={onOverrideKeys}
            class="text-[13px] font-medium text-[#171717] bg-white border border-[#e8e8ed] rounded-md px-3 py-1.5 hover:bg-[#f5f5f7] hover:border-[#d1d1d6] transition-colors"
          >
            Override key
          </button>
        )}
        {onUpdateKeys && (
          <button
            type="button"
            onClick={onUpdateKeys}
            class="text-[13px] font-medium text-[#171717] bg-white border border-[#e8e8ed] rounded-md px-3 py-1.5 hover:bg-[#f5f5f7] hover:border-[#d1d1d6] transition-colors"
          >
            Update API keys
          </button>
        )}
        <a
          href="https://truv.com/contact-sales"
          target="_blank"
          rel="noreferrer"
          class="text-[13px] font-medium text-white bg-primary rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
        >
          Contact sales
        </a>
      </div>
    </header>
  );
}
