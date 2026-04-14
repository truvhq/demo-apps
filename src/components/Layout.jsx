/**
 * FILE SUMMARY: Main layout wrapper with sidebar Panel
 * DATA FLOW: Presentational: no direct backend communication
 *
 * App shell that wraps every demo screen after the intro. Renders a Header
 * at the top and a main/sidebar split below. Pass hidePanel to render
 * full-width content without the sidebar.
 */

// Imports
import { Panel } from './Panel.jsx';
import { Header } from './Header.jsx';

// Props:
//   badge     : label passed to Header
//   steps     : step list passed to Panel sidebar
//   panel     : extra content passed to Panel sidebar
//   flush     : if true, main area uses flex layout without padding
//   hidePanel : if true, hides the sidebar entirely
//   children  : main content area
export function Layout({ badge, steps, panel, flush, hidePanel, children }) {
  // Rendering: full-height shell with header, main content, and optional sidebar
  return (
    <div class="h-screen flex flex-col">
      <Header badge={badge} />
      <div class="flex flex-1 min-h-0">
        {/* Main content area */}
        <main class={`flex-1 min-w-0 ${flush || hidePanel ? 'flex flex-col' : 'overflow-y-auto px-8 py-10'}`}>
          {children}
        </main>
        {/* Sidebar panel with API logs and webhook feed */}
        {!hidePanel && <Panel steps={steps} panel={panel} />}
      </div>
    </div>
  );
}
