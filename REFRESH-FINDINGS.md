# Refresh behaviour, observed

Everything below was run end to end against Truv sandbox on **2026-09-17** with a live
webhook tunnel. One income order, three employers, three different refresh fates. Every
claim here is from the captured run, not from docs.

Raw capture: `scratchpad/exp/run.json`.

## The setup

| Employer | Credential | Intended fate |
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

**Failures land in 3–5 seconds. The success took ~20s.** Anything that tries to watch a
live transition will miss the failures — they usually resolve before a screen mounts.

## 2. `order-status-updated` is per-suborder, not per-order

This is the big correction. The event carries an **`employer_id`** and describes *that
connection*, despite the name. Three `sent` events fired, one per employer, and a
`completed` fired for the single employer that succeeded — **while two others were
failing.**

So the widely repeated "a failed refresh emits no `order-status-updated` ever, the order
sits at Sent forever" is **half right**. What is true:

- the **failed connections** never get a `completed` event; `order-refresh-failed` is their
  only terminal signal
- the **order as a whole** never completes — `completed_at` stayed `null`
- but you *do* keep receiving `order-status-updated` for the connections that worked

A client subscribed only to `order-status-updated` does not see silence. It sees a
`completed` event and may well conclude the refresh worked. **That is worse than silence**,
and it is the real failure mode to design against.

## 3. `employer_id` is not stable across a refresh. `link_id` is.

| Employer | suborder id (original → refresh) | link_id |
|---|---|---|
| Home Depot | `e13c392c` → `1f99c219` | `c425123d` (same) |
| Kroger | `10a06a90` → `6cbebfad` | `71b10773` (same) |
| Walmart | `c24a34ae` → `a20c8885` | `f9d9b42b` (same) |

The refresh order is a **new order with new suborder ids**. Correlating a refresh outcome
back to the employer on your case file has to go through `link_id`, or company name — not
`employer_id`.

## 4. A failed suborder on the refresh order has no link and no token

```
Walmart     status=sent       last_task=null   link_id=null   access_token=null
Kroger      status=sent       last_task=null   link_id=null   access_token=null
Home Depot  status=completed  last_task=done   link_id=c425123d  access_token=present
```

Two consequences:

- `GET /v1/orders/{refresh_id}/` **cannot tell you why** a connection failed. There is no
  error field on a suborder, and the failed ones do not even carry a link to join on.
- You **cannot** start Bridge Update Mode from the refresh order's failed suborder — there
  is no `access_token` on it. The token lives on the **original** order's suborder.

`order-refresh-failed` gives you `employer_id` (of the *refresh* order) and a `status`, with
`link_id: null`. So the only complete correlation is:

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

**Use the tasks endpoint as the source of truth. Use the webhook as the trigger.**

## 5. Re-authentication: the refresh order's own `share_url` is the answer

Opening the refresh order's `share_url` shows all three employers with *"Previously
connected on Sep 17"*; the one that refreshed shows its tenure. Reconnecting Kroger through
it **skipped the sign-in form entirely** and went straight to the MFA challenge — the
applicant answered `9M4BP` and nothing else.

That produced `task done` → `order-status-updated: completed emp:6cbebfad`, and Kroger came
back with a `link_id` and fresh data on the refresh order.

So: **one link, sent to the applicant, re-authenticates everything that failed.** You do not
need to mint per-connection Update Mode tokens for this case. (`POST /v1/users/{id}/tokens/`
with the original suborder's `access_token` remains the option when you want to drive one
specific connection inline.)

## 6. You cannot finish an order that has an employer nobody will connect

After Kroger was fixed, the applicant's screen showed Home Depot ✓, Kroger ✓, Walmart
outstanding — and the only control was **Connect**. No skip, no "I don't work here",
and the "Submit connected accounts" button was gone. `completed_at` stayed `null`.

On this tenant every employer on the order is required, which matches what GDIT asked for
on CR2380. The consequence is the important part: **"I no longer work here" has no
resolution inside the existing order.** Your options are to consume the partial data as-is,
or to issue a new order for the employers they actually have.

## 7. Do not add employers to an existing order

`POST /v1/orders/{id}/employers/` returns 200 and creates a suborder. It should still be
avoided:

- Called on the **in-flight refresh order**, it adds one more thing that must be connected
  before the order can ever complete.
- Called on the **completed original order**, it set `completed_at` from
  `2026-09-17T11:24:34Z` back to **`null`**. A finished verification silently became
  unfinished. The employment data and `voie_report_id` survived, but anything keyed on
  completion is now wrong.

**New employment → new order.** That is the only clean path, and §10 shows it costs the
applicant nothing for the employers they already connected.

## 8. Reports

- The original order kept `voie_report_id: 991000d8…` throughout. A refresh never rewrites
  it.
- Each refresh-order completion minted a **new** report id (`613eef7f…`, then `46eb5789…`
  after the re-auth).
- A completed refresh order already carries its own report id, `voie_report_id` for income
  and `voa_report_id` for assets (re-checked 2026-10-21 on a sandbox assets refresh: the
  refresh order and the original order each had a different `voa_report_id`). Read the
  refresh order, then `GET` that report by id. Nothing needs to be created with `POST`.
  (Earlier runs used `POST /v1/users/{user_id}/reports/`, which also works but makes a
  report you did not need.)

## 9. Suborder `status` means different things in different places

On the **initial** order, every suborder sat at `sent` — including ones whose
`last_task_status` was already `done` with data attached — until the whole order completed,
at which point all three flipped to `completed`.

On the **refresh** order, `status` tracked each connection individually.

So `suborder.status` is not a per-connection progress signal during collection.
**`last_task_status` is.**

## 10. A refresh CAN drop an employer. It cannot add one.

Refreshed the original order (by now four connections: it had gained Instacart from the §7 test) scoped to two employer ids:

```
POST /v1/orders/4272acbd…/
{ "products": ["income"],
  "employers": [ {"id":"e13c392c…"},        <- Home Depot
                 {"id":"10a06a90…"} ] }     <- Kroger
```

The resulting refresh order contains **exactly two suborders**. Walmart and Instacart
are not on it at all — not pending, not skipped, absent.

That settles the question this whole exercise started with:

| Situation | Answer |
|---|---|
| "I no longer work there" | **Refresh, scoped to the employers that remain.** Drop the id. |
| "I have a new job" | **New order.** A refresh cannot introduce a connection the order never had. |

The scope ids come from the **original** order's `employers[]`. Omitting the array
refreshes everything.

This also means a partial failure is recoverable without any applicant contact at
all: if a connection fails and the person confirms the job ended, re-refresh scoped
to the survivors and you get a completable order.

## 10a. A new order reuses connections — partially verified, do not overstate

A second order for the same `external_user_id` resolved to the **same `user_id`**
(`61e8bd00…`), and opening it showed, for an employer connected on the previous order:

> **"Your Home Depot account is already connected. Your account was successfully
> connected today, no further action is needed."** — with zero sign-in fields.

**That is the whole of the evidence.** The run was not driven to completion: the new
order's suborders all remained `sent` with `link_id: null`, no employment records, no
report, and zero webhooks. So the following are *observed*: the same user is reused,
and an already-connected employer presents as connected with nothing to type. The
following are **not yet verified**: that such an order completes on its own, that it
mints a report, or that the carried-over connections yield data without the applicant
finishing the flow. Do not plan around the unverified half.

## 11. A stuck refresh order does not wedge the lineage

The refresh order from §6 was permanently incomplete (Walmart outstanding, `completed_at`
null). `POST /v1/orders/{original_id}/` against the original **still returned 200** and
created a second refresh order. So an abandoned refresh is untidy, not blocking.

## 12. `refresh_order` only ever points at the most recent refresh

After the second refresh, the original order's `refresh_order` field had been **overwritten**
from `391674aa…` to `5cd54c09…`. There is no list and no chain to walk. Over a multi-year
renewal cycle, **you must store the refresh order ids yourself** if you want history. The
original order id is the only durable anchor; keep it on the case file.

## 13. A re-auth fixes that order, not the connection's future

Kroger was successfully re-authenticated on the first refresh order and returned fresh data.
The **second** refresh, minutes later, failed it again with `mfa_error`. Re-authenticating
clears the challenge for the order in front of you; it does not make the link durably
refreshable. For a provider that challenges every time, every refresh needs the applicant.

## 14. `task-status-updated` carries the stable `link_id`. `order-refresh-failed` does not.

From the captured stream, first occurrence of each event type on the refresh:

| event | `link_id` | `task_id` | `employer_id` |
|---|---|---|---|
| `order-created` | – | – | – |
| `order-status-updated` | – | – | present |
| **`task-status-updated`** | **present** | **present** | – |
| **`link-disconnected`** | **present** | – | – |
| `order-refresh-failed` | **null** | – | present |

So the stable join key arrives on a webhook after all — just not on the one named
after the failure. `task-status-updated` carries `link_id` *and* the terminal status,
in the same second as `order-refresh-failed`.

That makes the tasks poll an option rather than a requirement: you can drive the whole
thing off `task-status-updated`, using `order-refresh-failed` only to know a refresh
(rather than an initial connect) is what failed. Poll `GET /v1/tasks/` when you have no
inbound webhook path, or when you want `error_message`.

## 15. Sandbox returned identical data before and after the refresh

Home Depot's latest pay date and income were the same before and after
(`2026-09-14`, `56269.25`), and Kroger's were unchanged across its re-auth. These are
fixed sandbox fixtures — the refresh demonstrably ran and produced a new report id, but
nothing here demonstrates the *values* moving. `goodlogin.refresh.stale` is the
credential intended to show a difference; it was not the one used on Home Depot in this
run. Do not use this capture to answer "did the number actually change".

---

## What this means for the integration

1. Subscribe to **`order-refresh-failed`** as the trigger, and **do not** treat
   `order-status-updated: completed` as "the refresh worked" — it is per connection.
2. Read the per-connection result from **`task-status-updated`**, which carries the
   stable `link_id` and the terminal status (§14). Poll `GET /v1/tasks/?user_id=` when
   you have no inbound webhook path, or when you want `error_message`.
3. Join back to your case file on **`link_id`**, never `employer_id`.
4. Branch on `task.status`:
   - `done` → take the data
   - `login_error` / `mfa_error` / `session_expired` → send the refresh order's `share_url`
   - `no_data` / `not_supported` / provider errors → do not involve the applicant
5. For a job that ended: **refresh scoped** to the employers that remain (§10). For a
   new job: **a new order**. Either way, never `POST /orders/{id}/employers/`.
6. Read refreshed data from a freshly generated report, not from the original order.

---

## 16. Observed 2026-10-21 (QA pass against sandbox)

Separate runs from the 2026-09-17 capture above. Income and assets, one order at a time.

- **Cap.** On one order, three refreshes succeeded and the fourth returned `429` with code
  `throttled`: "Order refresh limit exceeded Expected available in 86315 seconds."
- **Refresh already running.** A refresh sent while another was still running on the same
  order returned `400` `{"error":{"code":"invalid","message":"Refresh already in progress"}}`.
  Another sent about 30 seconds later, after the first had stopped running, returned `200`
  even though that order was still incomplete (consistent with §11).
- **Too early.** A refresh sent immediately after Bridge finished returned `400`
  "Can not find any employers connected to refresh the data" (payroll) and the equivalent
  for `financial_accounts` (bank). The same call succeeded within about 5 to 10 seconds.
- **Bank.** `Truv Bank (non-oAuth)` with `goodlogin` / `mfa`: the refresh failed with
  `mfa_error`. Re-opening the refresh order's link went straight to a code prompt
  ("a text message to phone number ending in ..."), with no username or password field.
  After the code was entered the refresh completed and an assets report loaded.
- **Payroll captcha.** `goodlogin` / `mfa_captcha` on Home Depot: the re-authorization step
  asked for the captcha (`9M4BP`) again.
- **Bridge.** Walmart asks the applicant to select a store location, then enter a Store/Club Number (`1234` was accepted), before its login screen.
- **Bridge pre-fill.** For a payroll employer Bridge pre-fills the sandbox login
  `goodlogin` / `goodpassword`. For `Truv Bank (non-oAuth)` it pre-fills the same password,
  which must be replaced with `mfa` to get the MFA failure. With `goodpassword` left in place the
  bank refresh completed with no applicant action (a bank silent success).
- **MFA code.** Any code was accepted at the bank code prompt (`123456` was used).

---

## 17. Observed 2026-10-21 by two outside-engineer proofs of concept, and a standalone script

Two engineers new to Truv built working proofs of concept from the guide, the demo and the public repo, and a
minimal standalone script (`examples/refresh-minimal.mjs`) was run against real sandbox orders. What they saw,
checked against Truv's published documentation where it covers the point.

- **The refresh limit is per connection.** Truv's docs count it per `access_token`: 1 initial request plus 3
  refreshes in any 24 hours. In one proof of concept, after the 4th Home Depot refresh returned 429, a refresh
  scoped to Kroger alone on the same order was accepted. Earlier text on this page said "per order".
- **The order reads completed 15 to 20 seconds before it can be refreshed.** Both proofs of concept were
  rejected with 400 until about 15 to 17 seconds after "Submit connected accounts", then accepted.
- **A connection whose earlier refresh failed with an MFA challenge can be skipped silently.** Reproduced twice.
  In the payroll proof of concept, a second refresh refreshed Home Depot and produced no task and no
  `order-refresh-failed` for Kroger for over 95 seconds, until the applicant re-authorized. In a bank run
  with the standalone script, the refresh order's connection stayed at `sent` with `link_id: null` and no task
  was created for over two minutes. Truv's docs say the order endpoint rejects a refresh while one is already
  running on a connection; here it was accepted and nothing ran.
- **A failed task can lose its `order_id`.** In one run the failed task's `order_id` became null after the
  applicant re-authorized through that refresh order's link. In another it stayed. Match tasks on `link_id` and
  keep your own snapshot.
- **Bridge keeps a "Thank you" screen on top of the page until `bridge.close()` is called.**
- **Suborder `status` can still read `sent` while `completed_at` is set**, for about the same 15 to 20 seconds.
- **Re-authorization does not stick.** The next refresh failed with `mfa_error` again 20 to 30 seconds after a
  successful re-authorization (confirms section 13).
- **`provider.name` can differ from the employer you asked for** (it read "Workday" and "Oracle HCM" for Home
  Depot and Kroger). The requested name is in `company_name`.

