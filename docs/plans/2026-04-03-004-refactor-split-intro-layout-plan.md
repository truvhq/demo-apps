---
title: "refactor: Split intro layout with text+controls on left, architecture on right"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Split intro layout with text+controls on left, architecture on right

## Overview

Replace the current 1-2 step centered intro flow with a single split-screen layout across all demos. Left side shows intro text, product/method selection cards (when applicable), and the action button. Right side shows the architecture diagram that updates dynamically when the user selects different products.

This merges what was previously 2 separate screens (intro -> architecture) into one unified view, reducing clicks and showing the full picture at once.

## Requirements Trace

- R1. All demos use a split layout: left panel (intro + controls) and right panel (architecture diagram)
- R2. For demos with product pickers (POS Application, Customer Portal, Smart Routing), the diagram updates live as the user selects different options
- R3. For demos without a picker (BankIncome, PayrollIncome, PLL, DepositSwitch, FollowUp, LOS, EmployeePortal, UploadDocuments, PSDocuments), the diagram is static on the right
- R4. The `IntroSlide` component handles the split layout so all demos share one consistent structure
- R5. The intro step count reduces from 2 to 1 (no separate "architecture" step)

## Scope Boundaries

- Not changing demo functionality, API flows, or report handling
- Not changing the sidebar Panel layout
- Not changing the form screens or results screens

## Key Technical Decisions

- **IntroSlide becomes the single intro component.** Props: `label`, `title`, `subtitle`, `diagram`, `children` (left-side content below subtitle like product cards), `actions` (buttons). The diagram goes on the right.
- **Demos with pickers pass `diagram` as a reactive value.** When the user selects "Income", the diagram prop changes to the income diagram. When they select "Assets", it changes to the assets diagram.
- **Demos without pickers pass a static diagram.** Simple: `<IntroSlide diagram={DIAGRAM} ...>`
- **Remove introStep state from all demos.** No more `introStep === 1` vs `introStep === 2`. One screen.
- **Left side is text-aligned left, not centered.** Right side diagram fills available space.

## High-Level Technical Design

> *Directional guidance, not implementation specification.*

```
+--------------------------------------------------+
|  Header: truv logo + badge                       |
+--------------------------------------------------+
|                                                  |
|  LEFT (flex-1)           |  RIGHT (flex-1)       |
|                          |                       |
|  LABEL (uppercase)       |  [Architecture        |
|  HEADLINE (36px)         |   Diagram              |
|  Subtitle text           |   (Mermaid SVG)       |
|                          |   fills this panel]   |
|  [Product Card 1]        |                       |
|  [Product Card 2]  <---->|  diagram updates      |
|  [Product Card 3]        |  when selection       |
|                          |  changes              |
|  [ Continue -> ]         |                       |
|                          |                       |
+--------------------------------------------------+
```

## Implementation Units

- [ ] **Unit 1: Redesign IntroSlide component for split layout**

  **Goal:** Update IntroSlide to render a 50/50 split with left (text + children + actions) and right (diagram).

  **Requirements:** R1, R4

  **Dependencies:** None

  **Files:**
  - Modify: `src/components/IntroSlide.jsx`
  - Modify: `src/components/styles.css`

  **Approach:**
  - Left panel: label, title, subtitle, then `{children}` slot (for product cards, method cards, or nothing), then `{actions}` slot (for buttons)
  - Right panel: `{diagram && <MermaidDiagram />}`
  - Use CSS flex with `gap` between panels
  - Left side text-align left
  - Remove `.intro-actions` pinned bar CSS (buttons are now inline)
  - Keep `.intro-slide` as the background container with the gradient

  **Test scenarios:**
  - Test expectation: none (pure layout/styling)

  **Verification:**
  - IntroSlide renders split layout with content on left, diagram on right

- [ ] **Unit 2: Update demos with product pickers (Application, CustomerPortal)**

  **Goal:** Merge the 2-step intro into 1 split screen with live-updating diagram.

  **Requirements:** R2, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/Application.jsx`
  - Modify: `src/demos/CustomerPortal.jsx`

  **Approach:**
  - Remove `introStep` state (was 1 = intro, 2 = architecture)
  - Remove the `IntroScreen` / `CPIntroScreen` inner components (they had their own state for step management)
  - Replace with a single `<IntroSlide>` that has: label, title, subtitle, diagram={DIAGRAMS[selected]}, children = product cards, actions = Continue button
  - The `selected` state drives which diagram shows on the right
  - Default diagram (before any selection) can be the income diagram or a placeholder
  - "Continue" button calls `onStart(selected)` and is disabled until a product is selected

  **Patterns to follow:**
  - Current product card rendering in Application.jsx IntroScreen

  **Test scenarios:**
  - Test expectation: none (pure layout/styling)

  **Verification:**
  - Selecting "Income" shows income diagram on right. Selecting "Assets" shows assets diagram.
  - Single screen, no step transitions.

- [ ] **Unit 3: Update Smart Routing demo (method picker)**

  **Goal:** Merge intro into split layout with method cards on left, diagram on right.

  **Requirements:** R2, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/SmartRouting.jsx`

  **Approach:**
  - Remove `introStep` state
  - Single `<IntroSlide>` with method cards as children, diagram on right
  - SmartRouting only has one diagram (not per-method), so the right side is static

  **Test scenarios:**
  - Test expectation: none (pure layout/styling)

  **Verification:**
  - Intro shows method cards on left, architecture on right, single screen

- [ ] **Unit 4: Update simple demos (BankIncome, PayrollIncome, PLL, DepositSwitch)**

  **Goal:** Merge 2-step intro into 1 split screen with static diagram.

  **Requirements:** R3, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/BankIncome.jsx`
  - Modify: `src/demos/PayrollIncome.jsx`
  - Modify: `src/demos/PaycheckLinkedLoans.jsx`
  - Modify: `src/demos/DepositSwitch.jsx`

  **Approach:**
  - Remove `introStep` state (was 1 = intro text, 2 = architecture, 3 = form)
  - Replace with single `<IntroSlide diagram={DIAGRAM}>` with "Get started" button as action
  - Button advances to the form screen

  **Test scenarios:**
  - Test expectation: none (pure layout/styling)

  **Verification:**
  - Each demo shows intro text on left, diagram on right, single "Get started" button

- [ ] **Unit 5: Update remaining demos (FollowUp, LOS, EmployeePortal, UploadDocuments, PSDocuments)**

  **Goal:** Merge their intro screens into the split layout.

  **Requirements:** R3, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/demos/FollowUp.jsx`
  - Modify: `src/demos/LOS.jsx`
  - Modify: `src/demos/EmployeePortal.jsx`
  - Modify: `src/demos/UploadDocuments.jsx`
  - Modify: `src/demos/PSDocuments.jsx`

  **Approach:**
  - These demos have their own intro screens with custom content (task cards for FollowUp, feature cards for LOS/EmployeePortal, document type cards for UploadDocuments/PSDocuments)
  - Replace intro step 1 + 2 with single `<IntroSlide>` passing custom cards as children and diagram on right

  **Test scenarios:**
  - Test expectation: none (pure layout/styling)

  **Verification:**
  - All demos show split layout on intro

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Diagrams may be too tall for the right panel on smaller screens | Allow right panel to scroll independently |
| Product cards + text may overflow left panel | Left panel scrolls, diagram stays visible |
| Removing introStep may break URL routing | introStep was internal state only, never in URL |

## Sources & References

- Related code: `src/components/IntroSlide.jsx`, all `src/demos/*.jsx`
