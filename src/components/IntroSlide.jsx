import { MermaidDiagram } from './MermaidDiagram.jsx';

export function IntroSlide({ label, title, subtitle, diagram, children }) {
  return (
    <div class="intro-slide">
      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div class="my-auto w-full max-w-2xl mx-auto px-4 py-12">
          <div class="animate-slideUp">
            <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">{label}</div>
            <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">{title}</h2>
            <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[400px] mx-auto mb-10">{subtitle}</p>
          </div>

          {diagram && (
            <div class="animate-slideUp delay-1">
              <MermaidDiagram definition={diagram} />
            </div>
          )}
        </div>
      </div>

      <div class="intro-actions">
        {children}
      </div>
    </div>
  );
}
