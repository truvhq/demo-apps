/**
 * FILE SUMMARY: Scaffolding for the Public Sector Renewals & Data Refresh demo.
 * INTEGRATION PATTERN: Orders flow + data refresh on the connections those orders made.
 *
 * Exports presentation config consumed by RenewalsRefresh.jsx: walkthrough stages,
 * sidebar Guide steps, and the seeded caseload.
 *
 * THE CASELOAD IS THE SCRIPT. Each seeded applicant is chosen so its refresh lands
 * on a specific, verified outcome. The test logins were confirmed end to end in sandbox
 * on 2026-08-19/20:
 *
 *   goodlogin / goodpassword   payroll  -> refresh completes silently in ~13-20s
 *   goodlogin / mfa            bank     -> refresh fails, order-refresh-failed (assets)
 *   goodlogin / mfa_captcha    payroll  -> refresh fails, order-refresh-failed (income)
 *
 * Four applicants are always shown, one per shape an order can take: payroll only,
 * assets only, payroll and assets together, and two payroll connections deeplinked
 * on one order. "Add more applicants" appends free-form rows that verify income and
 * assets and let the presenter connect whatever they like.
 *
 * NOTE the bank credential: the sandbox bank connector rejects `mfa_captcha`
 * ("Username or Password is incorrect"). Bank MFA is `mfa`, any code accepted.
 * The universal-credentials table in the docs does not currently carve this out.
 */

// --- Config: seeded caseload. ---
// products     -> what the original order verifies, and what gets refreshed
// employers    -> payroll employers deeplinked into Bridge (none: the applicant picks)
// connections  -> what the presenter connects, each with the test login to use. The
//                 outcome is credential-driven, so the logins are shown with a copy button.
// expect       -> the verified outcome, used for the "what should happen" hint
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
    expectLabel: 'Refreshes silently, no applicant action',
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
    expectLabel: 'Refresh fails, needs re-authorization',
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
    expectLabel: 'Payroll refreshes, the bank connection needs re-authorization',
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
        note: 'Replace the pre-filled password with mfa_captcha. Captcha: 9M4BP (it is asked again at re-authorization).',
        warn: 'Keep mfa_captcha so Walmart fails while Home Depot still refreshes.',
      },
    ],
    expect: 'reauth',
    expectLabel: 'Home Depot refreshes, Walmart needs re-authorization',
  },
];

// Sample applicants for "Add more applicants". Each verifies income and assets and lets
// the presenter connect any employer and any bank, so there is no scripted outcome.
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
    guide: '<p>Refresh the existing order instead of collecting documents again. POST to the order\'s own path:</p><pre>POST /v1/orders/{order_id}/\n{ "products": ["income"] }</pre><p>Truv returns a <strong>new order</strong> with its own id, share_url and bridge_token, then attempts the pull server-side through the applicant\'s authenticated session. Limit: 1 initial request plus 3 refreshes per connection in any 24 hours.</p>',
  },
  {
    title: 'A refresh completes or it fails',
    guide: '<p><strong>Session still valid:</strong> the refresh order completes on its own. You get <code>order-status-updated: completed</code> and fresh data. No applicant action at all.</p><p><strong>Re-auth needed:</strong> the refresh task fails and the order&rsquo;s <code>completed_at</code> stays null. The webhook that tells you it failed is:</p><pre>{\n  "event_type": "order-refresh-failed",\n  "order_id": "...",\n  "employer_id": "...",\n  "status": "mfa_error",\n  "link_id": null\n}</pre><p>It says a refresh failed. The reason for each connection is on the task, which carries the stable <code>link_id</code>.</p><p><strong>Do not detect this by watching for silence.</strong> <code>order-status-updated</code> is emitted <em>per connection</em> and carries an <code>employer_id</code>; on an order with several employers you still receive <code>completed</code> for each one that worked, so absence of events is the wrong signal and a <code>completed</code> does not mean the refresh as a whole succeeded. Subscribe to <code>order-refresh-failed</code> and branch on <code>status</code>. Statuses like <code>no_data</code> and <code>unavailable</code> fire the same event but are not something the applicant can fix by signing in again, so they should not prompt anyone to re-authenticate.</p>',
  },
  {
    title: 'Re-engage only who needs it',
    guide: '<p>The failed refresh order carries its own share_url. Send that. for an MFA challenge Bridge <strong>skips username and password</strong> because the connection is already authorized, so the applicant only answers that challenge.</p><p>Tested in the sandbox: after the applicant clears MFA, that connection reports <code>completed</code> and produces a fresh report id. The order as a whole completes once every connection has.</p>',
  },
  {
    title: 'Read the refreshed data',
    guide: '<pre>GET /v1/orders/{refresh_order_id}/\nGET /v1/users/{user_id}/reports/{report_id}/</pre><p>A completed refresh order already has its own report. Read its id from <code>voie_report_id</code> (income) or <code>voa_report_id</code> (assets) and fetch that report. Assets reports live under <code>/assets/reports/</code>. Nothing needs to be created, and the original order keeps its own, older report. In the sandbox the figures themselves came back unchanged, so this shows the mechanics, not changed numbers.</p>',
  },
];

// --- Config: walkthrough stages (consumed by the shared Walkthrough shell) ---
// Copy is written for a government audience: renewals, recertification, caseworkers.
export const WALKTHROUGH_STAGES = [
  {
    n: '01',
    name: 'Welcome',
    kind: 'hero',
    mark: 'Public Sector · Renewals',
    title: 'Verification that stays current',
    heroTitle: 'Recertify without asking for documents again',
    lead: 'Every renewal, review and redetermination asks the eligibility question again. Today that can mean sending the household back for another round of pay stubs and bank statements. This demo shows how your system can re-check income through the connection the applicant already made at intake.',
    bullets: [
      'What a renewal looks like when the connection still works',
      'What happens when it does not, and how you find out',
      'Who has to do something and who does not',
    ],
  },
  {
    n: '02',
    name: 'The cost today',
    kind: 'card',
    title: 'Renewals ask for the same documents again',
    lead: 'The applicant already connected their employer or bank at intake. Asking for documents again at recertification ignores that connection and puts the work back on the household.',
    card: {
      eyebrow: 'Recertification today',
      title: 'Collect everything again',
      body: 'Request documents, wait, chase, re-key, re-review. Applicants who do not respond can lose benefits they still qualify for.',
      rows: [
        'The connection from intake may still be there',
        'An authenticated payroll or bank session may still be valid at the next review',
        'When it does, one API call refreshes the data with no applicant contact',
      ],
    },
    chips: [['1 request', 'to refresh a case'], ['0 actions', 'for the applicant when the session still works'], ['3 per 24 hours', 'refreshes per connection']],
  },
  {
    n: '03',
    name: 'Both products',
    kind: 'split',
    title: 'Payroll and bank connections both refresh',
    lead: 'Refresh works on both kinds of connection. Pay history refreshes from a payroll connection, and balances and deposits refresh from a bank connection. You choose which one in the request.',
    lanes: [
      {
        tag: 'Payroll connection',
        title: 'Income',
        body: 'Employment and pay history from the employer\'s payroll system.',
        code: '"products": ["income"]',
      },
      {
        tag: 'Bank connection',
        title: 'Assets',
        body: 'Balances and deposits from the applicant\'s bank account.',
        code: '"products": ["assets"]',
      },
    ],
    bullets: [
      'Refresh every connection on a case at once, or name the ones you want',
    ],
    api: '<span class="mth">POST</span> /v1/orders/{order_id}/\n{ <span class="k">"products"</span>: [<span class="s">"income"</span>] }   <span class="c">// or ["assets"]</span>',
  },
  {
    n: '04',
    name: 'The fork',
    kind: 'split',
    title: 'A refresh either completes or needs the applicant',
    lead: 'When a refresh works, the new data arrives. When it fails, your system gets a separate failure notice (a webhook). It is easy to miss if your software only watches for completions.',
    lanes: [
      {
        tone: 'good',
        tag: 'Session still valid',
        title: 'Completes on its own',
        body: 'Fresh data comes back without contacting the applicant. The caseworker sees the updated figures.',
        code: 'order-status-updated: completed',
      },
      {
        tone: 'warn',
        tag: 'Re-authorization needed',
        title: 'Stays open until the applicant acts',
        body: 'The connection needs a security challenge (MFA) answered. This connection does not finish until the applicant acts, and your system gets an order-refresh-failed notice. On a case with several employers, one can report completed while another has failed, so a completed message alone does not mean everything refreshed.',
        code: 'order-refresh-failed: mfa_error',
      },
    ],
    api: '<span class="c">// the failure notice (a webhook)</span>\n{\n  <span class="k">"event_type"</span>: <span class="s">"order-refresh-failed"</span>,\n  <span class="k">"order_id"</span>: <span class="s">"..."</span>,\n  <span class="k">"employer_id"</span>: <span class="s">"..."</span>,\n  <span class="k">"link_id"</span>: <span class="k">null</span>,\n  <span class="k">"status"</span>: <span class="s">"mfa_error"</span>\n}',
  },
  {
    n: '05',
    name: 'Re-engage',
    kind: 'card',
    title: 'The applicant clears one challenge',
    lead: 'The failed refresh comes with its own link. It opens Bridge, Truv\'s connection screen, at the step that broke, so the applicant only answers the security challenge (MFA).',
    card: {
      eyebrow: 'Tested in the Truv sandbox',
      title: 'No login re-entered for a security challenge',
      body: 'Opening the link shows the existing connection already in place. When the problem is a security challenge (MFA), Bridge skips the username and password because the connection is already authorized, and goes straight to the challenge, such as a code texted to the applicant. Once it is answered, that connection completes and produces a fresh report.',
      rows: [
        'Send the link that came with the failed refresh, not a brand-new request',
        'Only applicants whose refresh failed are contacted',
        'Everyone else is already done and is not contacted',
      ],
    },
    chips: [['1 challenge', 'for the applicant'], ['Same connection', 'kept, nothing re-entered']],
  },
  {
    n: '06',
    name: 'Try it',
    kind: 'split',
    title: 'Run a renewal cycle yourself',
    lead: 'Four applicants are ready, one for each shape an order can take: payroll only, assets only, payroll and assets together, and two employers on one order. Connect any of them, jump ahead to recertification, refresh, and see which finish on their own and which need the applicant. These are test logins in Truv\'s sandbox. Use the ones shown and each applicant gets the result described.',
    lanes: [
      {
        tone: 'good',
        tag: 'Ana Silva · payroll only',
        title: 'Will refresh without the applicant',
        body: 'goodlogin / goodpassword. Bridge pre-fills it, so this connection takes no typing.',
        code: 'products: ["income"]',
      },
      {
        tone: 'warn',
        tag: 'Dana Cole · assets',
        title: 'Will need re-authorization',
        body: 'goodlogin / mfa at any bank you pick. Any MFA code is accepted.',
        code: 'products: ["assets"]',
      },
    ],
  },
];

// --- Helper: outcome presentation. Maps a classifier state to display copy. ---
// Kept here (not in the component) so the test suite can assert the mapping and
// the demo copy stays in one place.
export const OUTCOME_DISPLAY = {
  refreshing: { label: 'Refreshing...', tone: 'pending', detail: 'Truv is refreshing the data through the applicant\'s authenticated session.' },
  refreshed: { label: 'Refreshed', tone: 'good', detail: 'Fresh data returned with no applicant action.' },
  reauth_required: { label: 'Needs the applicant', tone: 'warn', detail: 'The authenticated session needs the applicant to clear a challenge.' },
  failed_other: { label: 'Not fixed by signing in again', tone: 'neutral', detail: 'The provider returned nothing or reported a problem on its side, such as an outage or a locked account. A new login will not fix it, so do not send the refresh link. For a locked account the applicant has to unlock it with the provider. Never record no_data as $0 income.' },
};

// Human-readable reason strings for the statuses this demo can produce.
export const REASON_COPY = {
  mfa_error: 'Provider asked for MFA that cannot be answered without the applicant',
  login_error: 'The employer or bank rejected the previous sign-in',
  session_expired: 'The authenticated session expired',
  account_locked: 'Provider locked the account',
  unable_to_reset: 'Connection could not be re-established',
  unavailable: 'Provider was unavailable',
  config_error: 'Provider configuration issue',
  error: 'Provider returned an error',
  no_data: 'Provider connected and returned no records. This is not a verified $0 income',
  not_supported: 'Refresh is not supported for this connection',
};
