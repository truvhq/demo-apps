/**
 * FILE SUMMARY: Intro/welcome slide shown before demo starts
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Renders a 50/50 split layout used by all demo intro screens. The left half
 * shows a label, headline, subtitle, optional children (cards/inputs), and action
 * buttons. Single column (the diagram panel was removed in the Checkr revamp).
 */

// Imports

// Props:
//   label    : uppercase category text above the headline
//   title    : main headline
//   subtitle : descriptive paragraph
//   diagram  : Mermaid definition string for the right-side diagram
//   children : optional content (cards, inputs) between subtitle and actions
//   actions  : bottom action buttons
export function IntroSlide({ label, title, subtitle, children, actions }) {
  // Single column. The architecture diagram that used to fill the right half
  // was removed in the Checkr revamp; `diagram` props passed by demos are ignored.
  return (
    <div class="flex flex-col flex-1 min-h-0 overflow-y-auto bg-white">
      <div class="min-h-full flex items-center justify-center">
        <div class="px-6 py-10 lg:px-12 lg:py-16 w-full max-w-[640px]">
          <div class="animate-slideUp">
            <div class="text-[13px] font-bold uppercase tracking-[0.1em] text-primary mb-5">{label}</div>
            <h2 class="text-[28px] sm:text-[40px] font-extrabold tracking-[-0.035em] leading-[1.05] text-[#000000] mb-5">{title}</h2>
            <p class="text-[16px] text-[#808080] leading-[1.7] mb-10">{subtitle}</p>
          </div>
          {children && <div class="animate-slideUp delay-1 mb-10">{children}</div>}
          {actions && <div class="animate-slideUp delay-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
