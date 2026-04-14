// Presentation scaffolding for BankIncome demo.
// Extracted so the demo file contains only Truv API workflow code.

export const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Financial institutions (banks) are searched via:</p><pre>GET /v1/providers/?data_source=financial_accounts</pre><p>This returns a <code>provider_id</code> (not <code>company_mapping_id</code> — that\'s for payroll employers). Pass <code>provider_id</code> when creating the bridge token to deeplink Bridge to that bank.</p><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>The <code>data_sources: [financial_accounts]</code> parameter restricts Bridge to bank connections only.</p>' },
  { title: 'Applicant connects bank account', guide: '<p>Bridge opens as a popup. The user selects their bank and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes transactions', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews income report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/income_insights/reports/</pre><p>Returns income insights derived from bank transactions.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Consumer Credit . Bank Income',
  title: 'Verify income from bank transactions',
  subtitle: 'When payroll data is not available, verify income by connecting to the applicant\'s bank account. Truv analyzes transaction history and generates an income insights report.',
};

export const REPORT_HEADER = {
  title: 'Verification Report',
  subtitle: 'Bank income verification',
};
