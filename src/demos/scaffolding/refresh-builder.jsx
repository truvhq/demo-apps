/**
 * FILE SUMMARY: Content for the Orders & Refresh Lifecycle guide.
 * INTEGRATION PATTERN: none — data and copy only.
 *
 * Everything quantitative in here traces to one captured sandbox run on
 * 2026-09-17 (see REFRESH-FINDINGS.md and scratchpad/exp/run.json): one income
 * order, three employers, one refreshed clean, one needed a challenge, one failed
 * on credentials. CAPTURED_RUN below is that run's real event stream at its real
 * offsets. Nothing here is illustrative or rounded for effect — if a number is not
 * from the capture it is either from Truv's published docs or it is absent.
 *
 * Two audiences, deliberately separated rather than blended: BUILD_SECTIONS for the
 * engineer implementing it, PROGRAM_* for the person who has to run the renewal
 * programme and cannot be handed endpoint names.
 */

// ---------------------------------------------------------------------------
// The captured run — the evidence the whole guide rests on
// ---------------------------------------------------------------------------

export const RUN_META = {
  when: '2026-09-17',
  order: '4272acbd…',
  refreshOrder: '391674aa…',
  call: 'POST /v1/orders/4272acbd…/  {"products":["income"]}',
};

// One lane per connection, plus the order itself.
export const RUN_LANES = [
  { key: 'order', label: 'the order', kind: 'order' },
  { key: 'hd', label: 'Home Depot', kind: 'conn', credential: 'goodlogin / goodpassword', verdict: 'refreshed' },
  { key: 'kr', label: 'Kroger', kind: 'conn', credential: 'goodlogin / mfa_captcha', verdict: 'needs the applicant' },
  { key: 'wm', label: 'Walmart', kind: 'conn', credential: 'goodlogin.pll.reauth / goodpassword', verdict: 'needs the applicant' },
];

// t = seconds after the refresh POST. Taken from webhook receipt times:
// 11:25:09 base, :12, :13, :14, :17, :29.
export const CAPTURED_RUN = [
  { t: 0,  lane: 'order', event: 'order-created',        status: 'pending',     tone: 'neutral' },
  { t: 0,  lane: 'kr',    event: 'order-status-updated', status: 'sent',        tone: 'neutral' },
  { t: 0,  lane: 'wm',    event: 'order-status-updated', status: 'sent',        tone: 'neutral' },
  { t: 0,  lane: 'hd',    event: 'order-status-updated', status: 'sent',        tone: 'neutral' },
  { t: 3,  lane: 'wm',    event: 'task-status-updated',  status: 'login_error', tone: 'bad', note: 'Username or password is incorrect' },
  { t: 3,  lane: 'wm',    event: 'link-disconnected',    status: null,          tone: 'bad' },
  { t: 3,  lane: 'wm',    event: 'order-refresh-failed', status: 'login_error', tone: 'bad', key: true },
  { t: 5,  lane: 'kr',    event: 'task-status-updated',  status: 'mfa_error',   tone: 'bad', note: 'Session has expired. New MFA token is required.' },
  { t: 5,  lane: 'kr',    event: 'link-disconnected',    status: null,          tone: 'bad' },
  { t: 5,  lane: 'kr',    event: 'order-refresh-failed', status: 'mfa_error',   tone: 'bad', key: true },
  { t: 8,  lane: 'hd',    event: 'task-status-updated',  status: 'done',        tone: 'good' },
  { t: 20, lane: 'hd',    event: 'order-status-updated', status: 'completed',   tone: 'good', key: true, trap: true },
];

export const RUN_SPAN = 22; // seconds on the axis

// The thing that makes this run worth showing.
export const THE_TRAP = {
  headline: 'At +20s you receive order-status-updated: completed.',
  body: 'Two of the three connections were already dead. That event carries the employer_id of the one that worked — it describes a single connection, not the order. A listener that treats it as "the refresh succeeded" has just accepted two stale employers as verified income.',
  soWhat: 'order-refresh-failed is the trigger. It is not a substitute for reading the per-connection result.',
};

// What each subscription model actually tells you about this run.
export const LISTENER_MODES = [
  {
    key: 'naive', label: 'order-status-updated only',
    conclusion: 'Refresh completed.',
    reality: 'Wrong. You saw Home Depot finish and nothing about the other two.',
    tone: 'bad',
    sees: ['sent ×3', 'completed ×1'],
  },
  {
    key: 'both', label: '+ order-refresh-failed',
    conclusion: '1 refreshed, 2 need the applicant.',
    reality: 'Correct — but the event gives you employer_id and status, nothing else.',
    tone: 'warn',
    sees: ['sent ×3', 'order-refresh-failed ×2', 'completed ×1'],
  },
  {
    key: 'tasks', label: '+ GET /v1/tasks/',
    conclusion: '1 refreshed, 2 need the applicant, and you know which employers and why.',
    reality: 'This is the only combination that lets you act per connection.',
    tone: 'good',
    sees: ['the above', 'plus link_id + error_message per task'],
  },
];

// ---------------------------------------------------------------------------
// Reading the result — the recipe
// ---------------------------------------------------------------------------

export const CORRELATION = [
  {
    n: 1, title: 'order-refresh-failed tells you THAT a refresh failed, not what',
    body: 'Its employer_id belongs to the REFRESH order, which regenerates ids, and it ships link_id: null. Useful for knowing a refresh rather than an initial connect is what broke. Not enough to act on.',
    code: null,
  },
  {
    n: 2, title: 'task-status-updated carries the stable link_id and the reason',
    body: 'This is the event to act on. It arrives in the same second as the failure event and carries both the terminal status and the link_id that is stable across refreshes.',
    code: 'listen: task-status-updated\n  → task.link_id  is your join key\n  → task.status   is the branch',
  },
  {
    n: 3, title: 'Join on link_id, never employer_id',
    body: 'A refresh creates new suborder ids. link_id survives, so it is what matches a result back to the job on your case file.',
    code: 'task.link_id  ==  original_order.employers[].link_id',
  },
  {
    n: 4, title: 'Poll the tasks endpoint when you have no webhook path',
    body: 'GET /v1/tasks/?user_id= filtered to the refresh order gives the same statuses plus error_message. Required if you cannot receive inbound webhooks; also the only way to reach a failed suborder, which carries no link_id on the refresh order itself.',
    code: 'GET /v1/tasks/?user_id={user_id}\n  → keep task.order_id == {refresh_order_id}',
  },
  {
    n: 5, title: 'Branch on the status, not the event',
    body: 'order-refresh-failed is emitted for provider problems too. Prompting someone to re-enter a password because a provider is down cannot succeed. (Observed for login_error and mfa_error; the wider set is inferred from Truv\'s documented status list.)',
    code: null,
  },
];

export const CORRELATION_EVIDENCE = {
  webhook: {
    label: 'order-refresh-failed — the trigger',
    json: `{
  "event_type": "order-refresh-failed",
  "order_id":    "391674aa…",   // the REFRESH order
  "employer_id": "a20c8885…",   // new id, not on your case file
  "status":      "login_error",
  "link_id":     null,          // nothing to join on
  "data_source": null
}`,
  },
  taskEvent: {
    label: 'task-status-updated — carries the stable key',
    json: `{
  "event_type": "task-status-updated",
  "task_id":  "25ee65f6…",
  "link_id":  "f9d9b42b…",   // STABLE across refreshes
  "status":   "login_error"
}`,
  },
  task: {
    label: 'GET /v1/tasks/ — adds error_message',
    json: `{
  "id":            "25ee65f6…",
  "order_id":      "391674aa…",   // matches the refresh order
  "link_id":       "f9d9b42b…",   // STABLE — this is your join key
  "status":        "login_error",
  "error_message": "Username or password is incorrect"
}`,
  },
};

// ---------------------------------------------------------------------------
// Refresh or new order
// ---------------------------------------------------------------------------

// The comparison that decides it. Every row below was exercised on 2026-09-17
// EXCEPT where marked — see NEW_ORDER_PROOF for what was and was not observed.
export const REFRESH_VS_NEW = [
  { q: 'Employers already connected',             refresh: 'No applicant action.',                          neworder: 'Presented as "already connected", nothing to type.', win: 'tie' },
  { q: 'Drop an employer (the job ended)',        refresh: 'Yes — scope employers[] to the ones that remain.', neworder: 'Yes — leave it out.', win: 'tie' },
  { q: 'Add an employer (a new job)',             refresh: 'No. A refresh cannot introduce a new connection.', neworder: 'Yes — include it.', win: 'new' },
  { q: 'Needs an applicant-facing link',          refresh: 'No. Server-side only.',                          neworder: 'Yes, to reach the new connection.', win: 'refresh' },
  { q: 'Can leave an order that never completes', refresh: 'Yes, if a connection fails and is not scoped out.', neworder: 'Also yes, until every connection is done.', win: 'tie' },
  { q: 'Cost',                                    refresh: 'Bills as a verification.',                        neworder: 'Bills as a verification.', win: 'tie' },
];

// Scoping is the finding that makes the hard case tractable.
export const SCOPING = {
  title: 'A refresh can drop an employer. That is the answer to "I no longer work there".',
  body: 'Pass the employer ids you want from the ORIGINAL order. The refresh order is built with only those connections — the others are not pending or skipped, they are absent. So when a connection fails and the person confirms the job ended, re-refresh scoped to the survivors and you get an order that can actually complete, with no applicant contact at all.',
  code: `POST /v1/orders/{original_order_id}/
{ "products": ["income"],
  "employers": [ { "id": "e13c392c…" },
                 { "id": "10a06a90…" } ] }

// 4-connection order in, 2-suborder refresh order out.
// Omit "employers" to refresh everything.`,
  caveat: 'Verified 2026-09-17: a 4-connection order refreshed with two ids produced a refresh order with exactly those two suborders.',
};

export const NEW_ORDER_PROOF = {
  claim: 'A new order reuses the connections they already have.',
  body: 'Pass the same external_user_id and Truv resolves the same user. An employer connected on a previous order is presented as already connected, with nothing to type.',
  quote: 'Your Home Depot account is already connected. Your account was successfully connected today, no further action is needed.',
  observed: 'Observed 2026-09-17: same user_id resolved, and zero credential inputs shown for a previously-connected employer.',
  notObserved: 'NOT yet verified: that such an order completes on its own, mints a report, or yields data without the applicant finishing the flow. The run was not driven to completion. Do not plan around the unverified half.',
};

export const IDENTITY = {
  title: 'What to keep on the case file',
  body: 'Over a multi-year renewal cycle this is the decision that bites. A refresh creates a new order with new suborder ids, and the original order\'s refresh_order field is overwritten every time — it only ever points at the most recent refresh, so there is no chain to walk backwards.',
  keep: [
    { what: 'external_user_id', why: 'Yours. It is what makes a returning applicant the same Truv user, and what lets a new order reuse their existing connections.' },
    { what: 'the ORIGINAL order id', why: 'The durable anchor. Refresh against this, and scope with the employer ids that live on it.' },
    { what: 'link_id per employer', why: 'Stable across refreshes. The only safe key for joining a refresh result back to a job on the case.' },
    { what: 'each refresh order id, as you create it', why: 'If you want history. Truv will not keep it for you.' },
  ],
  avoid: 'Do not key anything on employer_id. It is regenerated on every refresh order.',
};

export const GATES = [
  { when: 'You want current data and nothing about their jobs has changed', then: 'Refresh', call: 'POST /v1/orders/{order_id}/', why: 'One server-side call, no link to send, nobody involved if the sessions are alive.' },
  { when: 'A job ended and they still have the others', then: 'Refresh, scoped', call: 'POST /v1/orders/{id}/ with employers[]', why: 'Pass only the employer ids that remain. The dropped one is absent from the refresh order, so the order can complete with nobody contacted.' },
  { when: 'They picked up a new job', then: 'New order', call: 'POST /v1/orders/', why: 'A refresh cannot introduce a connection the order never had. Employers they already connected carry over.' },
  { when: 'The connection came from a document upload', then: 'New order', call: 'POST /v1/orders/', why: 'No stored credential exists, so there is nothing to re-pull. Ever.' },
  { when: 'Credentials are past your retention window', then: 'New order', call: 'POST /v1/orders/', why: 'Government tenants keep stored credentials for 13 months (GOVERNMENT_CREDS_RETENTION_PERIOD in Truv\'s platform config); the non-government default is roughly 6 months, and it is overridable per client. After that only a fresh connection works. Confirm the figure for your own tenant.' },
  { when: 'A refresh failed on credentials and they still work there', then: 'Send the refresh order\'s link', call: 'refresh_order.share_url', why: 'Opens on the challenge with credentials already stored. One applicant action, not a restart.' },
  { when: 'A refresh returned no_data, or the provider errored', then: 'Do not contact the applicant', call: 'document upload, or retry later', why: 'Nothing they can do will change the result.' },
];

// Limits that will shape any real design, and are easy to discover the hard way.
export const LIMITS = [
  { what: '3 refreshes per order per 24 hours', then: 'Then 429. A concurrent refresh on the same order returns 400. Disable the control while one is in flight rather than finding this in production.' },
  { what: 'Refresh-eligible a few seconds after Bridge finishes', then: 'The order reads completed before its connections can be refreshed; refreshing too early returns 400 "Can not find any employers connected to refresh the data". Wait for a suborder with an access_token and status completed.' },
  { what: '300 order creations per minute', then: 'Bound the concurrency of any batch.' },
  { what: 'Every refresh bills as a verification', then: 'Per Truv\'s published pricing. Whether a wholly failed refresh also bills is unconfirmed — get it in writing.' },
];

export const ANTIPATTERN = {
  title: 'Do not add an employer to an existing order',
  body: 'POST /v1/orders/{id}/employers/ returns 200, so it looks supported. Called on a completed order it set completed_at from a real timestamp back to null — a finished verification silently became unfinished, while the data stayed put. Called on an in-flight refresh order it adds one more connection that must be completed before the order can ever finish.',
  instead: 'New employment → new order.',
};

// ---------------------------------------------------------------------------
// Getting the re-auth done: two delivery shapes
// ---------------------------------------------------------------------------

export const DELIVERY = [
  {
    key: 'embedded',
    label: 'Embedded',
    when: 'They are in your portal right now.',
    mechanism: 'Mount the refresh order\'s bridge_token in Bridge, inline.',
    calls: [
      { call: 'POST /v1/orders/{order_id}/', note: 'take refresh_order.bridge_token' },
      { call: 'TruvBridge.init({ bridgeToken, isOrder: true })', note: 'mount it inline' },
      { call: 'onEvent("COMPLETED", …, "order")', note: 'the only safe advance signal' },
    ],
    pro: 'Resolved before they leave the page.',
    con: 'A refresh takes tens of seconds. Show the previous data with a freshness stamp and update in place — never block the screen on it.',
  },
  {
    key: 'sms',
    label: 'Link by SMS or email',
    when: 'Nobody is watching — a batch, a cron, or a caseworker acting without them.',
    mechanism: 'Send the refresh order\'s share_url. One link covers every connection that failed.',
    calls: [
      { call: 'POST /v1/orders/{order_id}/', note: 'take refresh_order.share_url' },
      { call: 'send that URL to the applicant', note: 'SMS or email — you send it, not Truv' },
      { call: 'order-status-updated per connection', note: 'plus your own give-up timer' },
    ],
    pro: 'Verified: opening it lists every employer as "Previously connected", and reconnecting skipped the credential form entirely — the applicant answered only the MFA challenge.',
    con: 'You need your own give-up timer. There is no abandonment event.',
  },
];

export const REAUTH_NOTE = {
  title: 'Where the re-auth actually comes from',
  body: 'The failed suborder on the refresh order has link_id: null and access_token: null — there is nothing on it to re-authenticate with. So Bridge Update Mode driven from the refresh order cannot work. Use the refresh order\'s own share_url or bridge_token, which covers all of its connections; or mint an Update Mode token from the ORIGINAL order\'s suborder access_token when you want to drive one specific connection inline.',
};

// ---------------------------------------------------------------------------
// Every outcome, with a name a human can read
// ---------------------------------------------------------------------------

export const OUTCOME_CLASSES = {
  ok:         { label: 'Done',            tone: 'good',    who: 'nobody' },
  credential: { label: 'Needs the person', tone: 'warn',    who: 'the applicant' },
  provider:   { label: 'Stuck at provider', tone: 'warn',   who: 'the applicant, with their provider' },
  nodata:     { label: 'Nothing returned', tone: 'neutral', who: 'a caseworker' },
  transient:  { label: 'Not their problem', tone: 'neutral', who: 'nobody — retry' },
};

export const OUTCOMES = [
  { status: 'done',            cls: 'ok',         plain: 'Refreshed successfully',            action: 'Take the data. Show when it was refreshed.',            cred: { u: 'goodlogin', p: 'goodpassword' }, seen: true },
  { status: 'login_error',     cls: 'credential', plain: 'Their saved sign-in no longer works', action: 'Send the refresh order link. Also ask if the job ended.', cred: { u: 'goodlogin.pll.reauth', p: 'goodpassword' }, seen: true, ambiguous: true },
  { status: 'mfa_error',       cls: 'credential', plain: 'A security challenge needs answering', action: 'Send the refresh order link. Also ask if the job ended.', cred: { u: 'goodlogin', p: 'mfa_captcha', hint: 'captcha 9M4BP' }, seen: true, ambiguous: true },
  { status: 'session_expired', cls: 'credential', plain: 'The saved session aged out',          action: 'Send the refresh order link. Also ask if the job ended.', cred: { u: 'goodlogin.pll.expired', p: 'goodpassword' }, seen: false, ambiguous: true },
  { status: 'account_locked',  cls: 'provider',   plain: 'Their payroll account is locked',     action: 'They unlock it with their provider. If the deadline is close, take a document.', cred: null, seen: false },
  { status: 'unable_to_reset', cls: 'provider',   plain: 'The connection could not be rebuilt', action: 'Same as locked — provider, or document.',              cred: null, seen: false },
  { status: 'no_data',         cls: 'nodata',     plain: 'Connected, but no records came back', action: 'Document or self-certify. NEVER record as $0 income.',  cred: { u: 'goodlogin', p: 'no_data' }, seen: false, danger: true },
  { status: 'not_supported',   cls: 'nodata',     plain: 'Refresh is not supported here',       action: 'Document or self-certify.',                            cred: null, seen: false, note: 'Cannot be produced in sandbox — DS-3507.' },
  { status: 'unavailable',     cls: 'transient',  plain: 'The provider was down',               action: 'Retry later. Do not contact anyone.',                  cred: null, seen: false },
  { status: 'error',           cls: 'transient',  plain: 'The provider errored',                action: 'Retry later. Do not contact anyone.',                  cred: null, seen: false },
  { status: 'config_error',    cls: 'transient',  plain: 'A provider-side configuration problem', action: 'Retry later. Do not contact anyone.',                cred: { u: 'goodlogin.pll.config_error', p: 'goodpassword' }, seen: false },
];

export const NO_DATA_WARNING = 'no_data means the provider connected and returned nothing. It is NOT a verified $0. Recording it as zero earnings produces a wrong eligibility determination with an audit trail showing the system said so.';

// ---------------------------------------------------------------------------
// Things the capture settled that people keep asking
// ---------------------------------------------------------------------------

export const ANSWERED = [
  { q: 'If a refresh order can never complete, am I wedged?', a: 'No. Refreshing the original again returned 200 and created a second refresh order, with the first still incomplete.' },
  { q: 'Which order id do I keep on the case file?', a: 'The original. refresh_order on it is overwritten each time and only ever points at the latest refresh — there is no chain to walk, so store refresh ids yourself if you need history.' },
  { q: 'Does a re-auth fix the connection for next time?', a: 'No. Kroger was re-authenticated successfully, then failed again with mfa_error on the next refresh minutes later. A re-auth clears the order in front of you, not the link\'s future.' },
  { q: 'Does the original order change when I refresh it?', a: 'Only its refresh_order pointer. Its data and its report id are untouched, which is why reading them back after a refresh gives you pre-refresh values.' },
  { q: 'Is suborder.status a per-connection progress signal?', a: 'Not during collection. On the initial order all three sat at sent — including ones already done with data — until the whole order completed. last_task_status is the per-connection signal.' },
];

// What the capture did NOT cover. Stated so nobody reads the guide as broader than
// the evidence behind it.
export const SCOPE_LIMITS = [
  'This run was income only, on payroll connections. Bank/asset connections use financial_accounts[] rather than employers[] and were not exercised — do not assume the timings, the per-connection shape, or the re-auth path carry over without testing them.',
  'One product per refresh request. A mixed income + employment order was not tested.',
  'Assets refresh additionally needs request_extended_history: true or it silently returns a 90-day transaction window instead of 730.',
];

export const OPEN_QUESTIONS = [
  'Does mounting the refresh order bridge_token inline behave identically to opening its share_url? Only the hosted path was tested.',
  'Does share_url expire independently of the order, and does it survive a partial re-auth returned to days later?',
  'Truv\'s docs say each refresh bills as a separate verification. Unconfirmed: does a refresh that fails on every connection still bill, and does the applicant re-auth that follows bill again?',
  'Is link_id stable across an Update Mode re-auth, or can re-auth mint a new link?',
  'What is the real-world incidence of not_supported on payroll refreshes? It cannot be reproduced in sandbox (DS-3507).',
];

// ---------------------------------------------------------------------------
// The programme view — same facts, no endpoints
// ---------------------------------------------------------------------------

export const PROGRAM_TABLE = [
  { outcome: 'Income came back current',              who: 'Nobody',                          does: 'Pass straight to eligibility',                  contact: 'None' },
  { outcome: 'Their saved sign-in stopped working',   who: 'The applicant',                   does: 'Send one link; it resumes where it broke',       contact: '1 message' },
  { outcome: 'A security challenge needs answering',  who: 'The applicant',                   does: 'Send one link; they answer the challenge only',  contact: '1 message' },
  { outcome: 'The job may have ended',                who: 'The applicant',                   does: 'Ask which it is, then re-verify without that job', contact: '1 message' },
  { outcome: 'Locked out at their payroll provider',  who: 'The applicant + their provider',  does: 'Document upload if the deadline is close',        contact: '1 letter' },
  { outcome: 'Connected, no records returned',        who: 'A caseworker',                    does: 'Document or self-certify — never record as $0',  contact: 'Varies' },
  { outcome: 'Provider outage',                       who: 'Nobody',                          does: 'Retry later',                                    contact: 'None' },
  { outcome: 'Saved sign-in too old to reuse',        who: 'The applicant',                   does: 'Full re-verification',                           contact: 'Full packet' },
];

export const PROGRAM_CALENDAR = {
  title: 'Your renewal cycle is 12 months. Your reuse window is 13.',
  source: 'Retention is 13 months for government tenants and roughly 6 by default, set per client in Truv\'s platform config. Confirm yours in writing before planning around it.',
  body: 'Saved payroll credentials are kept for 13 months on a government tenant, about 6 otherwise. A 12-month renewal cycle therefore has roughly four weeks of margin, programme-wide. If a renewal packet slips a month — and packets slip — the saved credential is gone and that household starts from scratch.',
  marks: [
    { at: 0,  label: 'Verified at application' },
    { at: 11, label: 'Open the refresh window' },
    { at: 12, label: 'Renewal due' },
    { at: 13, label: 'Credentials deleted' },
  ],
  span: 14,
};

export const PROGRAM_RISKS = [
  { risk: '"No records found" treated as no income', impact: 'Wrong determination, appealable, with a system-generated paper trail behind it.', do: 'Make it impossible to record. Reaching the payroll account and finding nothing is not proof of zero earnings.' },
  { risk: 'An applicant stuck on a screen they cannot finish', impact: 'They abandon and lose coverage, or they call your centre.',  do: 'Never put an employer they may have left on a required-all order. Re-verify with a new order instead.' },
  { risk: 'A partial refresh reported as complete', impact: 'Stale income drives eligibility; shows up as an audit finding.',        do: 'Require per-connection results before accepting a renewal.' },
  { risk: 'Every check we re-run is billed',      impact: 'How often we re-check is a budget decision, not a technical one.',       do: 'Price the cycle before choosing quarterly against annual. Truv\'s published pricing bills each re-check as its own verification; whether a failed attempt is also billed is not confirmed, so get that in writing.' },
  { risk: 'Whether the original consent covers a silent re-pull', impact: 'Re-using a saved sign-in eleven months later, with nobody present, may exceed what the applicant agreed to at application.', do: 'Put this to your counsel before you schedule anything. It is a legal question, not a technical one, and it is the first thing they will ask.' },
  { risk: 'Document uploads are a one-way door',   impact: 'Anyone who uploads this year cannot be auto-refreshed next year.',       do: 'Track the share of the caseload leaving the automated path each cycle.' },
];

export const PROGRAM_SCRIPTS = [
  { title: 'Reconnect request', body: 'We checked your income with {employer} and need you to sign in again to finish. Tap this link — you will not need to re-enter your employer, just confirm it is you. It takes about a minute.' },
  { title: 'Did the job end?', body: 'We could not reach your {employer} account. If you still work there, tap this link to reconnect. If you no longer work there, reply NO and we will update your case and verify your current job instead.' },
];

export const UNKNOWN_TO_PROGRAM = 'What share of a caseload refreshes with no human touch — we do not have a production rate to give you, and the three-connection test on this page is a demonstration, not a sample. Ask for a pilot batch against your own population before committing to a process design.';

// ---------------------------------------------------------------------------
// Sidebar guide — one step per Build tab, in the order they appear
// ---------------------------------------------------------------------------

export const STEPS = [
  {
    title: 'Read the result',
    guide: `<p>A refresh is one call. Reading it is the hard part, because <code>order-status-updated</code> is emitted <strong>per connection</strong> and carries an <code>employer_id</code>.</p>
<p>In the captured run a <code>completed</code> event arrived 20s in — for the one employer that worked, while two were already dead. Treating that as "the refresh succeeded" accepts stale income as verified.</p>
<pre><code>order-refresh-failed  → a refresh failed
task-status-updated   → which one, and why
  .link_id            → your join key
  .status             → your branch
GET /v1/tasks/        → same, when you
                        have no webhook</code></pre>
<p><code>order-refresh-failed</code> ships <code>link_id: null</code>, so it cannot tell you which connection broke. <code>task-status-updated</code> carries both the stable <code>link_id</code> and the status, in the same second.</p>`,
  },
  {
    title: 'Refresh or new order',
    guide: `<p>A new order for the same <code>external_user_id</code> resolves to the same user and carries over every employer they have already connected with <strong>no credential entry</strong>.</p>
<p>So a new order does everything a refresh does, plus the two things a refresh cannot: drop a job that ended, and add a new one.</p>
<p>Do <strong>not</strong> use <code>POST /v1/orders/{id}/employers/</code> — on a completed order it reset <code>completed_at</code> to <code>null</code>.</p>`,
  },
  {
    title: 'Get the re-auth done',
    guide: `<p>The failed suborder on a refresh order has <code>link_id: null</code> and <code>access_token: null</code>, so there is nothing on it to re-authenticate with.</p>
<p>Use the refresh order's own <code>share_url</code> (send it) or its <code>bridge_token</code> (mount it inline). Verified: it opens on the challenge with credentials already stored.</p>`,
  },
  {
    title: 'Every outcome',
    guide: `<p>Eleven terminal statuses in five classes. Only one class is the applicant's to fix.</p>
<p><code>no_data</code> means the provider connected and returned nothing. It is <strong>not</strong> a verified $0 — never write it to an income field.</p>`,
  },
  {
    title: 'Run it live',
    guide: `<p>Three employers, three credentials, three different refresh outcomes. Bridge pre-fills <code>goodlogin</code>/<code>goodpassword</code> in sandbox — overwrite both fields or you will connect a healthy account and the scenario will not reproduce.</p>`,
  },
];
