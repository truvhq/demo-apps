/**
 * FILE SUMMARY: Main layout wrapper with the shared top bar + responsive Panel
 * DATA FLOW: Presentational: no direct backend communication
 *
 * App shell that wraps every demo screen after the intro. Renders the shared
 * <Header> (full width, same responsive behavior as Home/IndustryPage) with the
 * device toggle and Dev-panel button in its right-edge slot, and a main/sidebar
 * split below. The Panel carries its own tab-nav row as its first line in both
 * sidebar and overlay modes — tabs never compete with the header for width.
 *
 * Panel layout is viewport-driven:
 *   - lg+ (≥1024px) : Panel renders as the right `<aside>` sidebar.
 *   - below lg      : Panel renders as a full-bleed overlay over the content row,
 *                     layered above <main> so the iframe inside any DeviceFrame
 *                     stays mounted underneath.
 * The user-driven `usePanelVisibility` toggle controls whether the Panel renders
 * at all in either case. The split between sidebar/overlay is pure CSS so it
 * reacts to live resizing without remounting the panel subtree.
 *
 * Pass hidePanel=true (used by intro/form screens) to hide both toggles and the
 * panel entirely regardless of user preference.
 */

import { useState, useEffect } from 'preact/hooks';
import { Panel } from './Panel.jsx';
import { Header } from './Header.jsx';
import { getBreadcrumbTrail } from '../App.jsx';
import { DeviceToggle, ShowPanelButton } from './DeviceFrame.jsx';
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
      {/* Shared top bar. The panel's tab nav lives inside the Panel itself, so
          the header is always full width and behaves the same on every page.
          Right-edge slot: device toggle + Dev-panel button (demo shell only). */}
      <Header trail={getBreadcrumbTrail()}>
        {!hidePanel && (
          <>
            {/* Device toggle: only shown when a DeviceFrame is currently mounted
                somewhere in the tree (auto-detected via deviceFramePresence).
                Hidden below sm — there the frame renders full-bleed with no
                mockup, so the toggle would control nothing visible. */}
            {hasDeviceFrame && (
              <div class="hidden sm:block pr-2">
                <DeviceToggle />
              </div>
            )}
            {/* ShowPanelButton: right edge of the header while the panel is
                hidden — when the panel is shown the symmetric HidePanelButton
                inside the Panel's tab row takes over. */}
            {!showPanel && (
              <div class="pr-3 sm:pr-5">
                <ShowPanelButton />
              </div>
            )}
          </>
        )}
      </Header>
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
