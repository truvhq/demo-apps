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
const segBase = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium transition cursor-pointer';
const segActive = 'bg-white shadow-sm text-gray-900';
const segInactive = 'text-gray-500 hover:text-gray-700';
const segGroup = 'flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg';

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
  //
  // Below sm the mobile mockup is dropped entirely (responsive classes only, so
  // the tree stays stable across resizes): the visitor's own device is the
  // phone, and a bezel shrunk to a ~200px sliver is unusable. The preview
  // renders as a plain full-height card instead.
  const outerClass = isMobile
    ? 'flex flex-col items-center w-full flex-1 min-h-0 sm:pt-10 sm:pb-6'
    : 'flex w-full h-full';
  // Mobile sm+: gray phone bezel with phone-shaped aspect ratio; height tries
  // to hit the original 804px but caps at 100% of outer (max-h-full) so it
  // shrinks on short viewports — and min-h keeps it from shrinking below a
  // usable size (the host page scrolls instead: <main> is overflow-y-auto).
  // Width follows from aspect-ratio. Desktop: invisible flex passthrough so
  // the inner "screen" fills the column.
  const frameClass = isMobile
    ? 'relative w-full flex-1 min-h-0 max-w-full sm:w-auto sm:flex-none sm:bg-gray-900 sm:rounded-[2.75rem] sm:p-3 sm:shadow-2xl sm:h-[804px] sm:min-h-[480px] sm:max-h-full sm:aspect-[414/804]'
    : 'flex flex-1 w-full';
  const overlayTopClass = isMobile
    ? 'hidden sm:block absolute top-5 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-full z-10'
    : 'hidden';
  // Mobile: white phone screen filling the bezel (size driven by frame above);
  // below sm it reads as a plain bordered card instead of a phone screen.
  // Desktop: browser window chrome — fills outer's height exactly so any scroll
  // happens inside the iframe rather than on the host page.
  const screenClass = isMobile
    ? 'bg-white rounded-xl border border-gray-200 sm:rounded-[2.25rem] sm:border-0 overflow-hidden h-full w-full flex flex-col relative'
    : 'bg-gray-100 rounded-xl shadow-2xl overflow-hidden w-full border border-gray-200 flex flex-col flex-1 min-h-0';
  // Mobile: empty status-bar reserve (only when the bezel chrome is shown).
  // Desktop: traffic lights + URL bar (rendered below).
  const chromeBarClass = isMobile
    ? 'h-0 sm:h-12 flex-shrink-0'
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
    ? 'hidden sm:block absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-black rounded-full'
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
                <div class="flex-1 mx-2 bg-white rounded-md px-3 py-1 text-[13px] text-gray-500 truncate font-mono">
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
    <div class={segGroup} role="group" aria-label="Preview device mode">
      {/* Labels collapse to icons below lg so the toggle keeps fitting in the
          top bar without any header buttons having to disappear; aria-label
          keeps the accessible name when the visual label is hidden. */}
      <button
        type="button"
        onClick={() => setMode('mobile')}
        class={`${segBase} ${mode === 'mobile' ? segActive : segInactive}`}
        aria-pressed={mode === 'mobile'}
        aria-label="Mobile"
      >
        <MobileIcon /> <span class="hidden lg:inline">Mobile</span>
      </button>
      <button
        type="button"
        onClick={() => setMode('desktop')}
        class={`${segBase} ${mode === 'desktop' ? segActive : segInactive}`}
        aria-pressed={mode === 'desktop'}
        aria-label="Desktop"
      >
        <DesktopIcon /> <span class="hidden lg:inline">Desktop</span>
      </button>
    </div>
  );
}

// Two panel controls:
//   - PanelToggleButton lives in the main top bar and never disappears: it
//     toggles the panel and reflects the current state via aria-pressed and
//     an active background (so pressing it doesn't make it vanish).
//   - HidePanelButton is the ✕ at the right end of the Panel's own tab row —
//     a secondary close affordance next to the tabs; it self-gates on
//     usePanelVisibility() and renders only while the panel is shown.
const panelBtnClass = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium transition cursor-pointer';

export function PanelToggleButton() {
  const [visible, setVisible] = usePanelVisibility();
  return (
    <button
      type="button"
      onClick={() => setVisible(!visible)}
      class={`${panelBtnClass} ${visible ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
      aria-label="Toggle dev panel"
      aria-pressed={visible}
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
      class={`${panelBtnClass} text-gray-500 hover:text-gray-700 hover:bg-gray-100`}
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
