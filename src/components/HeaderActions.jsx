/**
 * FILE SUMMARY: Shared header action links (GitHub, Dashboard, Contact sales)
 * DATA FLOW: Presentational: outbound links only, no backend communication
 *
 * Rendered in every header (Home, IndustryPage, demo Layout). "Update API keys"
 * is intentionally NOT here — it lives only on the Home page (see Home.jsx).
 */
import { DASHBOARD_KEYS_URL, PLAYGROUND_CONFIGURE_URLS } from '../config.js';

const GITHUB_URL = 'https://github.com/truvhq/demo-apps/';

// Shared button styling for the borderless (secondary) actions.
const OUTLINE_BTN = 'text-[13px] font-medium text-[#000000] rounded-lg px-3 py-1.5 hover:bg-[#f5f5f7] active:bg-[#e8e8ed] transition-colors inline-flex items-center gap-1.5';

// External-link arrow appended to outbound links. Hidden on narrow screens to
// save space; the caller passes the breakpoint that matches its own text label
// so the arrow never shows next to a bare icon.
function ExternalArrow({ class: cls = 'hidden sm:inline' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={cls}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// GitHub mark, shared by the header link and the panel tab-row link.
function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

// GitHub link for the dev panel's tab row. Self-hides at lg+ where the header
// shows the link instead. Below lg it is the GitHub entry point on demo pages
// (the ones with a Dev button): the header suppresses its own link there, and
// this one is reached by opening the panel via Dev. Keeps its text label down
// to sm; only on phones (<640) it collapses to the bare icon.
export function GitHubPanelLink() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub"
      class="lg:hidden flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
    >
      <GitHubIcon />
      <span class="hidden sm:inline">GitHub</span>
    </a>
  );
}

// Dev Playground button: deep-links into the Mortgage Dev Playground
// (playground/pos, playground/los — a local Django+React POS/LOS pair with
// real Truv integration). `target` picks which side's /configure-truv it
// opens: 'pos' for POS-side demos, 'los' for LOS-side demos; on the Mortgage
// industry page itself (no specific demo selected yet) it defaults to 'pos'.
// Styled like GitHub/Dashboard (borderless, not the blue Contact sales CTA).
// Navigates in the same tab (not target="_blank" like the other header
// actions) — the playground carries its own "Back to Demo Apps" link, so a
// second tab would just be one more thing to manage. Passes the current hash
// route as ?from= so that link returns to this exact page.
function DevPlaygroundButton({ target }) {
  const from = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  const href = `${PLAYGROUND_CONFIGURE_URLS[target]}${from ? `?from=${encodeURIComponent(from)}` : ''}`;
  return (
    <a href={href} class={OUTLINE_BTN}>
      Dev Playground
      <ExternalArrow />
    </a>
  );
}

// GitHub placement, so the link is reachable at every width and never
// duplicated:
//   - >= lg          : always in the header (icon + label + arrow).
//   - <  lg          : on demo pages it lives in the dev panel's tab row,
//                      reached via the Dev button (see GitHubPanelLink);
//                      otherwise it stays in the header as a compact icon link.
// `githubInPanel` (set by Layout to whether the shell has a Dev button) picks
// between the two. It is tied to the Dev button's presence — not the panel's
// open/closed state — so the link never jumps between header and panel as the
// panel is toggled. Defaults to false, so pages without a Dev button — Home,
// IndustryPage, demo intro screens — always keep the header link.
//
// `devPlaygroundTarget` ('pos' | 'los', mortgage only — see IndustryPage.jsx
// and the four mortgage demos' Layout usage) renders the Dev Playground button.
export function HeaderActions({ githubInPanel = false, devPlaygroundTarget }) {
  const githubClass = OUTLINE_BTN.replace('inline-flex', githubInPanel ? 'hidden lg:inline-flex' : 'inline-flex');
  return (
    <div class="flex items-center gap-1 sm:gap-2">
      {/* Label and arrow appear from lg up; below lg the header link (when
          shown) is icon-only so it stays compact and never reads as icon+arrow. */}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub" class={githubClass}>
        <GitHubIcon />
        <span class="hidden lg:inline">GitHub</span>
        <ExternalArrow class="hidden lg:inline" />
      </a>
      <a href={DASHBOARD_KEYS_URL} target="_blank" rel="noreferrer" class={OUTLINE_BTN}>
        Dashboard
        <ExternalArrow />
      </a>
      {devPlaygroundTarget && <DevPlaygroundButton target={devPlaygroundTarget} />}
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
