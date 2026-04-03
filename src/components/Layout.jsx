import { Panel } from './Panel.jsx';
import { Header } from './Header.jsx';

export function Layout({ badge, steps, panel, flush, hidePanel, children }) {
  return (
    <div class="h-screen flex flex-col">
      <Header badge={badge} />
      <div class="flex flex-1 min-h-0">
        <main class={`flex-1 min-w-0 ${flush || hidePanel ? 'flex flex-col' : 'overflow-y-auto px-8 py-10'}`}>
          {children}
        </main>
        {!hidePanel && <Panel steps={steps} panel={panel} />}
      </div>
    </div>
  );
}
