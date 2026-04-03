import { MermaidDiagram } from './MermaidDiagram.jsx';

// IntroSlide: Split layout for all demo intro screens.
//
// Left panel:  label, headline, subtitle, children (product/method cards), actions (buttons)
// Right panel: architecture diagram (updates live when selection changes)
//
// Props:
//   label     - small uppercase label (e.g. "Mortgage . Point of Sale")
//   title     - large headline
//   subtitle  - description paragraph
//   diagram   - Mermaid diagram definition string (shown on right)
//   children  - content between subtitle and buttons (e.g. product picker cards)
//   actions   - button row at the bottom of the left panel
export function IntroSlide({ label, title, subtitle, diagram, children, actions }) {
  return (
    <div class="intro-slide">
      <div class="w-full max-w-6xl mx-auto px-8 py-12 flex gap-10 items-start">
        {/* Left: intro text + cards + actions */}
        <div class="flex-1 min-w-0 text-left">
          <div class="animate-slideUp">
            <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">{label}</div>
            <h2 class="text-[32px] font-semibold tracking-[-0.03em] leading-[1.15] text-[#171717] mb-4">{title}</h2>
            <p class="text-[15px] text-[#8E8E93] leading-[1.6] max-w-[420px] mb-8">{subtitle}</p>
          </div>
          {children && (
            <div class="animate-slideUp delay-1 mb-6">
              {children}
            </div>
          )}
          {actions && (
            <div class="animate-slideUp delay-2">
              {actions}
            </div>
          )}
        </div>

        {/* Right: architecture diagram */}
        {diagram && (
          <div class="flex-1 min-w-0 animate-slideUp delay-1 pt-8">
            <MermaidDiagram definition={diagram} />
          </div>
        )}
      </div>
    </div>
  );
}
