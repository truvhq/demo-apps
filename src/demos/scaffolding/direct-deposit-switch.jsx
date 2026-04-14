// Presentation scaffolding for DirectDepositSwitch demo.
// Extracted so the demo file contains only Truv API workflow code.

export const STEPS = [
  { title: 'Customer provides information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Token uses <code>product_type: deposit_switch</code> with target account details.</p>' },
  { title: 'Customer connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and confirms the deposit switch.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv switches deposit', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Bank confirms enrollment', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>GET /v1/users/{user_id}/deposit_switch/report/</pre><p>Confirms the direct deposit was switched.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Retail Banking . Deposit Switch',
  title: 'Switch direct deposit to your bank',
  subtitle: 'A new customer connects their payroll provider and switches their direct deposit routing to your bank. The change takes effect on their next paycheck.',
};

export const REPORT_HEADER = {
  title: 'Verification Report',
  subtitle: 'Direct deposit switch',
};
