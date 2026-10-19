# Batching - batch order intake demo

Route: `#public-sector/batching` · Component: [`src/demos/Batching.jsx`](../src/demos/Batching.jsx)

An animated sales walkthrough of **batch order intake**: an export of applicants
lands in a folder on the customer's own server, and a scheduled job creates one
Truv order per row. The last stage is the download area for the guides and the
runnable tool, so the demo doubles as the customer handoff.

It makes **no API calls** and needs no session - every stage is an animated mock.
It is a talk-track, not a live integration. That is why it is flagged
`noSession` in the registry and rendered ahead of the Configure gate, so a shared
hosted link works without bundling credentials into the build.

---

## Where batch sits

**Batch is the fallback, not the goal.** Embedded orders come first, then
creating the order at submit-time from the customer's own handler, then batch -
for agencies with no development capacity, or whose applicant data lives in a
system they do not control. Stage 01 states this explicitly so nobody leaves the
walkthrough thinking batch is the recommendation.

Reach for this demo when a customer says:

- "We process thousands of cases a week - staff can't create orders one at a time."
- "We don't have developers to build an integration."
- "Security won't allow an inbound connection or a VPN into our network."
- "Our case system already exports to CSV."

---

## The six stages

| # | Stage | What the animation shows |
|---|-------|--------------------------|
| 01 | Where this fits | The backlog, and the framing: embedding comes first, batch is the fallback. |
| 02 | The export | The case system writes the export into a folder on the customer's own server. Manual drop is the fallback. |
| 03 | Checked, then sent | The tool validates locally, then sends the file in one batch request. **Toggle on the right**: all-valid becomes five orders, one bad row becomes four plus a fix file. |
| 04 | No accidental repeats | The same export re-sent bounces off the ledger. Households and deliberate repeats still go through. |
| 05 | Results | The recommended path - `order-finalized` webhook, verify signature, fetch JSON and PDF. Dashboard-only is the fallback; the batch summary email is noted here too. |
| 06 | Set it up | The download area: guides, the kit, and the blank CSV. |

Stage 03 is the one worth dwelling on in a live pitch. The toggle turns
whole-file rejection into a concrete consequence - five orders versus zero - and
it is the behavior customers have not thought about.

It was eight stages; reviewers found that long. The dedicated "where this fits"
ladder and the separate notifications stage were folded into 01 and 05.

---

## How it is built

`batching.css` is **self-contained**: it carries both the walkthrough shell
(chrome, ambient background, typography, nav) and the animated surfaces, all
scoped under `.bt`. The demo therefore has no dependency on any other demo's
stylesheet and can be deployed on its own branch.

Most animations are one-shot CSS sequenced with `animation-delay` off a `--i`
custom property. They replay because the surface is remounted on a key that
includes the stage index *and* the validation mode:

```jsx
<div class={`wt-stage-inner kind-${s.kind}`} key={`${i}${s.kind === 'checksend' ? `-${vmode}` : ''}`}>
```

Without the mode in that key, flipping the stage-03 toggle showed an
already-finished state and looked broken.

Stage 03 is the only stage with JS timing, because sending has to be *gated on
validation passing*. Every beat is scheduled as a flat `setTimeout` up front -
no nested timers, no interval closures - so the sequence cannot half-run and
cleanup is total. An earlier nested-interval version stalled after one row.

Two things to know when reviewing:

- **Screenshots taken within ~2s of a stage change look empty.** Elements start
  at `opacity: 0`. Wait for the animation to settle before capturing. Note also
  that `getComputedStyle(...).opacity` races these animations and has given false
  readings - trust a screenshot over an opacity probe.
- `prefers-reduced-motion: reduce` collapses every duration and delay so the
  **end state** is shown immediately, rather than hiding content.

---

## Files

| Path | What it is |
|------|------------|
| `src/demos/Batching.jsx` | The walkthrough component and its six stages. |
| `src/demos/batching.css` | Self-contained shell + animation CSS, scoped under `.bt`. |
| `examples/batch-intake/` | **Source of truth** for the customer kit. |
| `examples/batch-intake/build-zip.sh` | Regenerates the download from that source. |
| `public/batching/*.pdf` | The guides the demo links to. |
| `public/batching/Truv_Intake_Kit.zip` | Build artifact - see below. |
| `public/batching/orders_template.csv` | Blank CSV with the correct headers. |

### Changing the kit

`public/batching/Truv_Intake_Kit.zip` is generated, not authored. Edit the
source in `examples/batch-intake/`, then:

```bash
./examples/batch-intake/build-zip.sh
```

Skip that and the demo hands customers a stale copy. The script refuses to
build if a real `config.ini`, an internal document, or anything resembling a
live API secret is staged, or if any code excerpt shown on the demo page is no
longer a line of the file it claims to come from. It also writes `LICENSE` and
`VERSION` into the kit and `Truv_Intake_Kit.zip.sha256` next to it.

The two guide PDFs and their page-1 preview PNGs are rendered from HTML sources
kept outside this repo. Re-render all four after editing a guide, and update the
page counts on the demo's file cards.

---

## The kit

[`examples/batch-intake/`](../examples/batch-intake/) is a single-file Python
tool, standard library only, Python 3.8+. Setup is three commands:

```bash
python3 truv_intake.py setup      # interactive; tests the keys before saving
python3 truv_intake.py doctor     # PASS/FAIL on every prerequisite
python3 truv_intake.py selftest   # creates one real order, reads it back
```

Then it runs on cron or Task Scheduler. It also has `validate`, `send`,
`direct`, `webhook list|add|history`, and `fetch`.

Behaviors that matter when you are explaining it:

- **One bad row does not block the rest** - row-level problems skip that row and
  come back as a `.failed-rows.csv` in `failed/`. Only file-level problems (wrong
  columns, unreadable, over 3,000 rows) reject the whole file.
- **A permanent ledger** (`state/ledger.csv`) keyed on the **person within the
  case**, not the case number alone.
- **A summary email every batch**, including "nothing to do" - so silence is the
  alarm. This is the entire monitoring story for a customer with no ops team.
- **A sandbox-first gate** - it refuses to run against production until a
  sandbox selftest has passed on that installation.

> **The mistake that costs the most.** There is one Truv API host,
> `https://prod.truv.com`. Sandbox versus production is decided by **which key
> pair you send**, not by a different URL. A customer who assumes the URL tells
> them which environment they are in will email real applicants. Say it out loud
> in the handover call.

---

## Gotchas carried into the kit

- **A case number is not a person.** Benefits cases cover households, so several
  rows legitimately share one `case_number`. The local dedup key is case *plus
  name*, and `order_number` sent to Truv is also case plus name - the **batch
  endpoint deduplicates on `order_number`**, so a bare case number would create one
  order for the first person and silently attach the rest to it. Proven against
  sandbox. The single-order endpoint does not dedupe.
- **Legitimate repeats exist** - redeterminations, retries, expired orders. The
  optional `force_new` column bypasses the dedup check for that row.
- **The limit is 3,000 orders per HOUR**, not requests per minute, and one request
  may carry all 3,000 (confirmed with Truv engineering). `max_orders_per_run`
  defaults to 3,000 to match. The tool does not yet track the hourly budget across
  several files in one hour - see Open items.
- **Excel on Windows writes cp1252**, not UTF-8, from its default "CSV" export.
  The reader falls back to cp1252 so accented names do not reject the file.
- `manager` is a **nested object**. There is no flat `order_manager_email` -
  sending one silently drops order ownership.
- Phone must be **10 digits, no country code**. `cc_emails` caps at **15**.
- Sending `email` or `phone` means Truv **will** contact that person. Leave them
  out of demos and pilots.
- An Order has **no top-level status field**. Completion is `completed_at` /
  `canceled_at` / `is_expired`, or aggregated per-employer suborder statuses.
- `order-status-updated` fires **per suborder**, once per employer or financial
  account - never use it as a completion signal. Use `order-finalized`.
- `voie_report_id` only auto-populates when an account-level setting is enabled.
  Do not promise it by default.
- **The assets report is not a per-connection artifact.** `pdf_report` lives on
  each suborder; the assets (VOA) report is one consolidated report per order,
  referenced by top-level `voa_report_id` and fetched from
  `/v1/users/{user_id}/assets/reports/{report_id}/` - not `/v1/users/{user_id}/reports/`,
  which is the income report endpoint. A results process that only walks
  `employers[]` / `financial_accounts[]` silently never collects it. A customer
  (`<CUSTOMER_NAME>`) hit exactly this in production. `fetch --pdf` and the example receiver now collect it.
- `task-status-updated` = `done` is one connection finishing, not data readiness.
  Collect results on `order-finalized` only.

### Found by using the shipped kit cold

These came out of downloading the published zip and following only the customer
docs. None were visible by reading the source.

- **`.bat` files must ship CRLF.** `cmd.exe` parses batch files by byte offset
  and misparses LF-only ones, most reliably inside multi-line `( )` blocks -
  and it varies by Windows version, so it fails on one machine and not another.
  The mac `.command` is the opposite: a single CR breaks its shebang.
  `build-zip.sh` asserts both directions and refuses to build otherwise.
  Windows-facing text files staff open in Notepad (`config.ini.example`,
  `orders_template.csv`) are CRLF for the same reason.
- **Real exports do not match your column names.** Case, spaces and hyphens all
  vary (`First_Name`, `LAST NAME`). Matching case-sensitively rejected whole
  files over capitalization. Headers are normalized now.
- **Excel writes semicolon-separated `.csv`** on any locale that uses a comma
  for decimals. The old code reported "missing required column first_name",
  which pointed at the wrong problem entirely. The separator is sniffed from the
  header line and the run log states which one was used.
- **Rows where every cell is empty are not errors.** Excel leaves them behind
  whenever someone clears a row instead of deleting it. Reporting them produced
  a `failed-rows.csv` on nearly every real export. They are dropped silently.
- **Duplicate column names silently send the wrong value.** `csv` keeps only the
  last, so `Ana Reyes` went out as `Ana Smith`. The file is refused, because
  there is no safe way to guess which column was meant.
- **`email` is write-only.** Truv validates it on create - a malformed value
  returns a field-level 400 - but `GET /v1/orders/{id}/` does not echo it back.
  A fetched order showing no email is not a dropped field.

## Behavior worth knowing (v2.2)

- **`force_new` adds `-R<timestamp>` to the order reference.** The batch endpoint
  answers `existing` for a reference it already holds and creates nothing, so a
  deliberate repeat needs a new reference. Verified in sandbox: a force_new row got
  a new order with reference `<CASE>-<First>-<Last>-R<yyyymmddhhmmss>`.
- **`existing` is reported as skipped, never created**, in results.csv, the summary
  and the per-staff email.
- **Rows without a case number** are keyed on name + email + phone, not file and row
  position, so renaming or re-sorting a file cannot duplicate them. Truv's own
  dedupe needs an order reference, which needs a case number.
- **Exit codes:** 0 ok or already done, 2 a row failed or a file was rejected, 1 could
  not run.
- **Files holding applicant data** (ledger, results, fix files, moved copies, logs)
  are chmod 600 on Mac/Linux; fix files carry only known columns; optional
  `retention_days` purges old copies and logs (never the ledger).
- **Email is off by default** and verifies the SMTP server certificate when on.
- **Header aliases** (Given Name, Surname, Case ID, Email Address...) plus a
  `[columns]` mapping in config.ini. UTF-16 is read; workbooks are refused with a
  re-save message and moved to failed/.

## Open items

Known gaps, in the order they are likely to bite.

- **No hourly budget tracking - by decision.** The account limit is 3,000 orders per
  hour (confirmed with Truv engineering). A second large file inside one hour gets a 429. The
  tool stops at once - it no longer sleeps through a long `Retry-After` - moves the
  file to `failed/`, creates nothing twice, and prints "wait for the hour to roll
  over". A local budget tracker was rejected: it can only see orders this tool
  created, not orders from the dashboard or another integration on the same
  account, so it would report budget that does not exist.
- **Windows has been audited, not run.** No POSIX-only imports, every path built with
  `os.path.join`, and the `.bat` files were checked for delayed-expansion traps - but
  the kit has never executed on Windows. Windows servers are a supported target,
  so this is the highest-value gap to close.
- **Email alerts have never been sent.** The SMTP path is exercised only by unit
  tests with a fake server. No real mail server has been tried.
- **Scheduling has never been observed firing.** Cron, launchd (`schedule`) and Task
  Scheduler entries are generated and their syntax is checked, but no run has been
  watched from a scheduler in situ.
- **The Windows launcher was changed without a Windows run.** It now runs `doctor`
  and offers `selftest` after `setup`. Line endings and labels were checked by
  inspection only.
- **Sandbox only.** Everything verified against sandbox keys. No production key has
  been used from the kit.
