// Presentation scaffolding for PaycheckLinkedLoans demo.
// Extracted so the demo file contains only Truv API workflow code.

export const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Token uses <code>product_type: pll</code> with account details for payroll deductions.</p>' },
  { title: 'Applicant connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and confirms the payroll deduction.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv sets up deduction', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews confirmation', guide: '<p>The PLL report is fetched via the link-level endpoint:</p><pre>GET /v1/links/{link_id}/pll/report/</pre><p>The income report is fetched via:</p><pre>GET /v1/users/{user_id}/reports/income</pre><p>Returns deposit allocation details and income verification.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Consumer Credit . Paycheck-Linked Loans',
  title: 'Set up payroll loan repayment',
  subtitle: 'The applicant connects their payroll provider and authorizes automatic deductions for loan repayment. Payments start on the next pay cycle.',
};

export const REPORT_HEADER = {
  title: 'Verification Report',
  subtitle: 'Paycheck-linked lending',
};
