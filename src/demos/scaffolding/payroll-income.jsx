// Presentation scaffolding for PayrollIncome demo.
// Extracted so the demo file contains only Truv API workflow code.

export const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>This returns a <code>company_mapping_id</code> (not <code>provider_id</code> — that\'s for banks). Pass <code>company_mapping_id</code> when creating the bridge token to deeplink Bridge to that employer.</p><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>The <code>data_sources: [payroll]</code> parameter restricts Bridge to payroll providers only.</p>' },
  { title: 'Applicant connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes verification', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews income report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/reports/</pre><p>Returns VOIE report with income and employment data.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Consumer Credit . Payroll Income',
  title: 'Verify income directly from payroll',
  subtitle: 'Connect to the applicant\'s payroll provider to verify current income, employment, and pay history. The fastest and most accurate path for lending decisions.',
};

export const REPORT_HEADER = {
  title: 'Verification Report',
  subtitle: 'Payroll income verification',
};
