# Refresh behavior, observed

Everything below was run end to end against Truv sandbox on 2026-09-17 with a live
webhook tunnel. One income order, three employers, three different refresh results. Every
claim here comes from the captured run, not from docs.

Raw capture: `scratchpad/exp/run.json`.

## The setup

| Employer | Credential | Expected result |
|---|---|---|
| Home Depot | `goodlogin` / `goodpassword` | refresh succeeds |
| Kroger | `goodlogin` / `mfa_captcha` (captcha `9M4BP`) | refresh needs a challenge |
| Walmart | `goodlogin.pll.reauth` / `goodpassword` | refresh fails on credentials |

All three connected; order completed at `11:24:34Z`. Then one call:
`POST /v1/orders/{id}/` with `{"products":["income"]}`.

---

## 1. What actually came over the wire

```
11:25:09  order-created         pending                      (refresh order)
11:25:09  order-status-updated  sent          emp:6cbebfad   Kroger
11:25:09  order-status-updated  sent          emp:a20c8885   Walmart
11:25:09  order-status-updated  sent          emp:1f99c219   Home Depot
11:25:12  task-status-updated   login
11:25:12  task-status-updated   parse
11:25:12  task-status-updated   login_error
11:25:12  link-disconnected
11:25:12  order-refresh-failed  login_error   emp:a20c8885   Walmart
11:25:13  task-status-updated   full_parse
11:25:14  task-status-updated   mfa_error
11:25:14  link-disconnected
11:25:14  order-refresh-failed  mfa_error     emp:6cbebfad   Kroger
11:25:17  task-status-updated   done
11:25:29  order-status-updated  completed     emp:1f99c219   Home Depot
```

The failures came back in 3-5 seconds. The success took about 20 seconds. A screen that
tries to watch the transition live will miss the failures, because they usually finish
before the screen has loaded.

## 2. `order-status-updated` is sent per suborder, not per order

The event carries an `employer_id` and describes that one connection, despite its name.
Three `sent` events fired, one per employer, and a `completed` fired for the one employer
that succeeded while the other two were failing.

You may have heard that a failed refresh never sends `order-status-updated` and the order
stays at Sent. That is only partly true:

- A failed connection never gets a `completed` event. `order-refresh-failed` is the only
  final event it gets.
- The order as a whole never completes. `completed_at` stayed `null`.
- You do keep getting `order-status-updated` for the connections that worked.

A client that listens only for `order-status-updated` does not see silence. It sees a
`completed` event and can conclude the refresh worked when part of it failed.

## 3. `employer_id` changes on a refresh. `link_id` does not.

| Employer | suborder id (original → refresh) | link_id |
|---|---|---|
| Home Depot | `e13c392c` → `1f99c219` | `c425123d` (same) |
| Kroger | `10a06a90` → `6cbebfad` | `71b10773` (same) |
| Walmart | `c24a34ae` → `a20c8885` | `f9d9b42b` (same) |

A refresh order is a new order with new suborder ids. To match a refresh result to the
employer on your case file, use `link_id` or the company name, not `employer_id`.

## 4. A failed suborder on the refresh order has no link and no token

```
Walmart     status=sent       last_task=null   link_id=null   access_token=null
Kroger      status=sent       last_task=null   link_id=null   access_token=null
Home Depot  status=completed  last_task=done   link_id=c425123d  access_token=present
```

Two things follow:

- `GET /v1/orders/{refresh_id}/` cannot tell you why a connection failed. A suborder has no
  error field, and the failed ones do not carry a link to match on either.
- You cannot start Bridge Update Mode from the refresh order's failed suborder, because
  there is no `access_token` on it. The token is on the original order's suborder.

`order-refresh-failed` gives you `employer_id` (from the refresh order) and a `status`,
with `link_id: null`. The only way to get the full picture is:

```
GET /v1/tasks/?user_id=...
  → task.order_id == refresh order id
  → task.link_id  == the link on your ORIGINAL order's suborder
  → task.status + task.error_message = the reason
```

Captured tasks:

```
25ee65f6  login_error  link f9d9b42b  "Username or password is incorrect"
159f3ecd  mfa_error    link 71b10773  "unanswered question: Session has expired..."
93a70919  done         link c425123d
```

Treat the tasks endpoint as the source of truth and the webhook as the trigger to go look.

## 5. Re-authentication: send the refresh order's own `share_url`

Opening the refresh order's `share_url` shows all three employers with "Previously
connected on Sep 17"; the one that refreshed shows its tenure. Reconnecting Kroger through
it skipped the sign-in form entirely and went straight to the MFA challenge. The
applicant answered `9M4BP` and nothing else.

That produced `task done` → `order-status-updated: completed emp:6cbebfad`, and Kroger came
back with a `link_id` and fresh data on the refresh order.

So one link, sent to the applicant, covers every connection that failed. You do not need to
create per-connection Update Mode tokens for this case. (`POST /v1/users/{id}/tokens/`
with the original suborder's `access_token` is still the option when you want to drive one
specific connection inline.)

## 6. An order with an employer nobody will connect cannot finish

After Kroger was fixed, the applicant's screen showed Home Depot ✓, Kroger ✓, Walmart
outstanding, and the only control was Connect. There was no skip, no "I don't work here",
and the "Submit connected accounts" button was gone. `completed_at` stayed `null`.

On this tenant every employer on the order is required, which matches what GDIT asked for
on CR2380. That means "I no longer work here" has no resolution inside the existing order.
Your options are to use the partial data as it is, or to create a new order for the
employers they actually have.

## 7. Do not add employers to an existing order

`POST /v1/orders/{id}/employers/` returns 200 and creates a suborder, but it should still
be avoided:

- On the in-flight refresh order, it adds one more employer that must be connected before
  the order can complete.
- On the completed original order, it set `completed_at` from `2026-09-17T11:24:34Z` back
  to `null`. A finished verification went back to unfinished. The employment data and
  `voie_report_id` were still there, but anything that depends on completion is now wrong.

New employment means a new order. Section 10a covers what an already-connected employer
looks like on that new order (only partly verified).

## 8. Reports

- The original order kept `voie_report_id: 991000d8…` throughout. A refresh never rewrites
  it.
- Each refresh order that completed produced a new report id (`613eef7f…`, then `46eb5789…`
  after the re-authentication).
- A completed refresh order already has its own report id: `voie_report_id` for income
  and `voa_report_id` for assets (re-checked 2026-10-21 on a sandbox assets refresh: the
  refresh order and the original order each had a different `voa_report_id`). Read the
  refresh order, then `GET` that report by id. Nothing needs to be created with `POST`.
  (Earlier runs used `POST /v1/users/{user_id}/reports/`, which also works but creates a
  report you did not need.)

## 9. Suborder `status` means different things in different places

On the initial order, every suborder sat at `sent` until the whole order completed, even
ones whose `last_task_status` was already `done` with data attached. At that point all
three flipped to `completed`.

On the refresh order, `status` tracked each connection on its own.

So `suborder.status` does not show per-connection progress while the applicant is still
connecting. `last_task_status` does.

## 10. A refresh can drop an employer. It cannot add one.

I refreshed the original order (by now four connections: it had gained Instacart from the
section 7 test), scoped to two employer ids:

```
POST /v1/orders/4272acbd…/
{ "products": ["income"],
  "employers": [ {"id":"e13c392c…"},        <- Home Depot
                 {"id":"10a06a90…"} ] }     <- Kroger
```

The resulting refresh order has exactly two suborders. Walmart and Instacart are not on
it at all, not pending and not skipped.

That answers the question this experiment started with:

| Situation | Answer |
|---|---|
| "I no longer work there" | Refresh, scoped to the employers that remain. Leave out the id. |
| "I have a new job" | New order. A refresh cannot add a connection the order never had. |

The scope ids come from the original order's `employers[]`. If you leave the array out,
everything is refreshed.

It also means a partial failure can be fixed with no applicant contact at all. If a
connection fails and the person confirms the job ended, refresh again scoped to the
employers that remain and you get an order that can complete.

## 10a. A new order reuses connections, but this is only partly verified

A second order for the same `external_user_id` resolved to the same `user_id`
(`61e8bd00…`), and opening it showed, for an employer connected on the previous order:

> "Your Home Depot account is already connected. Your account was successfully
> connected today, no further action is needed." - with zero sign-in fields.

That is all the evidence there is. The run was not taken to completion: the new
order's suborders all stayed at `sent` with `link_id: null`, with no employment records, no
report, and zero webhooks. What we saw is that the same user is reused and an
already-connected employer shows as connected with nothing to type. What we did not
verify is that such an order completes on its own, that it produces a report, or that the
carried-over connections return data without the applicant finishing the flow. Do not
rely on those parts.

## 11. A stuck refresh order does not block later refreshes

The refresh order from section 6 stayed incomplete (Walmart outstanding, `completed_at`
null). `POST /v1/orders/{original_id}/` against the original order still returned 200 and
created a second refresh order. So an abandoned refresh leaves clutter but does not block
anything.

## 12. `refresh_order` only points at the most recent refresh

After the second refresh, the original order's `refresh_order` field had been overwritten
from `391674aa…` to `5cd54c09…`. There is no list and no chain to follow. Over a multi-year
renewal cycle, store the refresh order ids yourself if you want the history. The
original order id is the only one that stays fixed, so keep it on the case file.

## 13. Re-authenticating fixes that order, not later refreshes

Kroger was re-authenticated on the first refresh order and returned fresh data.
The second refresh, minutes later, failed it again with `mfa_error`. Re-authenticating
clears the challenge for the order in front of you. It does not make the connection
refreshable on its own from then on. For a provider that challenges every time, every
refresh needs the applicant.

## 14. `task-status-updated` carries `link_id`. `order-refresh-failed` does not.

From the captured stream, the first occurrence of each event type on the refresh:

| event | `link_id` | `task_id` | `employer_id` |
|---|---|---|---|
| `order-created` | - | - | - |
| `order-status-updated` | - | - | present |
| `task-status-updated` | present | present | - |
| `link-disconnected` | present | - | - |
| `order-refresh-failed` | null | - | present |

So the key you need to match on does arrive on a webhook, just not the one named for the
failure. `task-status-updated` carries `link_id` and the final status, in the same
second as `order-refresh-failed`.

That makes polling the tasks endpoint optional: you can run the whole flow from
`task-status-updated`, and use `order-refresh-failed` only to know that a refresh
(rather than an initial connect) is what failed. Poll `GET /v1/tasks/` when you have no
inbound webhook path, or when you want `error_message`.

## 15. Sandbox returned identical data before and after the refresh

Home Depot's latest pay date and income were the same before and after
(`2026-09-14`, `56269.25`), and Kroger's were unchanged across its re-authentication. These
are fixed sandbox values. The refresh ran and produced a new report id, but
nothing here shows the values changing. `goodlogin.refresh.stale` is the
credential meant to show a difference; it was not the one used on Home Depot in this
run. Do not use this capture to answer "did the number actually change".

---

## What this means for the integration

1. Subscribe to `order-refresh-failed` as the trigger. Do not treat
   `order-status-updated: completed` as "the refresh worked", because it is per connection.
2. Read the per-connection result from `task-status-updated`, which carries
   `link_id` and the final status (section 14). Poll `GET /v1/tasks/?user_id=` when
   you have no inbound webhook path, or when you want `error_message`.
3. Match back to your case file on `link_id`, never `employer_id`.
4. Branch on `task.status`:
   - `done` → take the data
   - `login_error` / `mfa_error` / `session_expired` → send the refresh order's `share_url`
   - `no_data` / `not_supported` / provider errors → do not involve the applicant
5. For a job that ended, refresh scoped to the employers that remain (section 10). For a
   new job, create a new order. Either way, never `POST /orders/{id}/employers/`.
6. Read refreshed data from the refresh order's own report, not the original order's.

---

## 16. Observed 2026-10-21 (QA pass against sandbox)

Separate runs from the 2026-09-17 capture above. Income and assets, one order at a time.

- Cap. On one order, three refreshes succeeded and the fourth returned `429` with code
  `throttled`: "Order refresh limit exceeded Expected available in 86315 seconds."
- Refresh already running. A refresh sent while another was still running on the same
  order returned `400` `{"error":{"code":"invalid","message":"Refresh already in progress"}}`.
  Another sent about 30 seconds later, after the first had stopped running, returned `200`
  even though that order was still incomplete (consistent with section 11).
- Too early. A refresh sent immediately after Bridge finished returned `400`
  "Can not find any employers connected to refresh the data" (payroll) and the equivalent
  for `financial_accounts` (bank). The same call succeeded within about 5 to 10 seconds.
- Bank. `Truv Bank (non-oAuth)` with `goodlogin` / `mfa`: the refresh failed with
  `mfa_error`. Re-opening the refresh order's link went straight to a code prompt
  ("a text message to phone number ending in ..."), with no username or password field.
  After the code was entered the refresh completed and an assets report loaded.
- Payroll captcha. `goodlogin` / `mfa_captcha` on Home Depot: the re-authorization step
  asked for the captcha (`9M4BP`) again.
- Bridge. Walmart asks the applicant to select a store location, then enter a Store/Club Number (`1234` was accepted), before its login screen.
- Bridge pre-fill. For a payroll employer Bridge pre-fills the sandbox login
  `goodlogin` / `goodpassword`. For `Truv Bank (non-oAuth)` it pre-fills the same password,
  which must be replaced with `mfa` to get the MFA failure. With `goodpassword` left in place the
  bank refresh completed with no applicant action (a bank refresh that worked on its own).
- MFA code. Any code was accepted at the bank code prompt (`123456` was used).

---

## 17. Observed 2026-10-21 by two outside-engineer proofs of concept, and a standalone script

Two engineers new to Truv built working proofs of concept from the demo and the public repo, and a
minimal standalone script (`examples/refresh-minimal.mjs`) was run against real sandbox orders. What they saw,
checked against Truv's published documentation where it covers the point.

- The refresh limit is per connection. Truv's docs count it per `access_token`: 1 initial request plus 3
  refreshes in any 24 hours. In one proof of concept, after the 4th Home Depot refresh returned 429, a refresh
  scoped to Kroger alone on the same order was accepted. Earlier text on this page said "per order".
- The order reads completed 15 to 20 seconds before it can be refreshed. Both proofs of concept were
  rejected with 400 until about 15 to 17 seconds after "Submit connected accounts", then accepted.
- A connection whose earlier refresh failed with an MFA challenge can be skipped with no error. Reproduced twice.
  In the payroll proof of concept, a second refresh refreshed Home Depot and produced no task and no
  `order-refresh-failed` for Kroger for over 95 seconds, until the applicant re-authorized. In a bank run
  with the standalone script, the refresh order's connection stayed at `sent` with `link_id: null` and no task
  was created for over two minutes. Truv's docs say the order endpoint rejects a refresh while one is already
  running on a connection; here it was accepted and nothing ran.
- A failed task can lose its `order_id`. In one run the failed task's `order_id` became null after the
  applicant re-authorized through that refresh order's link. In another it stayed. Match tasks on `link_id` and
  keep your own snapshot.
- Bridge keeps a "Thank you" screen on top of the page until `bridge.close()` is called.
- Suborder `status` can still read `sent` while `completed_at` is set, for about the same 15 to 20 seconds.
- Re-authorization does not carry over to the next refresh. The next refresh failed with `mfa_error` again 20 to 30 seconds after a
  successful re-authorization (confirms section 13).
- `provider.name` can differ from the employer you asked for (it read "Workday" and "Oracle HCM" for Home
  Depot and Kroger). The requested name is in `company_name`.


## 18. Orders with more than one connection, observed 2026-10-21 in sandbox

Four applicants were connected through Bridge and refreshed in one run: one payroll, one bank, one order with
both, and one order with two deeplinked employers (Home Depot and Walmart).

- A combined income and assets order refreshes with one call. `POST /v1/orders/{id}/` with
  `{"products": ["income", "assets"]}` refreshed the payroll and the bank connection together. They finished
  independently: with `goodpassword` on payroll and `mfa` on the bank, payroll finished on its own and the bank
  connection failed with `mfa_error`.
- The refresh order has one report id per product. Both `voie_report_id` and `voa_report_id` were
  readable from the one refresh order, and both reports loaded.
- Two employers on one order refresh independently. Home Depot finished and Walmart (`mfa_captcha`) failed
  and needed the applicant to answer the captcha again. Walmart honors the same test logins, but asks for a store
  location first ("Homeoffice" works).
- Which employer Bridge offers first is not fixed. Walmart came first in some runs and Home Depot in others.
  Anything driving Bridge has to read the screen instead of assuming an order.
- An oAuth bank accepts the same test login. `goodlogin` / `mfa` in the bank's sign-in popup (Chase Bank) went
  to the same texted-code challenge as the non-oAuth test bank, and its refresh then failed with `mfa_error`.
  Picking Truv Bank is not required.
- Bridge adds a review step when an order has more than one connection. The last button reads "Review
  connected accounts", then "Verify and submit", instead of "Submit connected accounts".
- These orders need a result per connection. Reading one result for the whole refresh order reports the
  first failure it sees, which is wrong while another connection is still running. The demo resolves each
  connection (`classifyRefreshOutcomePerSuborder`) and shows nothing for the applicant until all have an answer.
- Test-script pitfall: the re-authorization screen lists "Chase Bank - Previously connected on ...". A
  selector that matches the text "Connect" matches that row first and the real Connect button is never clicked.
