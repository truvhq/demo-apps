---
title: "refactor: Visual polish and code cleanup to match truv.com aesthetic"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Visual polish and code cleanup to match truv.com aesthetic

## Overview

After multiple iterative design passes, the codebase has accumulated inconsistent card styles, mixed color references, dead CSS, and uneven spacing. This plan consolidates everything into a clean, consistent visual language inspired by truv.com: white backgrounds, Truv blue accents, clean typography hierarchy, and minimal chrome.

## Problem Frame

The iterative design work introduced several inconsistencies:
- **Card styles vary across demos**: Some use `rounded-2xl px-6 py-5 border`, others use `pl-4 pr-3 py-3.5 border-l-2`, FollowUp has `rounded-2xl px-5 py-4`
- **Color references are mixed**: Some files use theme classes (`text-muted`), others still hardcode (`text-[#8E8E93]`, `text-[#171717]`, `bg-[#f5f5f7]`)
- **Dead CSS**: `.intro-slide::before` grid pattern, `.intro-actions`, old flow-node styles may be unused
- **IntroSlide** went through 6+ iterations and has accumulated styling choices that don't form a coherent system
- **Button styles vary**: Some CTAs are `rounded-full`, some are `rounded-lg`, sizing varies

## Requirements Trace

- R1. Consistent card style across all demos (one pattern for selectable cards, one for info cards)
- R2. All hardcoded colors replaced with Tailwind theme variables or a consistent set
- R3. Dead CSS removed
- R4. IntroSlide has a clean, final design that works for all demo types
- R5. Button styles unified (primary CTA, secondary/ghost)
- R6. All pages use white background as the base (truv.com style)
- R7. Mermaid diagram theme is finalized and consistent

## Scope Boundaries

- Not changing demo functionality, API flows, or report rendering
- Not changing text content (that was done in the copy plan)
- Not changing the Home page or IndustryPage layouts (those are working)

## Key Technical Decisions

- **Two card patterns only**: (1) Selectable card with left-accent border on selection (for product/method pickers). (2) Info card with subtle border for feature lists. Both use `rounded-xl` (12px), not `rounded-2xl` (16px).
- **White everywhere**: No gray panel backgrounds. The diagram sits on white with a very subtle border to separate from the left panel.
- **Truv.com button style**: Primary CTA is `bg-primary text-white rounded-full px-8 py-3`. Ghost button is `border border-border text-[#171717] rounded-full`.
- **Remove all hardcoded colors from JSX**: Use Tailwind theme variables defined in styles.css.

## Implementation Units

- [ ] **Unit 1: Clean up styles.css and remove dead CSS**

  **Goal:** Remove unused CSS rules and finalize the intro-slide base style.

  **Requirements:** R3, R6

  **Files:**
  - Modify: `src/components/styles.css`

  **Approach:**
  - Remove `.intro-slide::before` (grid pattern, no longer used)
  - Remove `.intro-actions` if still present
  - Clean up `.intro-slide` to just `display: flex; flex: 1; min-height: 0;` (the IntroSlide component handles its own layout)
  - Keep `.flow-node-*`, `.icon-box-*` classes (still used in demos)
  - Audit and remove any orphaned animation classes

  **Test scenarios:**
  - Test expectation: none (CSS cleanup)

  **Verification:**
  - No dead CSS rules in styles.css
  - All existing pages render correctly

- [ ] **Unit 2: Finalize IntroSlide component design**

  **Goal:** Clean, final IntroSlide with consistent spacing, white background, and proper panel separation.

  **Requirements:** R4, R6

  **Files:**
  - Modify: `src/components/IntroSlide.jsx`

  **Approach:**
  - Left half: white background, content vertically and horizontally centered, max-width 640px
  - Right half: white background, subtle left border, diagram centered
  - Clean up class soup from iterations. Use concise, readable Tailwind classes.
  - Typography: label 11px uppercase primary, headline 40px bold dark, subtitle 15px gray

  **Test scenarios:**
  - Test expectation: none (styling)

  **Verification:**
  - All 13 demos render correctly with the updated IntroSlide

- [ ] **Unit 3: Unify selectable card styles across all demos**

  **Goal:** One consistent pattern for product/method/feature picker cards.

  **Requirements:** R1

  **Files:**
  - Modify: `src/demos/Application.jsx` (product cards)
  - Modify: `src/demos/CustomerPortal.jsx` (product cards)
  - Modify: `src/demos/SmartRouting.jsx` (method cards)
  - Modify: `src/demos/FollowUp.jsx` (task info cards)
  - Modify: `src/demos/LOS.jsx` (feature cards)
  - Modify: `src/demos/EmployeePortal.jsx` (feature cards)
  - Modify: `src/demos/UploadDocuments.jsx` (doc type cards)
  - Modify: `src/demos/PSDocuments.jsx` (doc type cards)

  **Approach:**
  - Selectable cards: `rounded-xl border border-border/60 px-5 py-4 cursor-pointer transition-all` with selected state `border-primary bg-primary/[0.04]` and hover `hover:border-[#8E8E93]`
  - Info cards (non-selectable): same border but no cursor/hover, just clean display
  - Remove `backdrop-blur-sm`, `bg-white/80` and other accumulated visual noise

  **Test scenarios:**
  - Test expectation: none (styling)

  **Verification:**
  - All card styles use the unified pattern
  - Selected states are visually clear

- [ ] **Unit 4: Unify button styles**

  **Goal:** Consistent primary and secondary button patterns.

  **Requirements:** R5

  **Files:**
  - Modify: All demo files with "Get started" or "Continue" or "Start Over" buttons

  **Approach:**
  - Primary CTA: `py-3 px-8 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40`
  - Ghost/secondary: `px-5 py-2.5 text-sm font-semibold border border-border rounded-full hover:border-primary hover:text-primary`
  - Full-width primary (for ApplicationForm): `w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover`

  **Test scenarios:**
  - Test expectation: none (styling)

  **Verification:**
  - All buttons use one of the two patterns

- [ ] **Unit 5: Finalize Mermaid diagram theme**

  **Goal:** Clean, readable diagram colors that match the Truv brand.

  **Requirements:** R7

  **Files:**
  - Modify: `src/components/MermaidDiagram.jsx`

  **Approach:**
  - Actor/participant boxes: Light blue fill (`#eef2ff`), Truv blue border (`#2C64E3`), dark text
  - Signal lines: Slate gray (`#64748b`)
  - Notes: Amber background (`#fef3c7`) for visibility
  - White background for the diagram container
  - Font: Inter, 13px

  **Test scenarios:**
  - Test expectation: none (styling)

  **Verification:**
  - Diagrams are readable with clear blue components and gray arrows

## Sources & References

- truv.com design: white backgrounds, `#2C64E3` blue, Gilroy/Inter fonts, `clamp()` responsive typography
- Related code: `src/components/IntroSlide.jsx`, `src/components/styles.css`, `src/components/MermaidDiagram.jsx`
