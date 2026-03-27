import { Panel } from './Panel.jsx';

export function Layout({ title, badge, steps, panel, flush, hidePanel, children }) {
  return (
    <div class="h-screen flex flex-col">
      <header class="flex items-center justify-between h-12 px-6 bg-white/80 backdrop-blur-xl border-b border-[#d2d2d7]/40">
        <div class="flex items-center gap-2">
          <a href="#" class="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <div class="w-[18px] h-[18px] bg-primary rounded-full" />
            <div class="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">{title || 'Truv Quickstart'}</div>
          </a>
          {badge && <div class="text-[11px] font-medium text-[#86868b] bg-[#f5f5f7] px-2 py-0.5 rounded-md ml-1">{badge}</div>}
        </div>
      </header>
      <div class="flex flex-1 min-h-0">
        <main class={`flex-1 min-w-0 ${flush || hidePanel ? 'flex flex-col overflow-y-auto' : 'overflow-y-auto px-8 py-10'}`}>
          {children}
        </main>
        {!hidePanel && <Panel steps={steps} panel={panel} />}
      </div>
    </div>
  );
}
