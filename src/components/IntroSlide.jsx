import { MermaidDiagram } from './MermaidDiagram.jsx';

export function IntroSlide({ label, title, subtitle, diagram, children, actions }) {
  return (
    <div class="flex flex-1 min-h-0">
      {/* Left half: white, scrollable */}
      <div class="w-1/2 overflow-y-auto bg-white">
        <div class="px-10 py-14 max-w-[560px]">
          <div class="animate-slideUp">
            <div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/70 mb-5">{label}</div>
            <h2 class="text-[36px] font-bold tracking-[-0.03em] leading-[1.08] text-[#171717] mb-5">{title}</h2>
            <p class="text-[15px] text-[#8E8E93] leading-[1.7] mb-10">{subtitle}</p>
          </div>
          {children && (
            <div class="animate-slideUp delay-1 mb-8">
              {children}
            </div>
          )}
          {actions && (
            <div class="animate-slideUp delay-2">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Right half: white, diagram centered */}
      <div class="w-1/2 bg-white border-l border-[#eceef1] flex items-center justify-center overflow-y-auto">
        {diagram && (
          <div class="w-full px-8 py-14 animate-slideUp delay-1">
            <MermaidDiagram definition={diagram} />
          </div>
        )}
      </div>
    </div>
  );
}
