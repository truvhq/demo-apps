/**
 * FILE SUMMARY: Lightweight vertical (industry) metadata — id, name, desc.
 * DATA FLOW: Pure data, no imports, no side effects.
 *
 * Single source of truth for the vertical labels. Kept free of component
 * imports so it can be imported cheaply from anywhere — notably the header
 * use-case switcher (VerticalSwitcher.jsx), which must stay decoupled from the
 * full App registry (App.jsx attaches the demo components and pulls in the whole
 * demo graph). App.jsx builds its INDUSTRIES registry by spreading these.
 */
export const VERTICAL_META = [
  {
    id: 'mortgage',
    name: 'Mortgage',
    desc: 'Verify borrower income, employment, and assets in minutes with GSE-certified reports for Day 1 Certainty.',
  },
  {
    id: 'public-sector',
    name: 'Public Sector',
    desc: 'Instant income and employment verification for benefit eligibility, program enrollment, and recertification.',
  },
  {
    id: 'consumer-credit',
    name: 'Consumer Credit',
    desc: 'Approve more borrowers with instant income and asset verification. Reduce fraud and speed up decisioning.',
  },
  {
    id: 'retail-banking',
    name: 'Retail Banking',
    desc: 'Acquire deposits and enable paycheck-linked lending with direct payroll connections.',
  },
  {
    id: 'coverage-analysis',
    name: 'Coverage Analysis',
    desc: 'Bulk-check Truv coverage for thousands of employers or financial institutions in one upload. Rate-limited and retried so you can run an entire book of business in minutes.',
  },
];

// Keyed lookup for building the full registry: { id -> { id, name, desc } }.
export const VERTICAL_META_BY_ID = Object.fromEntries(VERTICAL_META.map(v => [v.id, v]));
