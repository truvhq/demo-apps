/**
 * FILE SUMMARY: Shared header action links (GitHub, Dashboard, Contact sales)
 * DATA FLOW: Presentational: outbound links only, no backend communication
 *
 * Rendered in every header (Home, IndustryPage, demo Layout). "Update API keys"
 * is intentionally NOT here — it lives only on the Home page (see Home.jsx).
 */
import { DASHBOARD_KEYS_URL } from '../config.js';

const GITHUB_URL = 'https://github.com/truvhq/demo-apps/';

// Shared button styling for the borderless (secondary) actions.
const OUTLINE_BTN = 'text-[13px] font-medium text-[#000000] rounded-lg px-3 py-1.5 hover:bg-[#f5f5f7] active:bg-[#e8e8ed] transition-colors inline-flex items-center gap-1.5';

// External-link arrow appended to outbound links. Hidden on narrow screens to
// save space; `visibleFrom` matches the breakpoint where the link's own text
// label appears, so the arrow never shows next to a bare icon.
function ExternalArrow({ visibleFrom = 'sm' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={visibleFrom === 'md' ? 'hidden md:inline' : 'hidden sm:inline'}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// One responsive behavior on every page, and no button ever disappears: on
// narrow screens the links only shed decoration (the GitHub text label and the
// external arrows), never the button itself.
export function HeaderActions() {
  return (
    <div class="flex items-center gap-1 sm:gap-2">
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub" class={OUTLINE_BTN}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
        </svg>
        <span class="hidden md:inline">GitHub</span>
        <ExternalArrow visibleFrom="md" />
      </a>
      <a href={DASHBOARD_KEYS_URL} target="_blank" rel="noreferrer" class={OUTLINE_BTN}>
        Dashboard
        <ExternalArrow />
      </a>
      <a
        href="https://truv.com/contact-sales"
        target="_blank"
        rel="noreferrer"
        class="ml-2 text-[13px] font-medium text-white bg-primary rounded-lg px-3 py-1.5 hover:bg-primary-hover active:bg-primary-active transition-colors whitespace-nowrap"
      >
        Contact sales
      </a>
    </div>
  );
}
