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

import { useState } from 'preact/hooks';
import { Panel, TabButton } from './Panel.jsx';
import { Icons } from './Icons.jsx';
import { DeviceToggle, ShowPanelButton, HidePanelButton } from './DeviceFrame.jsx';
import { useHasDeviceFrame } from '../hooks/deviceFramePresence.jsx';
import { usePanelVisibility } from '../hooks/usePanelVisibility.js';

// Props:
//   badge       : label shown next to the logo (e.g. "Smart Routing")
//   steps       : step list passed to Panel sidebar
//   panel       : extra content passed to Panel sidebar (apiLogs, bridgeEvents, webhooks, ...)
//   flush       : if true, main area uses flex layout without padding
//   hidePanel   : if true, hides the sidebar entirely (and the tab nav + toggles)
//   children    : main content area
export function Layout({ badge, steps, panel, flush, hidePanel, children }) {
  const [activeTab, setActiveTab] = useState('guide');
  const hasDeviceFrame = useHasDeviceFrame();
  const [panelVisible] = usePanelVisibility();
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
        <div class="flex items-center gap-3 px-6 flex-1 min-w-0">
          <a href="/" aria-label="Go to home" class="flex items-center hover:opacity-80 transition-opacity">
            <Icons.truvLogo height={16} className="text-text" />
          </a>
          {badge && <div class="text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md whitespace-nowrap">{badge}</div>}
        </div>
        {!hidePanel && (
          <>
            {/* Device toggle: only shown when a DeviceFrame is currently mounted
                somewhere in the tree (auto-detected via deviceFramePresence). */}
            {hasDeviceFrame && (
              <div class="pl-4 pr-2">
                <DeviceToggle />
              </div>
            )}
            {/* ShowPanelButton: lives in the main toolbar at the right edge of the
                header. Self-gated to render only when the panel is hidden. When the
                panel is shown the symmetric HidePanelButton inside the tab strip
                takes over the same physical slot. */}
            <div class={`pr-5 ${hasDeviceFrame ? '' : 'pl-4'}`}>
              <ShowPanelButton />
            </div>
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
        <main class={`flex-1 min-w-0 ${flush || hidePanel ? 'flex flex-col' : 'flex flex-col overflow-y-auto px-8 py-6'}`}>
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
