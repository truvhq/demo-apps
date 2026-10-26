/**
 * FILE SUMMARY: Scaffolding for the Public Sector Renewals & Data Refresh demo.
 * INTEGRATION PATTERN: Orders flow + data refresh on the connections those orders made.
 *
 * Exports presentation config consumed by RenewalsRefresh.jsx: walkthrough stages,
 * sidebar Guide steps, and the seeded caseload.
 *
 * The four applicants below are picked so each one's refresh ends a known way. These test
 * logins were confirmed end to end in the sandbox on 2026-08-19/20:
 *
 *   goodlogin / goodpassword   payroll  -> refresh completes on its own in ~13-20s
 *   goodlogin / mfa            bank     -> refresh fails, order-refresh-failed (assets)
 *   goodlogin / mfa_captcha    payroll  -> refresh fails, order-refresh-failed (income)
 *
 * Four applicants are always shown: payroll only, assets only, payroll and assets
 * together, and two payroll employers on one order. "Add more applicants" adds rows that
 * verify income and assets and let the presenter connect whatever they like.
 *
 * NOTE the bank credential: the sandbox bank connector rejects `mfa_captcha`
 * ("Username or Password is incorrect"). Bank MFA is `mfa`, any code accepted.
 * The universal-credentials table in the docs does not mention this exception.
 */

// --- Config: seeded caseload. ---
// products     -> what the original order verifies, and what gets refreshed
// employers    -> payroll employers pre-selected in Bridge (none: the applicant picks)
// connections  -> what the presenter connects, each with the test login to use. The
//                 outcome is decided by the test login, so each one has a copy button.
// expect       -> the outcome we tested, used for the "what should happen" hint
export const CASELOAD = [
  {
    id: 'ana',
    firstName: 'Ana',
    lastName: 'Silva',
    scenario: 'Payroll only',
    products: ['income'],
    employers: ['Home Depot'],
    connections: [
      { kind: 'payroll', name: 'Home Depot', username: 'goodlogin', password: 'goodpassword', note: 'Pre-filled in Bridge. Just sign in.' },
    ],
    expect: 'silent',
    expectLabel: 'Refreshes on its own',
  },
  {
    id: 'dana',
    firstName: 'Dana',
    lastName: 'Cole',
    scenario: 'Assets only',
    products: ['assets'],
    employers: [],
    connections: [
      {
        kind: 'bank', name: 'Any bank', username: 'goodlogin', password: 'mfa',
        note: 'Pick any bank in Bridge. Replace the pre-filled password with mfa. Any code works.',
        warn: 'Keep mfa. With the pre-filled password this refresh succeeds and there is no failure to show.',
      },
    ],
    expect: 'reauth',
    expectLabel: 'Needs the applicant at renewal',
  },
  {
    id: 'marcus',
    firstName: 'Marcus',
    lastName: 'Webb',
    scenario: 'Payroll and assets',
    products: ['income', 'assets'],
    employers: ['Home Depot'],
    connections: [
      { kind: 'payroll', name: 'Home Depot', username: 'goodlogin', password: 'goodpassword', note: 'Pre-filled in Bridge. Just sign in.' },
      {
        kind: 'bank', name: 'Any bank', username: 'goodlogin', password: 'mfa',
        note: 'Pick any bank in Bridge. Replace the pre-filled password with mfa. Any code works.',
        warn: 'Keep mfa so the bank connection fails while payroll still refreshes.',
      },
    ],
    expect: 'reauth',
    expectLabel: 'Payroll refreshes, the bank connection needs the applicant',
  },
  {
    id: 'priya',
    firstName: 'Priya',
    lastName: 'Shah',
    scenario: 'Two employers',
    products: ['income'],
    employers: ['Home Depot', 'Walmart'],
    connections: [
      { kind: 'payroll', name: 'Home Depot', username: 'goodlogin', password: 'goodpassword', note: 'Pre-filled in Bridge. Just sign in.' },
      {
        kind: 'payroll', name: 'Walmart', username: 'goodlogin', password: 'mfa_captcha',
        note: 'Replace the pre-filled password with mfa_captcha. Captcha: 9M4BP (you are asked for it again when the applicant comes back).',
        warn: 'Keep mfa_captcha so Walmart fails while Home Depot still refreshes.',
      },
    ],
    expect: 'reauth',
    expectLabel: 'Home Depot refreshes, Walmart needs the applicant',
  },
];

// Sample applicants for "Add more applicants". Each verifies income and assets and lets
// the presenter connect any employer and any bank, so the outcome is not set in advance.
const EXTRA_NAMES = [
  ['Lena', 'Ortiz'], ['Omar', 'Haddad'], ['Grace', 'Kim'], ['Samuel', 'Okoye'],
  ['Elena', 'Petrova'], ['Noah', 'Fischer'], ['Aisha', 'Bello'], ['Tomas', 'Reyes'],
];

export function extraApplicant(n) {
  const [firstName, lastName] = EXTRA_NAMES[n % EXTRA_NAMES.length];
  const round = Math.floor(n / EXTRA_NAMES.length);
  return {
    id: `extra-${n}`,
    firstName,
    lastName: round ? `${lastName} ${round + 1}` : lastName,
    scenario: 'Your choice',
    products: ['income', 'assets'],
    employers: [],
    connections: [
      {
        kind: 'any', name: 'Any employer and any bank', username: 'goodlogin', password: 'goodpassword',
        note: 'Connect whatever you like. goodpassword refreshes without the applicant. To force a failure, use mfa as a bank password or mfa_captcha as a payroll password.',
      },
    ],
    expect: null,
    expectLabel: 'Depends on what you connect',
  };
}

// --- Config: sidebar Guide steps (Panel > Guide tab) ---
export const STEPS = [
  {
    title: 'Applicants connect at intake',
    guide: '<p>Normal verification orders. Each one leaves a connection to a payroll provider or bank, and a renewal reuses that connection later.</p><pre>POST /v1/orders/\n{\n  "products": ["income"],\n  "first_name": "Ana",\n  "last_name": "Silva",\n  "external_user_id": "your-applicant-id",\n  "employers": [{ "company_name": "Home Depot" }]\n}</pre><p>Send your own <code>external_user_id</code> so a returning applicant is the same Truv user.</p><p>In this demo, the test login each applicant uses decides what their refresh does later.</p>',
  },
  {
    title: 'Recertification comes due',
    guide: '<p>Refresh the existing order instead of collecting documents again. POST to the order\'s own path:</p><pre>POST /v1/orders/{order_id}/\n{ "products": ["income"] }</pre><p>Truv returns a <strong>new order</strong> with its own id, share_url and bridge_token, and pulls the data using the session the applicant already authorized. Each connection allows 1 initial request plus 3 refreshes in any 24 hours.</p>',
  },
  {
    title: 'A refresh completes or it fails',
    guide: '<p><strong>Session still valid:</strong> the refresh order completes on its own. You get <code>order-status-updated: completed</code> and fresh data, and the applicant does nothing.</p><p><strong>Applicant needed:</strong> the refresh fails and the order&rsquo;s <code>completed_at</code> stays null. This webhook tells you:</p><pre>{\n  "event_type": "order-refresh-failed",\n  "order_id": "...",\n  "employer_id": "...",\n  "status": "mfa_error",\n  "link_id": null\n}</pre><p>It only says a refresh failed. The reason is on the task for that connection, which also has the stable <code>link_id</code>.</p><p>Don&rsquo;t use a quiet order as your failure signal. <code>order-status-updated</code> is sent <em>per connection</em> with an <code>employer_id</code>, so on an order with several employers you still get <code>completed</code> for each one that worked, and that doesn&rsquo;t mean the whole refresh worked. Listen for <code>order-refresh-failed</code> and branch on <code>status</code>. Statuses like <code>no_data</code> and <code>unavailable</code> fire the same event, but signing in again won&rsquo;t fix them, so don&rsquo;t send the applicant a link.</p>',
  },
  {
    title: 'Contact only who needs it',
    guide: '<p>The failed refresh order has its own share_url. Send the applicant that link. For an MFA challenge, Bridge <strong>skips the username and password</strong> because the connection is already authorized, so they only answer the challenge.</p><p>In the sandbox, once the applicant clears MFA, that connection reports <code>completed</code> with a new report id. The order completes once every connection has.</p>',
  },
  {
    title: 'Read the refreshed data',
    guide: '<pre>GET /v1/orders/{refresh_order_id}/\nGET /v1/users/{user_id}/reports/{report_id}/</pre><p>A completed refresh order already has its own report. Read its id from <code>voie_report_id</code> (income) or <code>voa_report_id</code> (assets) and fetch that report. Assets reports live under <code>/assets/reports/</code>. Nothing needs to be created, and the original order keeps its own, older report. In the sandbox the figures came back unchanged, so this shows the flow, not changed numbers.</p>',
  },
];

// --- Config: walkthrough stages (consumed by the shared Walkthrough shell) ---
// Copy is written for a government audience: renewals, recertification, caseworkers.
export const WALKTHROUGH_STAGES = [
  {
    n: '01',
    name: 'What it is',
    kind: 'hero',
    mark: 'Public Sector · Renewals',
    title: 'Verification that stays current',
    heroTitle: 'Recertify without asking for documents again',
    lead: 'At renewal, re-check income through the connection the applicant already made at intake, instead of asking for pay stubs and bank statements again.',
    bullets: [
      'Works on payroll and bank connections',
      'If the connection still works, the applicant does nothing',
      'If it does not, you find out and contact only that applicant',
    ],
  },
  {
    n: '02',
    name: 'How it works',
    kind: 'split',
    title: 'One request. Two ways it ends.',
    lead: 'Refresh an order you already have. Either the new data comes back on its own, or the refresh stops and waits for the applicant.',
    lanes: [
      {
        tone: 'good',
        tag: 'Session still valid',
        title: 'Completes on its own',
        body: 'Fresh data comes back with no applicant contact.',
        code: 'order-status-updated: completed',
      },
      {
        tone: 'warn',
        tag: 'Applicant needed',
        title: 'Waits for the applicant',
        body: 'The connection needs an MFA challenge answered. You get a failure webhook and a link that asks only for that.',
        code: 'order-refresh-failed: mfa_error',
      },
    ],
    api: '<span class="mth">POST</span> /v1/orders/{order_id}/\n{ <span class="k">"products"</span>: [<span class="s">"income"</span>] }   <span class="c">// or ["assets"]</span>',
  },
];

// --- Helper: outcome presentation. Maps a classifier state to display copy. ---
// Kept here (not in the component) so the test suite can assert the mapping and
// the demo copy stays in one place.
export const OUTCOME_DISPLAY = {
  refreshing: { label: 'Refreshing...', tone: 'pending', detail: 'Truv is refreshing the data using the applicant\'s existing connection.' },
  refreshed: { label: 'Refreshed', tone: 'good', detail: 'Fresh data returned with no applicant action.' },
  reauth_required: { label: 'Needs the applicant', tone: 'warn', detail: 'The applicant has to answer a security challenge before this connection can refresh.' },
  failed_other: { label: 'Not fixed by signing in again', tone: 'neutral', detail: 'The provider returned no data or reported a problem on its side, like an outage or a locked account. Signing in again will not fix it, so do not send the refresh link. A locked account has to be unlocked with the provider. Do not record no_data as $0 income.' },
};

// Human-readable reason strings for the statuses this demo can produce.
export const REASON_COPY = {
  mfa_error: 'The provider asked for an MFA code only the applicant can give',
  login_error: 'The employer or bank rejected the previous sign-in',
  session_expired: 'The saved session expired',
  account_locked: 'The provider locked the account',
  unable_to_reset: 'Connection could not be re-established',
  unavailable: 'The provider was unavailable',
  config_error: 'The provider has a configuration problem',
  error: 'The provider returned an error',
  no_data: 'The provider connected but returned no records. That is not a verified $0 income',
  not_supported: 'Refresh is not supported for this connection',
};
