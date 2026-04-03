import { MermaidDiagram } from './MermaidDiagram.jsx';

// IntroSlide: 50/50 split layout for all demo intro screens.
// Left:  label, headline, subtitle, children (cards/inputs), actions (buttons)
// Right: architecture diagram (updates live when selection changes)
export function IntroSlide({ label, title, subtitle, diagram, children, actions }) {
  return (
    <div class="flex flex-1 min-h-0">
      {/* Left */}
      <div class="w-1/2 overflow-y-auto bg-white flex items-center justify-center">
        <div class="px-12 py-14 w-full max-w-[640px]">
          <div class="animate-slideUp">
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-primary mb-5">{label}</div>
            <h2 class="text-[40px] font-extrabold tracking-[-0.035em] leading-[1.05] text-[#171717] mb-5">{title}</h2>
            <p class="text-[16px] text-[#4b5563] leading-[1.7] mb-10">{subtitle}</p>
          </div>
          {children && <div class="animate-slideUp delay-1 mb-10">{children}</div>}
          {actions && <div class="animate-slideUp delay-2">{actions}</div>}
        </div>
      </div>
      {/* Right */}
      <div class="w-1/2 bg-[#f7f8fc] border-l border-[#ebebf0] flex items-center justify-center overflow-y-auto">
        {diagram && (
          <div class="w-full px-10 py-14 animate-slideUp delay-2">
            <MermaidDiagram definition={diagram} />
          </div>
        )}
      </div>
    </div>
  );
}
