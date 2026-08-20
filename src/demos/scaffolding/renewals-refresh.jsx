/**
 * FILE SUMMARY: Scaffolding for the Public Sector Renewals & Data Refresh demo.
 * INTEGRATION PATTERN: Orders flow + data refresh on the connections those orders made.
 *
 * Exports presentation config consumed by RenewalsRefresh.jsx: walkthrough stages,
 * sidebar Guide steps, and the seeded caseload.
 *
 * THE CASELOAD IS THE SCRIPT. Each seeded applicant is chosen so its refresh lands
 * on a specific, verified outcome. Credentials were confirmed end to end in sandbox
 * on 2026-08-19/20:
 *
 *   goodlogin / goodpassword   payroll  -> refresh completes silently in ~13-15s
 *   goodlogin / mfa            bank     -> refresh fails, order-refresh-failed (assets)
 *   goodlogin / mfa_captcha    payroll  -> refresh fails, order-refresh-failed (income)
 *
 * Two applicants are shown by default (one silent, one re-auth, one payroll, one
 * bank) so a presenter only connects twice while still covering both axes. The
 * third is opt-in for the fuller story.
 *
 * NOTE the bank credential: the sandbox bank connector rejects `mfa_captcha`
 * ("Username or Password is incorrect"). Bank MFA is `mfa`, any code accepted.
 * The universal-credentials table in the docs does not currently carve this out.
 */

// --- Config: seeded caseload. `optional: true` rows start hidden. ---
// products    -> what the original order verifies, and what gets refreshed
// credential  -> displayed to the presenter, with a copy button, because the
//                whole point is that the outcome is credential-driven
// expect      -> the verified outcome, used for the "what should happen" hint
export const CASELOAD = [
  {
    id: 'ana',
    firstName: 'Ana',
    lastName: 'Silva',
    caseNumber: 'SNAP-4417',
    program: 'SNAP',
    products: ['income'],
    connector: 'Home Depot',
    connectorKind: 'payroll',
    credential: { username: 'goodlogin', password: 'goodpassword' },
    credentialNote: 'Bridge pre-fills these in sandbox, so this connection is zero typing.',
    expect: 'silent',
    expectLabel: 'Refreshes silently, no applicant action',
    verifiedOn: 'Aug 2025',
  },
  {
    id: 'dana',
    firstName: 'Dana',
    lastName: 'Cole',
    caseNumber: 'MED-2093',
    program: 'Medicaid',
    products: ['assets'],
    connector: 'Truv Bank (non-oAuth)',
    connectorKind: 'bank',
    credential: { username: 'goodlogin', password: 'mfa' },
    credentialNote: 'Search "Truv Bank" and pick the non-oAuth entry. Any MFA code is accepted.',
    expect: 'reauth',
    expectLabel: 'Refresh fails, needs re-authorization',
    verifiedOn: 'Aug 2025',
  },
  {
    id: 'marcus',
    firstName: 'Marcus',
    lastName: 'Webb',
    caseNumber: 'SNAP-5120',
    program: 'SNAP',
    products: ['income'],
    connector: 'Home Depot',
    connectorKind: 'payroll',
    credential: { username: 'goodlogin', password: 'mfa_captcha' },
    credentialNote: 'Answer the captcha with 9M4BP on this first connection.',
    expect: 'reauth',
    expectLabel: 'Refresh fails, needs re-authorization',
    verifiedOn: 'Aug 2025',
    optional: true,
  },
];

// --- Config: sidebar Guide steps (Panel > Guide tab) ---
export const STEPS = [
  {
    title: 'Applicants connect at intake',
    guide: '<p>Ordinary verification orders. Each one leaves behind a live connection to a payroll provider or a bank, which is the thing a renewal reuses later.</p><pre>POST /v1/orders/\n{\n  "products": ["income"],\n  "first_name": "...",\n  "last_name": "..."\n}</pre><p>The credential each applicant uses decides what their refresh does months later. That is scripted here on purpose.</p>',
  },
  {
    title: 'Recertification comes due',
    guide: '<p>Refresh the existing order instead of collecting documents again. POST to the order\'s own path:</p><pre>POST /v1/orders/{order_id}/\n{ "products": ["income"] }</pre><p>Truv returns a <strong>new order</strong> with its own id, share_url and bridge_token, then attempts the pull server-side using the stored credentials. Rate limit: 3 refreshes per order per 24 hours.</p>',
  },
  {
    title: 'Two outcomes, and only one of them is loud',
    guide: '<p><strong>Session still valid:</strong> the refresh order completes on its own. You get <code>order-status-updated: completed</code> and fresh data. No applicant action at all.</p><p><strong>Re-auth needed:</strong> the refresh task fails. The order status never changes, so <code>order-status-updated</code> is <strong>never emitted again</strong> and the order sits at <code>sent</code> indefinitely. The only signal is:</p><pre>{\n  "event_type": "order-refresh-failed",\n  "order_id": "...",\n  "status": "mfa_error",\n  "product": "income"\n}</pre><p>Subscribe to <code>order-refresh-failed</code> and branch on <code>status</code>. Statuses like <code>no_data</code> and <code>unavailable</code> fire the same event but are not credential problems, so they should not prompt anyone to re-authenticate.</p>',
  },
  {
    title: 'Re-engage only who needs it',
    guide: '<p>The failed refresh order carries its own share_url. Send that. Bridge <strong>skips username and password</strong> because credentials are already stored on the link, so the applicant only clears the MFA challenge that broke the silent refresh.</p><p>Verified in sandbox: after the applicant clears MFA, the refresh order itself flips to <code>completed</code> and produces a fresh report id.</p>',
  },
  {
    title: 'Read the refreshed data',
    guide: '<pre>GET /v1/orders/{refresh_order_id}/</pre><p>Reports are regenerated for the refresh order, so "current as of" moves forward. The original order is untouched and remains the historical record.</p>',
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
    lead: 'Eligibility is not a one-time question. Every renewal, review and redetermination asks it again, and today that usually means sending the household back for another round of pay stubs and bank statements.',
    bullets: [
      'What a renewal looks like when the connection is still alive',
      'What happens when it is not, and how you find out',
      'Who actually has to do something, and who does not',
    ],
  },
  {
    n: '02',
    name: 'The cost today',
    kind: 'card',
    title: 'Renewals repeat the hardest part of intake',
    lead: 'The applicant already connected their employer or bank once. Asking for documents at recertification throws that away and puts the burden back on the household, which is where renewal churn comes from.',
    card: {
      eyebrow: 'Recertification today',
      title: 'Collect it all over again',
      body: 'Request documents, wait, chase, re-key, re-review. Weeks of calendar time per case, and the ones who do not respond fall off benefits they still qualify for.',
      rows: [
        'The connection from intake is still there and still usable',
        'Most stored payroll and bank sessions survive to the next review',
        'One API call can answer the question with no applicant contact',
      ],
    },
    chips: [['1 call', 'to refresh'], ['0 actions', 'when the session lives'], ['3 / 24h', 'refresh cap per order']],
  },
  {
    n: '03',
    name: 'Both products',
    kind: 'diagram',
    title: 'Payroll and bank connections both refresh',
    lead: 'A renewal is not payroll-only. Wage income refreshes from the payroll connection; self-employment, benefits and asset tests refresh from the bank connection. Same call, different <code>products</code>.',
    bullets: [
      '<strong>income</strong> refreshes employment and pay history from payroll',
      '<strong>assets</strong> refreshes balances and deposits from the bank',
      'Omit the employer or account arrays to refresh every connection on the order',
    ],
    api: '<span class="mth">POST</span> /v1/orders/{order_id}/\n{ <span class="k">"products"</span>: [<span class="s">"income"</span>] }   <span class="c">// or ["assets"]</span>',
  },
  {
    n: '04',
    name: 'The fork',
    kind: 'split',
    title: 'Two outcomes, and only one announces itself',
    lead: 'This is the part that surprises teams in production. A refresh that succeeds and a refresh that needs the applicant look completely different on the wire.',
    lanes: [
      {
        tone: 'good',
        tag: 'Session still valid',
        title: 'Completes on its own',
        body: 'Fresh data lands in seconds. Nobody is contacted. The caseworker just sees updated figures.',
        code: 'order-status-updated: completed',
      },
      {
        tone: 'warn',
        tag: 'Re-authorization needed',
        title: 'Order stays at sent, forever',
        body: 'The task fails, so the order status never changes and no further status update is ever sent. Listening only to order-status-updated, this looks like a hang.',
        code: 'order-refresh-failed: mfa_error',
      },
    ],
    api: '<span class="c">// the only signal on the failure path</span>\n{\n  <span class="k">"event_type"</span>: <span class="s">"order-refresh-failed"</span>,\n  <span class="k">"order_id"</span>: <span class="s">"..."</span>,\n  <span class="k">"status"</span>: <span class="s">"mfa_error"</span>,\n  <span class="k">"product"</span>: <span class="s">"income"</span>\n}',
  },
  {
    n: '05',
    name: 'Re-engage',
    kind: 'card',
    title: 'The applicant clears one challenge, not a new verification',
    lead: 'When a refresh does need the household, it needs very little from them. The failed refresh order has its own link, and Bridge resumes at the step that broke.',
    card: {
      eyebrow: 'Verified in sandbox',
      title: 'No credentials re-entered',
      body: 'Opening the failed refresh order shows the existing connection already in place. Bridge skips username and password because the credentials are stored on the link, and goes straight to the MFA challenge. Once cleared, that same refresh order completes and produces a fresh report.',
      rows: [
        'Send the refresh order\'s own share_url, not a brand-new order',
        'Only the applicants whose refresh actually failed are contacted',
        'Everyone else is already done and never hears from you',
      ],
    },
    chips: [['1 step', 'for the applicant'], ['Same link', 'reused']],
  },
  {
    n: '06',
    name: 'Try it',
    kind: 'split',
    title: 'Run a renewal cycle yourself',
    lead: 'Connect a small caseload, jump forward to recertification, refresh everyone at once, and watch the two paths separate in real time. The credentials are scripted so both outcomes are guaranteed.',
    lanes: [
      {
        tone: 'good',
        tag: 'Ana Silva · payroll',
        title: 'Will refresh silently',
        body: 'goodlogin / goodpassword. Bridge pre-fills it, so this connection takes no typing.',
        code: 'products: ["income"]',
      },
      {
        tone: 'warn',
        tag: 'Dana Cole · bank',
        title: 'Will need re-authorization',
        body: 'goodlogin / mfa on Truv Bank (non-oAuth). Any MFA code is accepted.',
        code: 'products: ["assets"]',
      },
    ],
  },
];

// --- Helper: outcome presentation. Maps a classifier state to display copy. ---
// Kept here (not in the component) so the test suite can assert the mapping and
// the demo copy stays in one place.
export const OUTCOME_DISPLAY = {
  refreshing: { label: 'Refreshing...', tone: 'pending', detail: 'Truv is reconnecting with the stored credentials.' },
  refreshed: { label: 'Refreshed', tone: 'good', detail: 'Fresh data returned with no applicant action.' },
  reauth_required: { label: 'Re-authorization required', tone: 'warn', detail: 'The stored session needs the applicant to clear a challenge.' },
  failed_other: { label: 'Could not refresh', tone: 'neutral', detail: 'The provider could not return data. Not a credential problem, so do not prompt the applicant.' },
};

// Human-readable reason strings for the statuses this demo can produce.
export const REASON_COPY = {
  mfa_error: 'Provider asked for MFA that cannot be answered without the applicant',
  login_error: 'Stored credentials no longer work',
  session_expired: 'Stored session expired',
  account_locked: 'Provider locked the account',
  unable_to_reset: 'Connection could not be re-established',
  unavailable: 'Provider was unavailable',
  config_error: 'Provider configuration issue',
  error: 'Provider returned an error',
  no_data: 'Provider returned no records',
  not_supported: 'Refresh is not supported for this connection',
};
