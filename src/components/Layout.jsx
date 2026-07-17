/**
 * FILE SUMMARY: Main layout wrapper with unified top bar + responsive Panel
 * DATA FLOW: Presentational: no direct backend communication
 *
 * App shell that wraps every demo screen after the intro. Renders a single top
 * bar (logo + badge | device toggle | panel toggle | panel tabs) and a
 * main/sidebar split below. The Panel's tab navigation has been lifted up to
 * this top bar so the toolbar, device-frame switcher, panel toggle, and tab
 * nav all live on the same row.
 *
 * Panel layout is viewport-driven:
 *   - lg+ (≥1024px) : Panel renders as the right `<aside>` sidebar; tab nav lives
 *                     in the top bar aligned with the sidebar column.
 *   - below lg      : Panel renders as a full-bleed overlay over the content row,
 *                     layered above <main> so the iframe inside any DeviceFrame
 *                     stays mounted underneath. Tab nav renders inside the overlay.
 * The user-driven `usePanelVisibility` toggle controls whether the Panel renders
 * at all in either case. The split between sidebar/overlay is pure CSS so it
 * reacts to live resizing without remounting the panel subtree.
 *
 * Pass hidePanel=true (used by intro/form screens) to hide both toggles and the
 * panel entirely regardless of user preference.
 */

import { useState, useEffect } from 'preact/hooks';
import { Panel, TabButton } from './Panel.jsx';
import { Breadcrumb } from './Header.jsx';
import { HeaderActions } from './HeaderActions.jsx';
import { getBreadcrumbTrail } from '../App.jsx';
import { DeviceToggle, ShowPanelButton, HidePanelButton } from './DeviceFrame.jsx';
import { useHasDeviceFrame } from '../hooks/deviceFramePresence.jsx';
import { usePanelVisibility } from '../hooks/usePanelVisibility.js';

// Props:
//   steps       : step list passed to Panel sidebar
//   panel       : extra content passed to Panel sidebar (apiLogs, bridgeEvents, webhooks, ...)
//   hidePanel   : if true, hides the sidebar entirely (and the tab nav + toggles)
//   children    : main content area
// The breadcrumb (industry > demo) is derived from the current route, so demos
// no longer pass a badge — any `badge` prop still passed by callers is ignored.
export function Layout({ steps, panel, hidePanel, children }) {
  const [activeTab, setActiveTab] = useState('guide');
  const hasDeviceFrame = useHasDeviceFrame();
  const [panelVisible, setPanelVisible] = usePanelVisibility();

  // Every demo opens with the dev panel showing on wide screens, even if a
  // prior session left it closed. The in-session toggle still works; this only
  // sets the starting state when a demo mounts. Narrow screens keep the overlay
  // closed by default (opening it there is a transient inspection action).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches) {
      setPanelVisible(true);
    }
    // Run once on mount (i.e. once per demo entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apiLogs = panel?.apiLogs || [];
  const bridgeEvents = panel?.bridgeEvents || [];
  const webhooks = panel?.webhooks || [];
  const tabs = [
    { id: 'guide', label: 'Guide' },
    { id: 'api', label: 'API', count: apiLogs.length },
    { id: 'bridge', label: 'Bridge', count: bridgeEvents.length },
    { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
  ];

  const showPanel = !hidePanel && panelVisible;

  return (
    <div class="h-screen flex flex-col">
      {/* Unified top bar: logo+badge | device toggle | panel toggle | panel tabs */}
      <header class="flex items-center h-12 bg-white/80 backdrop-blur-xl border-b border-border/40">
        {/* overflow-hidden: when the bar runs out of width the breadcrumb clips
            instead of painting over the action buttons (the logo is shrink-0). */}
        <div class="flex items-center gap-3 px-3 sm:px-6 flex-1 min-w-0 overflow-hidden">
          <Breadcrumb trail={getBreadcrumbTrail()} />
        </div>
        {/* Shared header actions (GitHub, Dashboard, Contact sales). In compact
            mode the GitHub link hides on mobile since the "Dev" panel toggle also
            occupies the right edge here. */}
        <div class="pr-5 shrink-0">
          <HeaderActions compact={!hidePanel} />
        </div>
        {!hidePanel && (
          <>
            {/* Device toggle: only shown when a DeviceFrame is currently mounted
                somewhere in the tree (auto-detected via deviceFramePresence).
                Hidden below sm — there the frame renders full-bleed with no
                mockup, so the toggle would control nothing visible. */}
            {hasDeviceFrame && (
              <div class={`hidden sm:block pl-4 ${showPanel ? 'pr-6' : 'pr-2'}`}>
                <DeviceToggle />
              </div>
            )}
            {/* ShowPanelButton: lives in the main toolbar at the right edge of the
                header. Only rendered while the panel is hidden — when the panel is
                shown the symmetric HidePanelButton inside the tab strip takes over
                the same physical slot, so this padded wrapper must not linger (it
                would inflate the gap between Contact sales and the tab-strip divider). */}
            {!showPanel && (
              <div class={`pr-5 ${hasDeviceFrame ? '' : 'pl-4'}`}>
                <ShowPanelButton />
              </div>
            )}
            {/* Top-bar tab nav (lg+ only). Renders only when the panel is visible.
                Tabs flex-fill the strip and HidePanelButton anchors at the right
                edge — the same pixel column that the ShowPanelButton occupied. */}
            {showPanel && (
              <div class="hidden lg:flex w-1/3 min-w-0 border-l border-border/40 items-center gap-0.5 px-5 h-full">
                <div class="flex items-center gap-0.5 flex-1 min-w-0">
                  {tabs.map(t => (
                    <TabButton key={t.id} active={activeTab === t.id} label={t.label} count={t.count} onClick={() => setActiveTab(t.id)} />
                  ))}
                </div>
                <HidePanelButton />
              </div>
            )}
          </>
        )}
      </header>
      <div class="relative flex flex-1 min-h-0">
        <main class={`flex-1 min-w-0 ${hidePanel ? 'flex flex-col' : 'flex flex-col overflow-y-auto px-4 py-4 sm:px-8 sm:py-6'}`}>
          {children}
        </main>
        {showPanel && (
          <Panel
            steps={steps}
            panel={panel}
            activeTab={activeTab}
            tabs={tabs}
            onTabChange={setActiveTab}
          />
        )}
      </div>
    </div>
  );
}
