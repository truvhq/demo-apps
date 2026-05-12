// Presentation scaffolding for IncomePLLChained demo.
// Extracted so the demo file contains only Truv API workflow code.

export const STEPS = [
  { title: 'Pre-check coverage', guide: '<p>Search for the employer, then check Truv\'s PLL coverage <em>before</em> creating any order:</p><pre>GET /v1/company-mappings-search/?query=...&product_type=pll\nGET /v1/companies/{company_mapping_id}?product_type=pll</pre><p>If <code>coverage</code> is <code>low</code>, <code>unsupported</code>, or <code>null</code> — route the borrower to a manual path.</p>' },
  { title: 'Create the VOIE order', guide: '<p>Create an income order tied to a stable <code>order_number</code> (your loan/application ID). The PLL order in step 5 must reuse this exact value.</p><pre>POST /v1/orders/\n{ products: ["income"], order_number, employers: [{ company_mapping_id }] }</pre>' },
  { title: 'Borrower auths payroll via Bridge', guide: '<p>Open Bridge with the VOIE bridge token. The borrower logs into their payroll provider — this is the only authentication step.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Decision: clear to PLL?', guide: '<p>Inspect the bank accounts and link info before creating the PLL order:</p><pre>GET /v1/orders/{voie_order_id}\nGET /v1/links/{link_id}/</pre><p>Three checks: <code>deposit_type ≠ percent</code>, allocation count under <code>features.deposit_switch.max_number</code>, and <code>is_dds_supported</code> not <code>false</code>.</p>' },
  { title: 'Create the linked PLL order', guide: '<p>Create the PLL order with the <strong>same</strong> <code>order_number</code> + <code>company_mapping_id</code>. The borrower\'s payroll session carries forward — they confirm the deduction without re-authenticating.</p><pre>POST /v1/orders/\n{ products: ["pll"], order_number, employers: [{ company_mapping_id }, { account }] }</pre>' },
  { title: 'Read the PLL report', guide: '<p>Once the borrower confirms, fetch the deposit-switch result:</p><pre>GET /v1/links/{pll_link_id}/pll/report/</pre><p>Errors? List tasks with <code>GET /v1/tasks/?user_id=...</code> for the literal provider error message.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Consumer Credit . Income + PLL',
  title: 'Verify income, then auto-repay',
  subtitle: 'Pre-check employer coverage and DDS support, run a VOIE order so the borrower authenticates with payroll once, then create a linked PLL order using the same order_number — they confirm the deduction without re-authenticating. Catches unsupported combinations up front so borrowers aren\'t stranded mid-flow.',
};

export const REPORT_HEADER = {
  title: 'PLL Verification Report',
  subtitle: 'Income + Paycheck-linked lending',
};
