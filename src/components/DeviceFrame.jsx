/**
 * FILE SUMMARY: DeviceFrame
 *
 * Wraps demo content in a mobile (iPhone-like) or desktop (browser-chrome) frame
 * so screens can be previewed at the form factor users will actually see them in.
 * The mode (mobile/desktop) is owned by the shared useDeviceMode() hook so the
 * top-bar toggle and the rendered frame stay in sync.
 *
 * IMPORTANT — reconciliation stability:
 * The JSX tree from <DeviceFrame> down to {children} is intentionally identical
 * across modes (5 nested <div>s with the same indices); only class strings and
 * the contents of sibling slots differ. This keeps Preact from unmounting the
 * subtree on toggle, so a child that mounts an iframe imperatively (e.g. the
 * Bridge widget container) survives mode switches without being torn down.
 * Helper components like MobileFrame/DesktopFrame would have different types
 * at the same VDOM position and force a remount, so the chrome is inlined.
 *
 * Hand-rolled in Preact + Tailwind. The popular React mockup libs
 * (react-device-mockup, react-browser-frame) are React-only and would require
 * adding preact/compat aliasing just for visual chrome — not worth the weight.
 */

import { useDeviceMode } from '../hooks/useDeviceMode.js';
import { usePanelVisibility } from '../hooks/usePanelVisibility.js';
import { useRegisterDeviceFrame } from '../hooks/deviceFramePresence.jsx';

// Shared classes for the segmented top-bar toggles (DeviceToggle, PanelToggle).
const segBase = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition cursor-pointer';
const segActive = 'bg-white shadow-sm text-gray-900';
const segInactive = 'text-gray-500 hover:text-gray-700';
const segGroup = 'flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-md';

export function DeviceFrame({ children, url = 'demo.example.com' }) {
  const [mode] = useDeviceMode();
  const isMobile = mode === 'mobile';
  // Tell the layout that a frame is present so the mobile/desktop toggle in
  // the top bar appears only when it actually controls something on screen.
  useRegisterDeviceFrame();

  // Class strings per layer. Layer order is fixed; only classes (and chrome-bar
  // contents) vary across modes — this is what keeps the tree reconcilable.
  // Mobile outer is itself a flex child that takes all available main height
  // (flex-1 min-h-0) so the phone bezel can scale down to fit short viewports
  // instead of pushing the page into a scroll.
  const outerClass = isMobile
    ? 'flex flex-col items-center w-full pt-2 pb-6 flex-1 min-h-0'
    : 'flex w-full h-full';
  // Mobile: gray phone bezel with phone-shaped aspect ratio; height tries to
  // hit the original 804px but caps at 100% of outer (max-h-full) so it shrinks
  // on short viewports. Width follows from aspect-ratio. Desktop: invisible
  // flex passthrough so the inner "screen" fills the column.
  const frameClass = isMobile
    ? 'relative bg-gray-900 rounded-[2.75rem] p-3 shadow-2xl h-[804px] max-h-full max-w-full aspect-[414/804]'
    : 'flex flex-1 w-full';
  const overlayTopClass = isMobile
    ? 'absolute top-5 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-full z-10'
    : 'hidden';
  // Mobile: white phone screen filling the bezel (size driven by frame above).
  // Desktop: browser window chrome — fills outer's height exactly so any scroll
  // happens inside the iframe rather than on the host page.
  const screenClass = isMobile
    ? 'bg-white rounded-[2.25rem] overflow-hidden h-full w-full flex flex-col relative'
    : 'bg-gray-100 rounded-xl shadow-2xl overflow-hidden w-full border border-gray-200 flex flex-col flex-1 min-h-0';
  // Mobile: empty status-bar reserve. Desktop: traffic lights + URL bar (rendered below).
  const chromeBarClass = isMobile
    ? 'h-12 flex-shrink-0'
    : 'bg-gray-200 px-4 py-2.5 flex items-center gap-3 border-b border-gray-300 flex-shrink-0';
  // `content` is a flex column so the inner wrap (a flex item with flex-1)
  // gets a definite height — necessary for h-full on iframe children to resolve.
  // Without flex-col, flex-item heights are treated as indefinite for percentage
  // resolution and h-full collapses to 0 (display:contents and bare h-full both
  // hit this).
  // No padding here on purpose: the iframe child fills edge-to-edge so Bridge
  // gets the full viewport. Forms inside the iframe add their own padding.
  // No overflow-y-auto here either: the iframe is sized exactly via h-full and
  // the iframe document handles its own scrolling, so a host-side scroll would
  // just be redundant (and at extreme sizes can cause a double scrollbar).
  const contentClass = isMobile
    ? 'flex flex-col flex-1'
    : 'bg-white flex flex-col flex-1';
  // Both modes: fill the full content area horizontally and vertically. The
  // iframe inside owns its own internal max-width for forms.
  const innerWrapClass = 'flex-1 w-full';
  const overlayBottomClass = isMobile
    ? 'absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-black rounded-full'
    : 'hidden';

  return (
    <div class={outerClass}>
      <div class={frameClass}>
        <div class={overlayTopClass} aria-hidden="true" />
        <div class={screenClass}>
          <div class={chromeBarClass} aria-hidden={isMobile ? 'true' : undefined}>
            {!isMobile && (
              <>
                <div class="flex gap-1.5">
                  <span class="w-3 h-3 rounded-full bg-red-400" />
                  <span class="w-3 h-3 rounded-full bg-yellow-400" />
                  <span class="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div class="flex-1 mx-2 bg-white rounded-md px-3 py-1 text-xs text-gray-500 truncate font-mono">
                  {url}
                </div>
              </>
            )}
          </div>
          <div class={contentClass}>
            <div class={innerWrapClass}>
              {children}
            </div>
          </div>
          <div class={overlayBottomClass} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

// Used by Layout's top bar so the toggle sits next to the panel tabs.
export function DeviceToggle() {
  const [mode, setMode] = useDeviceMode();
  return (
    <div class={segGroup}>
      <button
        type="button"
        onClick={() => setMode('mobile')}
        class={`${segBase} ${mode === 'mobile' ? segActive : segInactive}`}
        aria-pressed={mode === 'mobile'}
      >
        <MobileIcon /> Mobile
      </button>
      <button
        type="button"
        onClick={() => setMode('desktop')}
        class={`${segBase} ${mode === 'desktop' ? segActive : segInactive}`}
        aria-pressed={mode === 'desktop'}
      >
        <DesktopIcon /> Desktop
      </button>
    </div>
  );
}

// Show / Hide split into two labeled buttons that are placed in different
// regions of the layout but visually anchored to the same physical spot:
//   - ShowPanelButton lives in the main top-bar toolbar; visible only when the
//     panel is hidden, so it occupies the right-edge slot.
//   - HidePanelButton lives at the right end of the panel's tab strip (header
//     strip on lg+, overlay strip below lg); visible only when the panel is
//     shown, so it occupies the same right-edge slot from the panel's side.
// The chevron sits on the side of the label that points where the panel will
// move — left chevron + label for "expand leftward", label + right chevron for
// "collapse rightward" — so the affordance reads at a glance.
// Each button self-gates on usePanelVisibility() so callers can drop both into
// their respective layout slots without conditionals — only one ever renders.
const panelBtnClass = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer';

export function ShowPanelButton() {
  const [visible, setVisible] = usePanelVisibility();
  if (visible) return null;
  return (
    <button
      type="button"
      onClick={() => setVisible(true)}
      class={panelBtnClass}
      aria-label="Show dev panel"
    >
      <ConsoleIcon />
      <span>Dev</span>
    </button>
  );
}

export function HidePanelButton() {
  const [visible, setVisible] = usePanelVisibility();
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => setVisible(false)}
      class={panelBtnClass}
      aria-label="Close dev panel"
      title="Close dev panel"
    >
      <CloseIcon />
    </button>
  );
}

function MobileIcon() {
  return (
    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

// Terminal-style glyph: caret + underline, signalling "developer console".
function ConsoleIcon() {
  return (
    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
