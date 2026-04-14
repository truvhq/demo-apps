/**
 * FILE SUMMARY: Intro/welcome slide shown before demo starts
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Renders a 50/50 split layout used by all demo intro screens. The left half
 * shows a label, headline, subtitle, optional children (cards/inputs), and action
 * buttons. The right half displays a Mermaid architecture diagram.
 */

// Imports
import { MermaidDiagram } from './MermaidDiagram.jsx';

// Props:
//   label    : uppercase category text above the headline
//   title    : main headline
//   subtitle : descriptive paragraph
//   diagram  : Mermaid definition string for the right-side diagram
//   children : optional content (cards, inputs) between subtitle and actions
//   actions  : bottom action buttons
export function IntroSlide({ label, title, subtitle, diagram, children, actions }) {
  return (
    <div class="flex flex-1 min-h-0">
      {/* Left panel: text content and actions */}
      <div class="w-1/2 overflow-y-auto bg-white">
        <div class="min-h-full flex items-center justify-center">
          <div class="px-12 py-14 w-full max-w-[640px]">
            {/* Header block: label, title, subtitle */}
            <div class="animate-slideUp">
              <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-primary mb-5">{label}</div>
              <h2 class="text-[40px] font-extrabold tracking-[-0.035em] leading-[1.05] text-[#171717] mb-5">{title}</h2>
              <p class="text-[16px] text-[#4b5563] leading-[1.7] mb-10">{subtitle}</p>
            </div>
            {/* Optional children slot (selection cards, form inputs, etc.) */}
            {children && <div class="animate-slideUp delay-1 mb-10">{children}</div>}
            {/* Action buttons */}
            {actions && <div class="animate-slideUp delay-2">{actions}</div>}
          </div>
        </div>
      </div>
      {/* Right panel: architecture diagram */}
      <div class="w-1/2 bg-[#f7f8fc] border-l border-[#ebebf0] overflow-y-auto">
        <div class="min-h-full flex items-center justify-center">
          {diagram && (
            <div class="w-full px-10 py-14 animate-slideUp delay-2">
              <MermaidDiagram definition={diagram} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
