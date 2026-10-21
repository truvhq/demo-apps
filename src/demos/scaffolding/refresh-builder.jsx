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
  headline: 'At 20 seconds you receive order-status-updated: completed.',
  body: 'Two of the three connections had already failed by then. The event carries the employer_id of the one that worked, so it describes a single connection and not the whole order. A listener that reads it as "the refresh succeeded" has accepted two stale employers as verified income.',
  soWhat: 'Use order-refresh-failed as the trigger, and still read the result for each connection.',
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
    reality: 'Correct, but the event gives you only employer_id and status.',
    tone: 'warn',
    sees: ['sent ×3', 'order-refresh-failed ×2', 'completed ×1'],
  },
  {
    key: 'tasks', label: '+ GET /v1/tasks/',
    conclusion: '1 refreshed, 2 need the applicant, and you know which employers and why.',
    reality: 'This is the only combination that lets you act on each connection.',
    tone: 'good',
    sees: ['everything above', 'plus link_id and error_message for each task'],
  },
];

// ---------------------------------------------------------------------------
// Reading the result — the recipe
// ---------------------------------------------------------------------------

export const CORRELATION = [
  {
    n: 1, title: 'order-refresh-failed says a refresh failed, but it cannot be matched to your case file',
    body: 'Its employer_id is new on every refresh order, and it ships link_id: null. That is enough to know a connection failed, and that it was a refresh rather than an initial connect. It carries a status such as mfa_error, but not the error text, and it cannot be joined to the employer on your case file.',
    code: null,
  },
  {
    n: 2, title: 'task-status-updated carries the stable link_id and the reason',
    body: 'Act on this event. It arrives in the same second as the failure event and carries the final status and the link_id, which stays the same across refreshes. It also fires for steps along the way (login, parse, full_parse), so act only on a final status such as done, login_error or mfa_error.',
    code: 'listen: task-status-updated\n  → task.link_id  is your join key\n  → task.status   is the branch',
  },
  {
    n: 3, title: 'Match on link_id, never employer_id',
    body: 'A refresh creates new suborder ids. link_id stays the same, so use it to match a result back to the job on your case file.',
    code: 'task.link_id  ==  original_order.employers[].link_id',
  },
  {
    n: 4, title: 'Poll the tasks endpoint if you cannot receive webhooks',
    body: 'GET /v1/tasks/?user_id= filtered to the refresh order returns the same statuses plus error_message. You need it if you cannot receive inbound webhooks. It is also a way to get the link_id of a failed connection, which has none on the refresh order itself.',
    code: 'GET /v1/tasks/?user_id={user_id}\n  → keep task.order_id == {refresh_order_id}',
  },
  {
    n: 5, title: 'Branch on the status, not the event',
    body: 'order-refresh-failed also fires for provider problems. Asking someone to re-enter a password because a provider is down cannot work. (Observed for login_error and mfa_error. The other statuses come from Truv\'s documented status list.)',
    code: null,
  },
];

export const CORRELATION_EVIDENCE = {
  webhook: {
    label: 'order-refresh-failed: the trigger',
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
    label: 'task-status-updated: carries the stable key',
    json: `{
  "event_type": "task-status-updated",
  "task_id":  "25ee65f6…",
  "link_id":  "f9d9b42b…",   // STABLE across refreshes
  "status":   "login_error"
}`,
  },
  task: {
    label: 'GET /v1/tasks/ adds error_message',
    json: `{
  "id":            "25ee65f6…",
  "order_id":      "391674aa…",   // matches the refresh order
  "link_id":       "f9d9b42b…",   // STABLE, this is your join key
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
  { q: 'Employers already connected',             refresh: 'No applicant action.',                          neworder: 'Shown as "already connected". Nothing to type.', win: 'tie' },
  { q: 'Drop an employer (the job ended)',        refresh: 'Yes. Scope employers[] to the ones that remain.', neworder: 'Yes. Leave it out.', win: 'tie' },
  { q: 'Add an employer (a new job)',             refresh: 'No. A refresh cannot add a connection.', neworder: 'Yes. Include it.', win: 'new' },
  { q: 'Needs an applicant-facing link',          refresh: 'No. Server-side only.',                          neworder: 'Yes, to reach the new connection.', win: 'refresh' },
  { q: 'Can leave an order that never completes', refresh: 'Yes, if a connection fails and is not scoped out.', neworder: 'Also yes, until every connection is done.', win: 'tie' },
  { q: 'Cost',                                    refresh: 'Bills as a verification.',                        neworder: 'Bills as a verification.', win: 'tie' },
];

// Scoping is the finding that makes the hard case tractable.
export const SCOPING = {
  title: 'A refresh can drop an employer. That covers "I no longer work there".',
  body: 'Pass the employer ids you want from the original order. The refresh order is built with only those connections. The others are absent, not pending or skipped. So if a connection fails and the person confirms the job ended, refresh again scoped to the remaining employers and you get an order that can complete with no applicant contact.',
  code: `POST /v1/orders/{original_order_id}/
{ "products": ["income"],
  "employers": [ { "id": "e13c392c…" },
                 { "id": "10a06a90…" } ] }

// 4-connection order in, 2-suborder refresh order out.
// Omit "employers" to refresh everything.`,
  caveat: 'Verified 2026-09-17: the same order, which by then had a fourth employer added by an earlier test, refreshed with two ids and produced a refresh order with exactly those two suborders.',
};

export const NEW_ORDER_PROOF = {
  claim: 'A new order reuses the connections they already have.',
  body: 'Pass the same external_user_id and Truv resolves the same user. An employer connected on a previous order shows as already connected, with nothing to type.',
  quote: 'Your Home Depot account is already connected. Your account was successfully connected today, no further action is needed.',
  observed: 'Observed 2026-09-17: the same user_id resolved, and no credential inputs were shown for a previously connected employer.',
  notObserved: 'Not yet verified for a new order that reuses existing connections: that it completes on its own, creates a report, or returns data without the applicant finishing the flow. That run was not taken to completion, so do not plan around that part. This is separate from a failed refresh that the applicant re-authorizes, which did complete and create a new report id.',
};

export const IDENTITY = {
  title: 'What to keep on the case file',
  body: 'This matters most over repeated renewals. A refresh creates a new order with new suborder ids, and the original order\'s refresh_order field is overwritten each time. It only points at the most recent refresh, so you cannot walk back through earlier ones.',
  keep: [
    { what: 'external_user_id', why: 'Yours. It makes a returning applicant the same Truv user, and lets a new order reuse their existing connections.' },
    { what: 'the original order id', why: 'The id that never changes. Refresh against it, and scope with the employer ids on it.' },
    { what: 'link_id per employer', why: 'Stays the same across refreshes. Use it to match a refresh result to a job on the case.' },
    { what: 'each refresh order id, as you create it', why: 'If you want a history. Truv does not keep it for you.' },
  ],
  avoid: 'Do not key anything on employer_id. It is regenerated on every refresh order.',
};

export const GATES = [
  { when: 'You want current data and nothing about their jobs has changed', then: 'Refresh', call: 'POST /v1/orders/{order_id}/', why: 'One server-side call. No link to send, and nobody is involved if the sessions are still valid.' },
  { when: 'A job ended and they still have the others', then: 'Refresh, scoped', call: 'POST /v1/orders/{id}/ with employers[]', why: 'Pass only the employer ids that remain. The dropped one is absent from the refresh order, so it can complete with nobody contacted.' },
  { when: 'They picked up a new job', then: 'New order', call: 'POST /v1/orders/', why: 'A refresh cannot add a connection the order never had. Employers they already connected carry over.' },
  { when: 'The connection came from a document upload', then: 'New order', call: 'POST /v1/orders/', why: 'No credential was stored, so there is nothing to pull again.' },
  { when: 'Credentials are past your retention window', then: 'New order', call: 'POST /v1/orders/', why: 'Government tenants keep stored credentials for 13 months (GOVERNMENT_CREDS_RETENTION_PERIOD in Truv\'s platform config). The default for other tenants is about 6 months, and it can be set per client. After that, only a new connection works. Confirm the figure for your own tenant.' },
  { when: 'A refresh failed with mfa_error, login_error or session_expired and they still work there', then: 'Send the refresh order\'s link', call: 'refresh_order.share_url', why: 'For an MFA challenge (tested) it opens on the challenge with credentials already stored, so the applicant answers one prompt. For login_error the stored credentials were rejected, so expect the applicant to sign in again (not tested).' },
  { when: 'A refresh returned no_data, or the provider errored', then: 'Do not contact the applicant', call: 'document upload, or retry later', why: 'Nothing the applicant does will change the result.' },
];

// Limits that will shape any real design, and are easy to discover the hard way.
export const LIMITS = [
  { what: '3 refreshes per order per 24 hours', then: 'The 4th refresh within 24 hours returned 429 ("Order refresh limit exceeded", with the number of seconds until it is available again). A refresh sent while another is still running on the order returned 400 "Refresh already in progress". One sent after the earlier refresh had stopped running (finished, or waiting on the applicant) returned 200 even though that order was still incomplete. Disable the button while one is running.' },
  { what: 'Refresh-eligible shortly after Bridge finishes', then: 'The order reads completed before its connections can be refreshed. Refreshing too early returns 400 "Can not find any employers connected to refresh the data". Wait for a suborder with an access_token and status completed.' },
  { what: '300 API requests per minute (Truv docs)', then: 'Requests over the limit return 429. Order creation is metered separately. Bound the concurrency of any batch.' },
  { what: 'Every refresh bills as a verification', then: 'Per Truv\'s published pricing. Whether a fully failed refresh also bills is unconfirmed, so get it in writing.' },
];

export const ANTIPATTERN = {
  title: 'Do not add an employer to an existing order',
  body: 'POST /v1/orders/{id}/employers/ returns 200, so it looks supported. On a completed order it set completed_at from a real timestamp back to null: a finished verification became unfinished while the data stayed in place. On an in-flight refresh order it adds one more connection that must be completed before the order can finish.',
  instead: 'New employment: create a new order.',
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
      { call: 'onEvent("COMPLETED", …, "order")', note: 'the applicant is done in Bridge. Then check each connection\'s result' },
    ],
    pro: 'The applicant fixes it while they are already in your portal.',
    con: 'In the captured run the success event arrived about 20 seconds after the request (the task itself finished after about 8). Show the previous data with a "last refreshed" date and update it in place. Do not block the screen while you wait.',
  },
  {
    key: 'sms',
    label: 'Link by SMS or email',
    when: 'Nobody is watching: a batch, a scheduled job, or a caseworker acting without the applicant.',
    mechanism: 'Send the refresh order\'s share_url. One link covers every connection that failed.',
    calls: [
      { call: 'POST /v1/orders/{order_id}/', note: 'take refresh_order.share_url' },
      { call: 'send that URL to the applicant', note: 'by SMS or email. You send it, not Truv' },
      { call: 'order-status-updated per connection', note: 'plus your own timeout' },
    ],
    pro: 'Verified: opening it lists every employer as "Previously connected", and reconnecting skipped the credential form. The applicant only answered the MFA challenge.',
    con: 'You need your own timeout. There is no abandonment event.',
  },
];

export const REAUTH_NOTE = {
  title: 'Where the re-authorization comes from',
  body: 'The failed suborder on the refresh order has link_id: null and access_token: null, so there is nothing on it to re-authenticate with. You cannot start Bridge Update Mode from the refresh order\'s failed row. Use the refresh order\'s own share_url or bridge_token instead, which covers all of its connections. To drive one specific connection inline, create an Update Mode token from the original order\'s suborder access_token.',
};

// ---------------------------------------------------------------------------
// Every outcome, with a name a human can read
// ---------------------------------------------------------------------------

export const OUTCOME_CLASSES = {
  ok:         { label: 'Done',            tone: 'good',    who: 'nobody' },
  credential: { label: 'Needs the applicant', tone: 'warn',    who: 'the applicant' },
  provider:   { label: 'Blocked at the provider', tone: 'warn',   who: 'the applicant, with their provider' },
  nodata:     { label: 'Nothing returned', tone: 'neutral', who: 'a caseworker' },
  transient:  { label: 'Temporary provider issue', tone: 'neutral', who: 'nobody, retry later' },
};

export const OUTCOMES = [
  { status: 'done',            cls: 'ok',         plain: 'Refreshed successfully',            action: 'Take the data. Show when it was refreshed.',            cred: { u: 'goodlogin', p: 'goodpassword' }, seen: true },
  { status: 'login_error',     cls: 'credential', plain: 'Their saved sign-in no longer works', action: 'Send the refresh order link. Also ask whether the job ended.', cred: { u: 'goodlogin.pll.reauth', p: 'goodpassword' }, seen: true, ambiguous: true },
  { status: 'mfa_error',       cls: 'credential', plain: 'A security challenge needs answering', action: 'Send the refresh order link. Also ask whether the job ended.', cred: { u: 'goodlogin', p: 'mfa_captcha', hint: 'captcha 9M4BP' }, seen: true, ambiguous: true },
  { status: 'session_expired', cls: 'credential', plain: 'The saved session expired',          action: 'Send the refresh order link. Also ask whether the job ended.', cred: { u: 'goodlogin.pll.expired', p: 'goodpassword' }, seen: false, ambiguous: true },
  { status: 'account_locked',  cls: 'provider',   plain: 'Their payroll account is locked',     action: 'They unlock it with their provider. If the deadline is close, take a document.', cred: null, seen: false },
  { status: 'unable_to_reset', cls: 'provider',   plain: 'The connection could not be rebuilt', action: 'Same as a locked account: they go through the provider, or you take a document.',              cred: null, seen: false },
  { status: 'no_data',         cls: 'nodata',     plain: 'Connected, but no records came back', action: 'Document or self-certify. Never record as $0 income.',  cred: { u: 'goodlogin', p: 'no_data' }, seen: false, danger: true },
  { status: 'not_supported',   cls: 'nodata',     plain: 'Refresh is not supported here',       action: 'Document or self-certify.',                            cred: null, seen: false, note: 'Cannot be produced in sandbox. See DS-3507.' },
  { status: 'unavailable',     cls: 'transient',  plain: 'The provider was down',               action: 'Retry later. Do not contact anyone.',                  cred: null, seen: false },
  { status: 'error',           cls: 'transient',  plain: 'The provider errored',                action: 'Retry later. Do not contact anyone.',                  cred: null, seen: false },
  { status: 'config_error',    cls: 'transient',  plain: 'A provider-side configuration problem', action: 'Retry later. Do not contact anyone.',                cred: { u: 'goodlogin.pll.config_error', p: 'goodpassword' }, seen: false },
];

export const NO_DATA_WARNING = 'no_data means the provider connected and returned nothing. That is not a verified $0. If you record it as zero earnings, the eligibility decision will be wrong and the audit trail will show the system recorded it.';

// ---------------------------------------------------------------------------
// Things the capture settled that people keep asking
// ---------------------------------------------------------------------------

export const ANSWERED = [
  { q: 'If a refresh order can never complete, am I stuck?', a: 'Not for long. Refreshing the original order again returned 200 and created a second refresh order, with the first still incomplete, as long as the first was no longer running. A refresh sent while another is still running is rejected.' },
  { q: 'Which order id do I keep on the case file?', a: 'The original. Its refresh_order field is overwritten each time and only points at the latest refresh, so store refresh ids yourself if you need a history.' },
  { q: 'Does a re-auth fix the connection for next time?', a: 'No. Kroger was re-authenticated successfully, then failed again with mfa_error on the next refresh minutes later. A re-auth clears the order in front of you and does not make later refreshes work.' },
  { q: 'Does the original order change when I refresh it?', a: 'Only its refresh_order pointer. Its data and report id stay the same, so reading them after a refresh gives you the values from before the refresh.' },
  { q: 'Is suborder.status a per-connection progress signal?', a: 'Not during collection. On the initial order all three sat at sent, including ones already done with data, until the whole order completed. last_task_status is the per-connection signal.' },
];

// What the capture did NOT cover. Stated so nobody reads the guide as broader than
// the evidence behind it.
export const SCOPE_LIMITS = [
  'This run was income only, on payroll connections. Bank and asset connections use financial_accounts[] instead of employers[]. A later bank run (REFRESH-FINDINGS.md section 16, 2026-10-21) saw a bank refresh succeed with no applicant action and another fail with an MFA challenge that a code-only re-authorization cleared, but timings and the per-connection shape were not captured. Do not assume the timings, the per-connection shape, or the re-auth path are the same without testing them.',
  'One product per refresh request. A mixed income and employment order was not tested.',
  'Assets refresh uses a 90-day transaction window unless request_extended_history is set to true. The full window is up to 2 years (Truv docs).',
];

export const OPEN_QUESTIONS = [
  'Does mounting the refresh order\'s bridge_token inline behave the same as opening its share_url? Only the hosted link was tested.',
  'Does share_url expire separately from the order, and does it still work if the applicant returns to it days later after a partial re-auth?',
  'Truv\'s docs say each refresh bills as a separate verification. Unconfirmed: does a refresh that fails on every connection still bill, and does the applicant re-auth that follows bill again?',
  'Is link_id stable across an Update Mode re-auth, or can re-auth create a new link?',
  'How often does not_supported happen on real payroll refreshes? It cannot be reproduced in sandbox (DS-3507).',
  'Webhook delivery guarantees were not tested: signing, retries, duplicate delivery and ordering. Check Truv\'s webhook documentation, and do not assume a failure notice arrives after you have saved your own record of the refresh.',
  'If the refresh request times out, was an order created? The cap of 3 per 24 hours makes a blind retry costly. Not tested.',
  'In the captured run a new report id appeared after each completed refresh, and POST /v1/users/{user_id}/reports/ returned the current state of every connection. Whether a refresh order\'s own report is the better one to read was not tested.',
];

// ---------------------------------------------------------------------------
// The programme view — same facts, no endpoints
// ---------------------------------------------------------------------------

export const PROGRAM_TABLE = [
  { outcome: 'Income came back current',              who: 'Nobody',                          does: 'Pass straight to eligibility',                  contact: 'None' },
  { outcome: 'Their saved sign-in stopped working',   who: 'The applicant',                   does: 'Send one link. They may need to sign in again.',   contact: '1 message' },
  { outcome: 'A security challenge needs answering',  who: 'The applicant',                   does: 'Send one link. They answer the challenge only.',  contact: '1 message' },
  { outcome: 'The job may have ended',                who: 'The applicant',                   does: 'Ask which it is. If the job ended, refresh again for the remaining employers only', contact: '1 message' },
  { outcome: 'Locked out at their payroll provider',  who: 'The applicant + their provider',  does: 'Document upload if the deadline is close',        contact: 'Varies' },
  { outcome: 'Connected, no records returned',        who: 'A caseworker',                    does: 'Document or self-certify. Never record as $0.',  contact: 'Varies' },
  { outcome: 'Provider outage',                       who: 'Nobody',                          does: 'Retry later',                                    contact: 'None' },
  { outcome: 'Saved sign-in too old to reuse',        who: 'The applicant',                   does: 'Full re-verification',                           contact: 'Full packet' },
];

export const PROGRAM_CALENDAR = {
  title: 'Renewal cycle against credential retention',
  source: 'Retention is 13 months for government tenants and about 6 by default, set per client in Truv\'s platform config. Confirm yours in writing before planning around it.',
  body: 'Saved payroll credentials are kept for 13 months on a government tenant and about 6 otherwise. With a 12-month renewal cycle, a renewal that slips more than a month finds the saved credential gone, and that household starts from scratch.',
  marks: [
    { at: 0,  label: 'Verified at application' },
    { at: 11, label: 'Suggested: start refreshing' },
    { at: 12, label: 'Renewal due' },
    { at: 13, label: 'Credentials deleted' },
  ],
  span: 14,
};

export const PROGRAM_RISKS = [
  { risk: '"No records found" treated as no income', impact: 'A wrong determination that can be appealed, with a system-generated record behind it.', do: 'Make it impossible to record. Reaching the payroll account and finding nothing is not proof of zero earnings.' },
  { risk: 'An applicant stuck on a screen they cannot finish', impact: 'They give up and lose coverage, or they call your center.',  do: 'Never add an employer they may have left to an order that requires every connection. If a job ended, refresh again scoped to the employers that remain.' },
  { risk: 'A partial refresh reported as complete', impact: 'Stale income drives eligibility and shows up as an audit finding.',        do: 'Require per-connection results before accepting a renewal.' },
  { risk: 'Every re-check is billed',      impact: 'How often you re-check drives cost.',       do: 'Price the cycle before choosing quarterly or annual. Truv\'s published pricing bills each re-check as its own verification. Whether a failed attempt is also billed is not confirmed, so get that in writing.' },
  { risk: 'Whether the original consent covers a silent re-pull', impact: 'Reusing a saved sign-in long after application, with nobody present, may go beyond what the applicant agreed to.', do: 'Ask your counsel before you schedule anything. This is a legal question.' },
  { risk: 'Document uploads cannot be refreshed',   impact: 'Anyone who uploads this year cannot be refreshed automatically next year.',       do: 'Track how much of the caseload leaves the automated path each cycle.' },
];

export const PROGRAM_SCRIPTS = [
  { title: 'Reconnect request', body: 'We checked your income with {employer} and need you to sign in again to finish. Tap this link. You may only need to confirm it is you.' },
  { title: 'Did the job end?', body: 'We could not reach your {employer} account. If you still work there, tap this link to reconnect. If you no longer work there, reply NO and we will update your case and verify your current job instead.' },
];

export const UNKNOWN_TO_PROGRAM = 'We do not have a production rate for how much of a caseload refreshes with no human involvement. The three-connection test on this page is a demonstration, not a sample. Ask for a pilot batch against your own population before you design the process.';

// ---------------------------------------------------------------------------
// Sidebar guide — one step per Build tab, in the order they appear
// ---------------------------------------------------------------------------

export const STEPS = [
  {
    title: 'Read the result',
    guide: `<p>A refresh is one call. Reading the result is harder, because <code>order-status-updated</code> is sent <strong>per connection</strong> and carries an <code>employer_id</code>.</p>
<p>In the captured run a <code>completed</code> event arrived 20 seconds in, for the one employer that worked, while two had already failed. Treating that as "the refresh succeeded" accepts stale income as verified.</p>
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
    guide: `<p>A refresh can drop an employer if you scope it to the ones that remain, but it cannot add one.</p>
<p>A new order for the same <code>external_user_id</code> resolves to the same user and shows every employer they already connected as connected, with <strong>no credential entry</strong>. Use it to add a new job.</p>
<p>Do <strong>not</strong> use <code>POST /v1/orders/{id}/employers/</code>. On a completed order it reset <code>completed_at</code> to <code>null</code>.</p>`,
  },
  {
    title: 'Get the applicant to re-authorize',
    guide: `<p>The failed suborder on a refresh order has <code>link_id: null</code> and <code>access_token: null</code>, so there is nothing on it to re-authenticate with.</p>
<p>Use the refresh order's own <code>share_url</code> (send it) or its <code>bridge_token</code> (mount it inline). Verified for an MFA challenge: it opens on the challenge with credentials already stored.</p>`,
  },
  {
    title: 'Every outcome',
    guide: `<p>Eleven final statuses in five classes. Only the credential statuses are fixed by sending the applicant a link.</p>
<p><code>no_data</code> means the provider connected and returned nothing. It is <strong>not</strong> a verified $0. Never write it to an income field.</p>`,
  },
  {
    title: 'Run it live',
    guide: `<p>Three employers, three credentials, three different refresh outcomes. In sandbox, Bridge pre-fills <code>goodlogin</code>/<code>goodpassword</code>. Overwrite both fields, or you will connect a healthy account and the scenario will not reproduce.</p>`,
  },
];
