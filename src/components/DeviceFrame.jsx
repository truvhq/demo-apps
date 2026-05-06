/**
 * FILE SUMMARY: DeviceFrame
 *
 * Wraps demo content in a mobile (iPhone-like) or desktop (browser-chrome) frame
 * so screens can be previewed at the form factor users will actually see them in.
 * The mode (mobile/desktop) is owned by the shared useDeviceMode() hook so the
 * top-bar toggle and the rendered frame stay in sync.
 *
 * Hand-rolled in Preact + Tailwind. The popular React mockup libs
 * (react-device-mockup, react-browser-frame) are React-only and would require
 * adding preact/compat aliasing just for visual chrome — not worth the weight.
 */

import { useDeviceMode } from '../hooks/useDeviceMode.js';

export function DeviceFrame({ children, url = 'demo.example.com' }) {
  const [mode] = useDeviceMode();
  // Mobile: center the fixed-size phone frame. Desktop: fill the parent column
  // both horizontally and vertically (no centering, frame grows to the edges).
  if (mode === 'mobile') {
    return (
      <div class="flex flex-col items-center w-full pt-2 pb-6">
        <MobileFrame>{children}</MobileFrame>
      </div>
    );
  }
  return (
    <div class="flex w-full h-full">
      <DesktopFrame url={url}>{children}</DesktopFrame>
    </div>
  );
}

// Used by Layout's top bar so the toggle sits next to the panel tabs.
export function DeviceToggle() {
  const [mode, setMode] = useDeviceMode();
  const baseClass = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition cursor-pointer';
  const activeClass = 'bg-white shadow-sm text-gray-900';
  const inactiveClass = 'text-gray-500 hover:text-gray-700';
  return (
    <div class="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-md">
      <button
        type="button"
        onClick={() => setMode('mobile')}
        class={`${baseClass} ${mode === 'mobile' ? activeClass : inactiveClass}`}
        aria-pressed={mode === 'mobile'}
      >
        <MobileIcon /> Mobile
      </button>
      <button
        type="button"
        onClick={() => setMode('desktop')}
        class={`${baseClass} ${mode === 'desktop' ? activeClass : inactiveClass}`}
        aria-pressed={mode === 'desktop'}
      >
        <DesktopIcon /> Desktop
      </button>
    </div>
  );
}

function MobileFrame({ children }) {
  return (
    <div class="relative bg-gray-900 rounded-[2.75rem] p-3 shadow-2xl">
      <div class="absolute top-5 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-full z-10" />
      <div class="bg-white rounded-[2.25rem] overflow-hidden w-[390px] h-[780px] flex flex-col relative">
        <div class="h-12 flex-shrink-0" aria-hidden="true" />
        <div class="flex-1 overflow-y-auto px-6 pt-2 pb-10">
          {children}
        </div>
        <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-black rounded-full" />
      </div>
    </div>
  );
}

// Desktop browser chrome — fills the full width and height of the main column.
// The inner page applies its own max-width so the form doesn't stretch awkwardly
// across a wide viewport, but the chrome itself reads as a real browser window.
function DesktopFrame({ children, url }) {
  return (
    <div class="bg-gray-100 rounded-xl shadow-2xl overflow-hidden w-full border border-gray-200 flex flex-col flex-1 min-h-[640px]">
      <div class="bg-gray-200 px-4 py-2.5 flex items-center gap-3 border-b border-gray-300 flex-shrink-0">
        <div class="flex gap-1.5">
          <span class="w-3 h-3 rounded-full bg-red-400" />
          <span class="w-3 h-3 rounded-full bg-yellow-400" />
          <span class="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div class="flex-1 mx-2 bg-white rounded-md px-3 py-1 text-xs text-gray-500 truncate font-mono">
          {url}
        </div>
      </div>
      <div class="bg-white px-12 py-10 flex-1 overflow-y-auto">
        <div class="max-w-lg mx-auto">
          {children}
        </div>
      </div>
    </div>
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
