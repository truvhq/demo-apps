/**
 * FILE SUMMARY: Main layout wrapper with unified top bar + sidebar Panel
 * DATA FLOW: Presentational: no direct backend communication
 *
 * App shell that wraps every demo screen after the intro. Renders a single top
 * bar (logo + badge | device toggle | panel tabs) and a main/sidebar split below.
 * The Panel's tab navigation has been lifted up to this top bar so the toolbar,
 * device-frame switcher, and tab nav all live on the same row.
 *
 * Pass hidePanel to render full-width content without the sidebar (panel tabs
 * and the toggle are also hidden in that case).
 */

import { useState } from 'preact/hooks';
import { Panel, TabButton } from './Panel.jsx';
import { Icons } from './Icons.jsx';
import { DeviceToggle } from './DeviceFrame.jsx';

// Props:
//   badge       : label shown next to the logo (e.g. "Smart Routing")
//   steps       : step list passed to Panel sidebar
//   panel       : extra content passed to Panel sidebar (apiLogs, bridgeEvents, webhooks, ...)
//   flush       : if true, main area uses flex layout without padding
//   hidePanel   : if true, hides the sidebar entirely (and the tab nav + device toggle)
//   children    : main content area
export function Layout({ badge, steps, panel, flush, hidePanel, children }) {
  const [activeTab, setActiveTab] = useState('guide');
  const apiLogs = panel?.apiLogs || [];
  const bridgeEvents = panel?.bridgeEvents || [];
  const webhooks = panel?.webhooks || [];
  const tabs = [
    { id: 'guide', label: 'Guide' },
    { id: 'api', label: 'API', count: apiLogs.length },
    { id: 'bridge', label: 'Bridge', count: bridgeEvents.length },
    { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
  ];

  return (
    <div class="h-screen flex flex-col">
      {/* Unified top bar: logo+badge | device toggle | panel tabs */}
      <header class="flex items-center h-12 bg-white/80 backdrop-blur-xl border-b border-border/40">
        <div class="flex items-center gap-3 px-6 flex-1 min-w-0">
          <a href="#" class="flex items-center hover:opacity-80 transition-opacity">
            <Icons.truvLogo height={16} className="text-text" />
          </a>
          {badge && <div class="text-[11px] font-medium text-muted bg-surface-secondary px-2 py-0.5 rounded-md whitespace-nowrap">{badge}</div>}
        </div>
        {!hidePanel && (
          <>
            {/* Device toggle in the main column, near the right edge before the panel split */}
            <div class="px-4">
              <DeviceToggle />
            </div>
            {/* Panel tab nav — width matches Panel's `w-1/3` so it sits over the sidebar column */}
            <div class="w-1/3 min-w-0 border-l border-border/40 flex items-center gap-0.5 px-5 h-full">
              {tabs.map(t => (
                <TabButton key={t.id} active={activeTab === t.id} label={t.label} count={t.count} onClick={() => setActiveTab(t.id)} />
              ))}
            </div>
          </>
        )}
      </header>
      <div class="flex flex-1 min-h-0">
        <main class={`flex-1 min-w-0 ${flush || hidePanel ? 'flex flex-col' : 'flex flex-col overflow-y-auto px-8 py-6'}`}>
          {children}
        </main>
        {!hidePanel && <Panel steps={steps} panel={panel} activeTab={activeTab} />}
      </div>
    </div>
  );
}
