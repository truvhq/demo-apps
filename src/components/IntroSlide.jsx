import { MermaidDiagram } from './MermaidDiagram.jsx';

export function IntroSlide({ label, title, subtitle, diagram, children }) {
  return (
    <div class="intro-slide">
      <div class="relative z-10 w-full max-w-4xl mx-auto px-4">
        <div class="animate-slideUp">
          <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">{label}</div>
          <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">{title}</h2>
          <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[400px] mx-auto mb-10">{subtitle}</p>
        </div>

        {diagram && (
          <div class="animate-slideUp delay-1 mb-10">
            <MermaidDiagram definition={diagram} />
          </div>
        )}

        <div class="animate-slideUp delay-2">
          {children}
        </div>
      </div>
    </div>
  );
}
