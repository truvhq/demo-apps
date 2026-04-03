---
title: "refactor: Apply Truv brand colors, logo, and typography to demo apps"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Apply Truv brand colors, logo, and typography to demo apps

## Overview

Replace the Apple-inspired visual design with Truv's actual brand identity. The demo apps currently use `#0071e3` (Apple blue), SF Pro/system fonts, and a generic blue dot placeholder logo. Truv's brand uses `#2C64E3`, Gilroy/Inter fonts, and a distinct wordmark logo. Since external developers and LLMs reference this codebase to learn Truv integration, the UI should look like a Truv product.

## Problem Frame

The demo apps were built with a clean Apple-inspired aesthetic, but they don't reflect Truv's actual brand. When prospects or developers land on the quickstart, it should feel like a Truv product — not a generic boilerplate. The disconnect is especially noticeable in the header (generic blue dot instead of Truv logo) and the primary color (Apple blue instead of Truv blue).

## Requirements Trace

- R1. Primary color switches from `#0071e3` to Truv blue `#2C64E3`
- R2. Hover/active states use Truv brand shades (`#143b95` hover, `#0e2968` active)
- R3. Truv wordmark SVG logo replaces the blue dot placeholder in all headers
- R4. Typography uses Inter (Gilroy is proprietary; Inter is the closest available web font and already loaded)
- R5. Text colors align with Truv palette: `#171717` primary text, `rgba(60,60,67,0.6)` muted
- R6. Intro slide gradients use Truv blue instead of Apple blue
- R7. Existing visual structure (layout, spacing, animations) preserved — this is a color/brand swap, not a redesign

## Scope Boundaries

- Not redesigning layout, navigation structure, or component architecture
- Not adding dark mode
- Not changing demo functionality or API flows
- Not loading Gilroy font (it's proprietary/paid) — Inter is already loaded and is Truv's fallback
- Not touching report components, Panel internals, or demo state logic

## Context & Research

### Truv Brand Identity (from truv.com and docs.truv.com)

| Element | Current (Apple-inspired) | Target (Truv brand) |
|---------|-------------------------|---------------------|
| Primary blue | `#0071e3` | `#2C64E3` |
| Primary hover | `#0077ED` | `#143b95` |
| Primary active | — | `#0e2968` |
| Dark text | `#1d1d1f` | `#171717` |
| Muted text | `#86868b` / `#6e6e73` | `rgba(60,60,67,0.6)` ≈ `#3c3c43` at 60% opacity |
| Logo | Blue dot (`bg-primary rounded-full`) | Truv SVG wordmark (69x25, black fill) |
| Font | SF Pro / system stack | Gilroy (proprietary) → Inter (already loaded) |
| Buttons | `rounded-full`, Apple blue | Keep pill shape, Truv blue |

### Truv Logo SVG

```svg
<svg width="69" height="25" viewBox="0 0 69 25" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.855..." fill="currentColor"/>
<!-- 4 paths forming the "truv" wordmark -->
</svg>
```

The logo uses `fill="black"` but should use `fill="currentColor"` for theme flexibility.

### Files Using Apple Colors

279 occurrences of hardcoded Apple colors (`#1d1d1f`, `#86868b`, `#6e6e73`, `#f5f5f7`, `#d2d2d7`, `#e8e8ed`) across 21 `.jsx` and `.css` files. The CSS theme variables in `styles.css` centralize the primary color, but secondary colors are hardcoded inline throughout JSX.

### Blue Dot Logo Locations

3 files use the blue dot placeholder:
- `src/Home.jsx:44`
- `src/components/Layout.jsx:9`
- `src/IndustryPage.jsx:54`

## Key Technical Decisions

- **Use CSS theme variables for all brand colors:** Currently only `--color-primary` is a variable; `#1d1d1f`, `#86868b`, etc. are hardcoded in 21 files. Add `--color-text`, `--color-text-secondary`, `--color-border`, `--color-surface-secondary` as Tailwind theme variables and replace hardcoded values. This makes future brand changes a single-file edit.

- **Keep Inter as the primary font:** Gilroy is Truv's brand font but is proprietary. Inter is already loaded via Google Fonts and is the standard fallback. Promote it to first position in the font stack.

- **Create a TruvLogo component:** Rather than duplicating the SVG in 3 files, add a `TruvLogo` component in `Icons.jsx` alongside the existing icon library.

- **Replace hardcoded colors with Tailwind theme references:** Instead of `text-[#1d1d1f]` use `text-text`, instead of `text-[#86868b]` use `text-muted`. This is the bulk of the work but prevents color drift.

## Open Questions

### Resolved During Planning

- **Gilroy font:** Not loading it — proprietary, Inter is the fallback and already available
- **Dark mode:** Out of scope — Truv's site is light-themed
- **Favicon:** Worth updating if we have the Truv icon. Defer to implementation — check if truv.com/favicon.ico is usable

### Deferred to Implementation

- **Exact muted color handling:** `rgba(60,60,67,0.6)` may need a solid hex equivalent for Tailwind theme variable. Implementer should test `#8E8E93` (the resolved color on white bg) vs the rgba value
- **Intro slide gradient tuning:** The gradient uses Truv blue rgba values — exact opacity may need visual tuning after color swap

## Implementation Units

- [ ] **Unit 1: Update CSS theme variables and font stack**

  **Goal:** Centralize all brand colors as Tailwind theme variables and switch to Truv palette.

  **Requirements:** R1, R2, R4, R5

  **Dependencies:** None

  **Files:**
  - Modify: `src/components/styles.css`
  - Modify: `index.html` (if font loading changes needed)

  **Approach:**
  - Change `--color-primary` from `#0071e3` to `#2C64E3`
  - Change `--color-primary-hover` from `#0077ED` to `#143b95`
  - Add `--color-primary-active: #0e2968`
  - Add `--color-text: #171717`
  - Add `--color-text-secondary: #8E8E93` (resolved from Truv's `rgba(60,60,67,0.6)`)
  - Add `--color-text-tertiary: #AEAEB2` (for current `#86868b` usage where lighter muted text appears)
  - Update `--color-muted` from `#86868b` to `#8E8E93`
  - Update font-sans to prioritize `Inter` over system fonts
  - Update intro-slide gradient to use Truv blue rgba values
  - Update `.flow-node-primary` background and box-shadow to Truv blue

  **Patterns to follow:**
  - Existing `@theme` block in `src/components/styles.css`
  - Tailwind v4 `@theme` syntax for custom color registration

  **Test scenarios:**
  - Happy path: Primary buttons render in `#2C64E3` instead of `#0071e3`
  - Happy path: Hover states darken to `#143b95`
  - Happy path: Body text renders in `#171717`
  - Happy path: Font family resolves to Inter
  - Edge case: Flow pipeline nodes with `.flow-node-primary` show Truv blue

  **Verification:**
  - All CSS variables reflect Truv brand values
  - No remaining references to `#0071e3` or `#0077ED` in styles.css

- [ ] **Unit 2: Add TruvLogo component and replace blue dot placeholders**

  **Goal:** Replace the generic blue circle with the Truv wordmark SVG in all header locations.

  **Requirements:** R3

  **Dependencies:** None (can run in parallel with Unit 1)

  **Files:**
  - Modify: `src/components/Icons.jsx`
  - Modify: `src/components/Layout.jsx`
  - Modify: `src/Home.jsx`
  - Modify: `src/IndustryPage.jsx`

  **Approach:**
  - Add a `truvLogo` entry to the Icons object using the Truv wordmark SVG paths with `fill="currentColor"` for theme flexibility
  - In all 3 header locations, replace `<div class="w-[18px] h-[18px] bg-primary rounded-full" />` with `<Icons.truvLogo size={...} />` (sized to ~69x25 or scaled proportionally to fit the 12px header height)
  - Remove the "Truv Quickstart" text label next to the logo since the wordmark already spells "truv". Keep a smaller "Quickstart" label or badge next to it
  - Maintain the `<a href="#">` wrapping for navigation

  **Patterns to follow:**
  - Existing icon component pattern in `src/components/Icons.jsx` — `I(d, props)` helper
  - Existing header pattern in `Layout.jsx`

  **Test scenarios:**
  - Happy path: Home page header shows Truv wordmark SVG instead of blue dot
  - Happy path: Layout header in demo views shows Truv wordmark
  - Happy path: IndustryPage header shows Truv wordmark with breadcrumb
  - Happy path: Logo links to `#` (home) on click
  - Edge case: Logo inherits text color via `currentColor` fill

  **Verification:**
  - No remaining blue dot placeholder (`bg-primary rounded-full`) in any header
  - Logo renders at appropriate scale in the 48px header bar

- [ ] **Unit 3: Replace hardcoded Apple colors with theme variables across JSX files**

  **Goal:** Swap all inline Apple color references (`#1d1d1f`, `#86868b`, `#6e6e73`, `#f5f5f7`, `#d2d2d7`, `#e8e8ed`) to use Tailwind theme classes.

  **Requirements:** R5, R7

  **Dependencies:** Unit 1 (theme variables must exist first)

  **Files:**
  - Modify: `src/Home.jsx`
  - Modify: `src/IndustryPage.jsx`
  - Modify: `src/components/Layout.jsx`
  - Modify: `src/components/Panel.jsx`
  - Modify: `src/components/ApplicationForm.jsx`
  - Modify: `src/components/CompanySearch.jsx`
  - Modify: `src/components/IntroSlide.jsx`
  - Modify: `src/components/MermaidDiagram.jsx`
  - Modify: All `src/demos/*.jsx` files (13 files)

  **Approach:**

  Color mapping (Apple → Tailwind theme class):
  - `text-[#1d1d1f]` → `text-text`
  - `text-[#6e6e73]` → `text-text-secondary`
  - `text-[#86868b]` → `text-muted` (already defined, just update the value)
  - `bg-[#f5f5f7]` → `bg-surface-secondary` or `bg-border-light` (already aliased)
  - `border-[#d2d2d7]` → `border-border`
  - `border-[#e8e8ed]` → `border-border-light` (add if not present)
  - `hover:bg-[#f5f5f7]` → `hover:bg-surface-secondary`

  This is a systematic find-and-replace across 21 files. The key risk is missing an occurrence or breaking a Tailwind class compound (e.g., `border-[#d2d2d7]/40` needs the opacity preserved).

  **Patterns to follow:**
  - Existing Tailwind theme variable usage (`bg-primary`, `text-primary`)

  **Test scenarios:**
  - Happy path: Home page industry cards render with `#171717` text and `#8E8E93` muted text
  - Happy path: Panel tabs use theme muted color instead of hardcoded `#86868b`
  - Happy path: Borders render with theme border color
  - Edge case: Opacity modifiers preserved — `border-[#d2d2d7]/40` becomes `border-border/40`
  - Edge case: Arbitrary value hover states (`hover:bg-[#f5f5f7]`) correctly map to theme class hover states

  **Verification:**
  - `grep -r "#1d1d1f\|#86868b\|#6e6e73\|#f5f5f7\|#d2d2d7\|#e8e8ed" src/` returns zero hits (excluding comments)
  - Visual appearance is near-identical to before, just with Truv palette

- [ ] **Unit 4: Update intro slide gradients and visual polish**

  **Goal:** Tune the intro slide backgrounds to use Truv blue and do a final visual QA pass.

  **Requirements:** R6, R7

  **Dependencies:** Units 1-3

  **Files:**
  - Modify: `src/components/styles.css` (intro-slide gradients)
  - Possibly modify: demo intro screens if any have inline gradient colors

  **Approach:**
  - Update `.intro-slide` background gradient from `rgba(0, 113, 227, ...)` (Apple blue) to `rgba(44, 100, 227, ...)` (Truv blue)
  - Review the grid pattern overlay — keep or adjust opacity
  - Check the `icon-box-*` color classes — these are accent colors (blue, indigo, emerald, amber) that don't need to change to Truv blue, they serve as variety colors. But verify they look harmonious with the new primary
  - Check selected-card states — `bg-[#f5f8ff]` and `border-primary` should work with new primary
  - Verify the "Recommended" badge in SmartRouting (`text-primary bg-primary/10`) looks right with Truv blue

  **Patterns to follow:**
  - Existing gradient pattern in `.intro-slide`

  **Test scenarios:**
  - Happy path: Intro slides show subtle Truv blue gradient instead of Apple blue
  - Happy path: Selected product cards have Truv blue border
  - Happy path: "Recommended" badge in SmartRouting renders with Truv blue
  - Edge case: Icon boxes (blue, emerald, amber, etc.) still visually distinct from primary

  **Verification:**
  - No remaining `rgba(0, 113, 227, ...)` in CSS or JSX
  - Visual review confirms cohesive Truv-branded appearance across all screens

## System-Wide Impact

- **Interaction graph:** No functional changes — this is purely visual. No callbacks, API flows, or state management affected.
- **Error propagation:** N/A
- **State lifecycle risks:** None — colors don't affect state
- **API surface parity:** N/A
- **Unchanged invariants:** All demo flows, routing, sidebar panel, webhook handling, and report rendering remain identical. Only visual presentation changes.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Hardcoded color replacement misses an occurrence | Systematic grep verification after Unit 3 |
| Tailwind theme class names conflict with existing utilities | Use distinctive names: `text`, `text-secondary`, `surface-secondary` |
| Opacity modifiers break during replacement | Search specifically for `/40`, `/30`, `/60` patterns and preserve them |
| Truv blue looks different from Apple blue in some UI contexts (e.g., on hover backgrounds) | Visual QA pass in Unit 4 catches any contrast or readability issues |

## Sources & References

- Related code: `src/components/styles.css` (theme variables), `src/components/Icons.jsx` (icon library), `src/Home.jsx` / `src/IndustryPage.jsx` / `src/components/Layout.jsx` (headers with blue dot)
- Truv brand: truv.com (primary blue `#2C64E3`, font Gilroy/Inter, logo SVG)
- Truv docs: docs.truv.com (confirmed `#2C64E3`, hover `#143b95`, active `#0e2968`, text `#171717`)
- Truv logo SVG: `https://d3fide9nemq0ii.cloudfront.net/wp-content/themes/twentytwentyone/assets_truv/images/logo/logo-truv.svg`
