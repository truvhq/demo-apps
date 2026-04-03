---
title: "refactor: Ground demo texts, guides, and diagrams in industry-specific context"
type: refactor
status: active
date: 2026-04-03
---

# refactor: Ground demo texts, guides, and diagrams in industry-specific context

## Overview

Rewrite all demo app copy — industry descriptions, demo card descriptions, intro screen headlines/subtitles, sidebar STEPS guides, and architecture diagrams — to speak to each industry's actual use case and business value. The current text is developer-focused ("verify income from payroll data") when it should be customer-focused ("approve more borrowers with instant income verification"). Each demo should feel relevant to the prospect's industry.

## Problem Frame

Three layers of text need to be industry-grounded:

1. **Intro screens and card descriptions** — Currently generic/technical. Should lead with business value (like Plaid's "Consumer Report can help you approve more borrowers with less risk").
2. **Sidebar guide steps (STEPS arrays)** — Step titles are generic ("Collect applicant info"). Should describe what's happening in business terms ("Borrower fills out loan application"). The guide HTML content with API endpoints stays — it's developer-facing and correct.
3. **Architecture diagrams (Mermaid)** — Use generic participants ("Your App", "Truv API"). Should use industry-specific labels ("Lender's POS", "Benefits Portal", "Your Bank") and have notes that describe the business action alongside the API call.

The Truv docs at `~/MintDocs/developer1/` have industry-specific positioning for each vertical — these are the source of truth.

## Requirements Trace

- R1. Industry descriptions on Home page communicate business value
- R2. Demo card descriptions explain the business workflow, not the API flow
- R3. Intro screen headlines lead with business outcomes
- R4. Intro screen subtitles provide narrative framing ("In this demo, you'll see how...")
- R5. STEPS titles reflect the business workflow ("Borrower submits application" not "Collect applicant info")
- R6. STEPS guide HTML content stays developer-focused (API snippets, doc links) — only titles change
- R7. Architecture diagrams use industry-specific participant labels and business-context notes
- R8. Tags on demo cards remain technical (they serve developers)
- R9. All text grounded in Truv industry positioning from docs site
- R10. No demo functionality changes

## Scope Boundaries

- Not changing demo flow logic, screens, or components
- Not adding fictional company personas
- Not changing the README
- Not changing the API endpoint code or sidebar guide HTML content (only step titles)
- Tags stay technical
- **Zero mentions of Plaid anywhere in shipped code, comments, plan references, or user-facing text.** Plaid was used as a visual reference during planning only. The implementation must stand on its own as a Truv product. Grep for "plaid" (case-insensitive) before marking any unit complete.

## Context & Research

### Current STEPS Title Inventory

| Demo | Current titles | Problem |
|------|---------------|---------|
| Application | Collect applicant info → Bridge verification → Webhook processing → Retrieve results | Generic |
| FollowUp | Initialize orders → Bridge verification → Webhook processing → Results | Generic |
| LOS/EmployeePortal | Create order → Waiting for user → View results | Generic |
| SmartRouting | Collect applicant info → Choose verification method → Connect via Bridge → Webhook processing → Review results | Mixes technical + generic |
| BankIncome | Collect applicant info → Connect via Bridge → Webhook processing → Review results | Generic |
| PayrollIncome | (same as BankIncome) | Generic |
| PaycheckLinkedLoans | (same but with pll) | Generic |
| DepositSwitch | (same but with deposit_switch) | Generic |
| UploadDocuments/PSDocuments | Create collection → Upload documents → Finalize → Review results | Generic |
| CustomerPortal | (same as Application) | Generic |

### Current Diagram Participant Labels

All diagrams use: `participant App as Your App` / `participant Truv as Truv API` / `participant Bridge as Truv Bridge`

Should be industry-specific:
- Mortgage: `participant App as Lender's POS` or `participant V as Loan Officer`
- Consumer Credit: `participant App as Lending Platform`
- Retail Banking: `participant App as Your Bank`
- Public Sector: `participant App as Benefits Portal` or `participant V as Caseworker`

### Industry Positioning (from Truv docs)

**Mortgage:** GSE-certified verification. Borrowers verify during loan application. Loan officers process from LOS. Day 1 Certainty.

**Consumer Credit:** Instant income verification for faster lending decisions. Auto loans, personal loans, BNPL. Smart routing based on employer coverage.

**Retail Banking:** Customer acquisition through deposit switching. Loan repayment through payroll deductions.

**Public Sector:** Income verification for benefit eligibility. Citizens apply through portals. Caseworkers process from dashboards.

## Key Technical Decisions

- **Only change STEPS titles, not guide HTML:** The guide content has API snippets, doc links, and technical explanations that are correct and developer-appropriate. Changing step *titles* to be business-contextual while keeping guide *content* technical creates a nice dual-audience experience.
- **Diagram participant relabeling:** Change the Mermaid `participant` aliases to industry-specific names. Keep the API call lines (those are technically accurate). Add/adjust `Note` annotations to describe business context.
- **Per-industry diagram variants for shared demos:** CustomerPortal and Application share the same Orders flow but should have different participant labels (Lender's POS vs Benefits Portal). Since these are already separate files (copy-paste approach), each gets its own diagram.

## Implementation Units

- [ ] **Unit 1: Rewrite industry and demo card text in App.jsx + Home.jsx**

  **Goal:** Update INDUSTRIES registry descriptions and Home page hero text.

  **Requirements:** R1, R2, R8, R9

  **Dependencies:** None

  **Files:**
  - Modify: `src/App.jsx`
  - Modify: `src/Home.jsx`

  **Approach:**

  Industry descriptions (Home page):
  - **Mortgage:** "Verify borrower income, employment, and assets in minutes — with GSE-certified reports for Day 1 Certainty."
  - **Public Sector:** "Verify income and employment for benefit eligibility, program enrollment, and recertification — instantly."
  - **Consumer Credit:** "Approve more borrowers with instant income and asset verification. Reduce fraud and speed up decisioning."
  - **Retail Banking:** "Acquire deposits and enable paycheck-linked lending with direct payroll connections."

  Demo card descriptions — rewrite each `desc` to describe the business workflow (see detailed copy in each per-industry unit below). Keep all `tags` unchanged.

  Home page:
  - Headline: "Truv Quickstart"
  - Subtitle: "See how Truv helps verify income, employment, and assets across industries — from mortgage origination to consumer lending to direct deposit switching."

  **Test scenarios:**
  - Test expectation: none — pure copy change

  **Verification:**
  - No demo card `desc` mentions API endpoint names or technical field names
  - Each industry description communicates a business value proposition

- [ ] **Unit 2: Rewrite Mortgage demo intro screens, guides, and diagrams**

  **Goal:** Update all text in Application, FollowUp, LOS, and UploadDocuments to mortgage business context.

  **Requirements:** R3, R4, R5, R6, R7, R9

  **Dependencies:** None (parallel with all units)

  **Files:**
  - Modify: `src/demos/Application.jsx`
  - Modify: `src/demos/FollowUp.jsx`
  - Modify: `src/demos/LOS.jsx`
  - Modify: `src/demos/UploadDocuments.jsx`

  **Approach:**

  **Application.jsx:**
  - Intro label: "Mortgage — Point of Sale"
  - Intro headline: "Verify during the loan application"
  - Intro subtitle: "In this demo, a borrower fills out a loan application and verifies their income, employment, or assets in real time — right inside the point-of-sale."
  - STEPS titles: "Borrower fills out application" → "Borrower completes verification" → "Truv processes results" → "Lender reviews report"
  - STEPS guide HTML: keep existing API content, but adjust the intro sentence of each to match the title
  - Diagrams: change `participant App as Your App` → `participant App as Lender's POS`, add business-context notes (e.g., `Note over App: Borrower enters PII and selects employer`)
  - Product picker cards: mortgage-specific descriptions ("Verify current income and pay history for loan qualification" instead of generic)

  **FollowUp.jsx:**
  - Intro label: "Mortgage — Follow-up Tasks"
  - Intro headline: "Complete remaining verifications"
  - Intro subtitle: "After submitting a loan application, the borrower returns to complete outstanding verifications — income, employment, or assets."
  - STEPS titles: "Loan officer creates verification tasks" → "Borrower completes each task" → "Truv sends webhook updates" → "Loan officer reviews reports"
  - Diagram: `participant App as Lender's POS`

  **LOS.jsx:**
  - Intro label: "Mortgage — LOS Integration"
  - Intro headline: "Verify from your loan origination system"
  - Intro subtitle: "A loan officer creates verification orders using borrower data on file and sends a link via email or SMS. The borrower completes verification on their own device."
  - STEPS titles: "Loan officer creates order" → "Borrower receives verification link" → "Loan officer reviews results"
  - Diagram: `participant V as Loan Officer`, notes referencing LOS workflow

  **UploadDocuments.jsx:**
  - Intro label: "Mortgage — Document Processing"
  - Intro headline: "Extract income data from documents"
  - Intro subtitle: "Upload pay stubs, W-2s, and tax returns already collected. Truv validates the documents and extracts structured income data for underwriting."
  - STEPS titles: "Upload borrower documents" → "Truv processes documents" → "Review extracted data"
  - Diagram: `participant App as Lender's POS`, notes referencing document collection for mortgage

  **Patterns to follow:**
  - Plaid intro style: business headline → narrative subtitle
  - Keep guide HTML content (API snippets) intact

  **Test scenarios:**
  - Test expectation: none — pure copy change

  **Verification:**
  - All intro screens lead with mortgage business context
  - STEPS titles describe business workflow, guide HTML keeps API details
  - Diagram participants use mortgage-specific labels

- [ ] **Unit 3: Rewrite Consumer Credit demo intro screens, guides, and diagrams**

  **Goal:** Update SmartRouting, BankIncome, PayrollIncome, PaycheckLinkedLoans.

  **Requirements:** R3, R4, R5, R6, R7, R9

  **Dependencies:** None (parallel)

  **Files:**
  - Modify: `src/demos/SmartRouting.jsx`
  - Modify: `src/demos/BankIncome.jsx`
  - Modify: `src/demos/PayrollIncome.jsx`
  - Modify: `src/demos/PaycheckLinkedLoans.jsx`

  **Approach:**

  **SmartRouting.jsx:**
  - Intro label: "Consumer Credit — Smart Routing"
  - Headline: "Route to the best verification method"
  - Subtitle: "The system checks the applicant's employer payroll coverage and recommends the fastest path — payroll, bank transactions, or document upload. The applicant can accept or override."
  - STEPS titles: "Applicant submits information" → "System recommends verification method" → "Applicant connects via Bridge" → "Truv processes verification" → "Lender reviews report"
  - Diagram: `participant App as Lending Platform`

  **BankIncome.jsx:**
  - Intro label: "Consumer Credit — Bank Income"
  - Headline: "Verify income from bank transactions"
  - Subtitle: "When payroll data isn't available, verify income by connecting to the applicant's bank account. Truv analyzes transaction history and generates an income insights report."
  - STEPS titles: "Applicant submits information" → "Applicant connects bank account" → "Truv processes transactions" → "Lender reviews income report"
  - Diagram: `participant App as Lending Platform`, note about `data_sources: [financial_accounts]`

  **PayrollIncome.jsx:**
  - Intro label: "Consumer Credit — Payroll Income"
  - Headline: "Verify income directly from payroll"
  - Subtitle: "Connect to the applicant's payroll provider to verify current income, employment, and pay history — the fastest path for lending decisions."
  - STEPS titles: "Applicant submits information" → "Applicant connects payroll" → "Truv processes verification" → "Lender reviews income report"
  - Diagram: `participant App as Lending Platform`

  **PaycheckLinkedLoans.jsx:**
  - Intro label: "Consumer Credit — Paycheck-Linked Loans"
  - Headline: "Set up payroll deductions for loan repayment"
  - Subtitle: "The borrower connects their payroll provider and authorizes automatic deductions for loan repayment. Payments start on the next pay cycle."
  - STEPS titles: "Borrower submits information" → "Borrower connects payroll" → "Truv sets up deduction" → "Lender reviews confirmation"
  - Diagram: `participant App as Lending Platform`, add `participant Payroll as Payroll Provider`, note about PLL deduction config

  **Test scenarios:**
  - Test expectation: none — pure copy change

  **Verification:**
  - All intros and steps use lending/credit terminology
  - Diagram participants are lending-specific

- [ ] **Unit 4: Rewrite Retail Banking demo intro screen, guide, and diagram**

  **Goal:** Update DepositSwitch.

  **Requirements:** R3, R4, R5, R6, R7, R9

  **Dependencies:** None (parallel)

  **Files:**
  - Modify: `src/demos/DepositSwitch.jsx`

  **Approach:**

  - Intro label: "Retail Banking — Deposit Switch"
  - Headline: "Switch direct deposit to your bank"
  - Subtitle: "A new customer connects their payroll provider and switches their direct deposit routing to your bank. The change takes effect on their next paycheck."
  - STEPS titles: "Customer provides information" → "Customer connects payroll" → "Truv switches deposit" → "Bank confirms enrollment"
  - Diagram: `participant App as Your Bank`, `participant Payroll as Payroll Provider`, add `Note over Payroll: Next paycheck deposits to your bank`

  **Test scenarios:**
  - Test expectation: none — pure copy change

  **Verification:**
  - Intro and steps use banking/deposit terminology
  - Diagram has banking-specific participants and payroll provider

- [ ] **Unit 5: Rewrite Public Sector demo intro screens, guides, and diagrams**

  **Goal:** Update CustomerPortal, PSDocuments, EmployeePortal (Verifier Portal).

  **Requirements:** R3, R4, R5, R6, R7, R9

  **Dependencies:** None (parallel)

  **Files:**
  - Modify: `src/demos/CustomerPortal.jsx`
  - Modify: `src/demos/PSDocuments.jsx`
  - Modify: `src/demos/EmployeePortal.jsx`

  **Approach:**

  **CustomerPortal.jsx:**
  - Intro label: "Public Sector — Customer Portal"
  - Headline: "Verify income for benefit eligibility"
  - Subtitle: "A citizen applies for benefits and verifies their income and employment through a self-service portal — no document uploads needed."
  - STEPS titles: "Applicant submits information" → "Applicant completes verification" → "Agency processes results" → "Agency reviews report"
  - Diagrams: `participant App as Benefits Portal`, notes referencing eligibility workflow
  - Product picker cards: government-specific descriptions ("Verify income for program eligibility" instead of generic)

  **PSDocuments.jsx:**
  - Intro label: "Public Sector — Document Processing"
  - Headline: "Extract income data from collected documents"
  - Subtitle: "Process pay stubs, W-2s, and tax returns submitted by applicants. Truv validates the documents and extracts structured income data for eligibility decisions."
  - STEPS titles: "Upload applicant documents" → "Truv processes documents" → "Review extracted income data"
  - Diagram: `participant App as Benefits Portal`

  **EmployeePortal.jsx (Verifier Portal):**
  - Intro label: "Public Sector — Caseworker Portal"
  - Headline: "Verify without the applicant present"
  - Subtitle: "A caseworker creates verification orders using applicant data on file and sends verification links via email or SMS. Track completion from a dashboard."
  - STEPS titles: "Caseworker creates verification request" → "Applicant receives link and completes" → "Caseworker reviews results"
  - Diagram: `participant V as Caseworker`, `participant User as Applicant`

  **Test scenarios:**
  - Test expectation: none — pure copy change

  **Verification:**
  - All intros use government/benefits terminology ("citizen", "applicant", "caseworker", "eligibility")
  - Diagrams have government-specific participants

## System-Wide Impact

- **Unchanged invariants:** All demo flows, routing, API calls, and functionality remain identical. Only user-facing text, step titles, and diagram labels change.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Diagram relabeling breaks Mermaid syntax | Simple participant alias change — test renders in browser |
| Step titles lose connection to the actual screen | Each title still maps 1:1 to the same screen/step index |
| Too many text changes to review | Each unit covers one industry — review per-industry |
| Accidental Plaid reference in code or comments | `grep -ri plaid src/` must return zero hits before shipping |

## Sources & References

- Truv industry docs: `~/MintDocs/developer1/mortgage/overview.mdx`, `credit/overview.mdx`, `banking/overview.mdx`, `government/overview.mdx`
- Plaid reference: Screenshots showing "Credit and Underwriting with Consumer Report" intro slide and guided demo style
- Related code: `src/App.jsx` (INDUSTRIES registry), all `src/demos/*.jsx` (intro screens, STEPS, diagrams)
