# Truv Intake Tool - Setup Guide

Create Truv verification orders automatically, either from CSV files or directly
from your own application.

**You do not need to read any code.** Setup is three commands - the double-click
launcher runs the first two for you and offers the third.

**What "quick" covers, and what it does not.** Getting a sandbox test order through
is quick. Going live also needs things outside this kit: an export from your case
system that runs on a schedule, a machine that stays on, someone who owns the API
keys and the folders (they hold applicant names), and - only if you want results
delivered into your systems - a developer.

Requires **Python 3.8 or newer**. Nothing to install - the tool uses only what
comes with Python.

---

## Before you start

Have these two things ready:

1. **Your Truv API keys.** Truv Dashboard → **Development → API Keys**. You need
   the **Client ID** and the **Access Secret**. Start with your **sandbox** keys.
2. **A computer that stays on.** A server, or a desktop that does not sleep.
   Not a laptop that gets closed at night.

> **The one thing that catches everyone:** there is a single Truv API address.
> Sandbox and production are decided by **which keys you paste**, not by a
> different URL. So "am I in sandbox?" is answered by *which keys are in the
> config file*, nothing else. Every Truv Access Secret says which it is:
> production secrets begin with `prod-`, sandbox secrets with `sandbox-`. The
> tool reads that prefix and **refuses to run if it disagrees with the
> `environment` line in `config.ini`** - so pasting production keys under
> `environment = sandbox` stops the tool rather than quietly emailing real
> applicants. It also refuses to touch production until you have run a
> successful sandbox test.

---

## Start on your computer

The kit works the same on Windows, Mac and Linux. Only the first steps differ.

| | Windows | Mac | Linux |
|---|---|---|---|
| Double-click launcher | `START-HERE-windows.bat` | `START-HERE-mac-linux.command` | `START-HERE-mac-linux.command` |
| Python command in this guide | `py -3` | `python3` | `python3` |
| Open a terminal in this folder | Open the folder in File Explorer, click the address bar, type `cmd`, press Enter | Open **Terminal**, type `cd ` (with a space), drag the folder into the window, press Enter | In most file managers: right-click inside the folder → **Open in Terminal** |
| Scheduler | Task Scheduler | `python3 truv_intake.py schedule`, or cron | cron |

Every command below is written with `python3`. **On Windows, type `py -3`
instead** - for example `py -3 truv_intake.py doctor`.

**If the double-click launcher is blocked.** Both operating systems are wary of
scripts downloaded from the internet, and the launchers are not signed.

- **Mac:** macOS says the file "cannot be opened" or "was not opened". Click
  **Done**, then either open **System Settings → Privacy & Security**, scroll
  down and click **Open Anyway**, or skip the launcher: open a terminal in this
  folder and type `bash START-HERE-mac-linux.command`.
- **Windows:** if a blue "Windows protected your PC" box appears, click **More
  info → Run anyway**. Or open a terminal in this folder and type
  `START-HERE-windows.bat`.

Either way you end up in the same place: `setup` asks for your keys, then the
launcher runs `doctor` and offers to run `selftest`.

---

## Setup - three commands

Open a terminal in this folder and run these in order. Do not skip step 2.

### 1. Set up

```bash
python3 truv_intake.py setup
```

It asks for your keys and email settings, tests the keys against Truv
immediately, and creates the folders. Re-running it is safe - press Enter to
keep any existing answer.

### 2. Check and test

```bash
python3 truv_intake.py doctor
```

Every line must say **PASS**. If anything says FAIL, it tells you exactly what to
fix. Do not continue until it all passes.

```bash
python3 truv_intake.py selftest
```

This creates **one real order** and reads it back. Confirm it appears in your
Truv dashboard. This is what unlocks production.

### 3. Schedule it

The `setup` command prints the exact line to use for your operating system. It
looks like this:

**Mac / Linux** - run `crontab -e` and add:

```
30 * * * * cd /path/to/this/folder && /usr/bin/python3 truv_intake.py run
```

**Mac, alternative to cron** - run:

```bash
python3 truv_intake.py schedule
```

It writes a macOS scheduled job (launchd) with this machine's real paths filled
in and prints the one command that turns it on. It runs at :30 past every hour
**while you are logged in**. For a server that runs with nobody logged in, your IT
team installs it as a LaunchDaemon instead. If this folder is inside
**Documents**, **Desktop** or **Downloads**, macOS may block scheduled jobs from
reading it - keep the folder somewhere else, such as your home folder.

**Windows** - Task Scheduler → Create Task → Trigger: Daily, repeat every 1
hour → Action: *Start a program* → the program is your `python.exe`, the
arguments are `truv_intake.py run`, and "Start in" is this folder. Tick **Run
whether user is logged on or not**.

**You are done.** From here on, staff drop CSV files into `input/` and the tool
does the rest.

**Exit codes, for schedulers and monitoring:** `0` means everything went through
or was already done. `2` means at least one row failed or a file was rejected -
look in `failed/`. `1` means the tool could not run at all.

---

## Going live

1. In `config.ini`, replace both keys with your **production** keys **and**
   change `environment = sandbox` to `environment = production`. Change them
   together - the tool checks that they agree and stops if they do not.
2. Run `python3 truv_intake.py doctor` once more. It reports the environment it
   read from the key, not the one you typed.

The API address does not change. Only the keys and that one label - and a
half-finished switch halts the tool instead of creating real orders by accident.

---

## Daily use - for staff, no technical skill needed

1. Make a CSV, one applicant per row (columns below).
2. **Save it into the `input` folder.**
3. Done. Within the hour it is processed and a summary is emailed.

### What happens to each file

| Outcome | Where it goes | What it means |
|---|---|---|
| All rows fine | `processed/` | Every row became an order. |
| Some rows bad | `processed/` | The good rows became orders. The bad ones are written to `failed/` as a `.failed-rows.csv` with the reason on each line. |
| Nothing could be sent | `failed/` | The file itself is wrong - wrong columns, unreadable, or too many rows. The email says which. |

Two guarantees worth knowing:

- **One bad row never blocks the rest.** The good rows are sent; the bad ones come
  back in a small file you can fix and drop straight back into `input/`. Only the
  rows you fix get sent - the ones already created are not repeated.
- **The same applicant is not ordered twice by accident.** The tool keeps a list
  of everyone it has submitted, in `state/ledger.csv`, keyed on the **person and
  the case** - not the case alone. Re-dropping the same file, or a renamed copy,
  creates nothing new.
  - **This works best when every row has a `case_number`.** Truv also checks the
    case-based order reference, so a repeat is caught even if the ledger is lost.
    Rows without a case number are matched on name, email and phone in the
    ledger only.
  - A household sharing one `case_number` is several applicants, and each one
    gets their own order.
  - Repeat verification for the same person is legitimate - a redetermination, a
    retry, an expired order. Put `yes` in a `force_new` column on that row and a
    **new order** is created, with the date and time added to its reference
    (for example `CASE-1001-Maria-Lopez-R20261019153000`).
  - If Truv already has an order with a row's reference, nothing new is created
    and the row is reported as **already ordered**, never as created.

### Fixing rows that failed

When some rows fail you get a file in `failed/` like
`20260817-125554__july31.failed-rows.csv`. It has your original columns plus an
`_error` column:

```
first_name,last_name,case_number,email,_error
James,Nguyen,CASE-4472,not-an-email,email is not a valid email address
,NoFirst,CASE-4474,x@example.com,missing first_name
```

It holds only the columns this tool reads, plus the reason - any other columns in
your export are not copied. Fix the values, then move the file into `input/`.
Only those rows are sent. Safe to repeat: the tool remembers what it has already
created, and Truv also recognizes an order reference it has seen before.

---

### CSV columns

**File size:** up to **3,000 rows per file**. Your account can create 3,000 orders
an hour and one file uses one request, so a larger file is rejected with
instructions rather than half-sent - split it across runs.

| Column | Required | What it is |
|---|---|---|
| `first_name` | **Yes** | Applicant first name |
| `last_name` | **Yes** | Applicant last name |
| `case_number` | No | Your case ID. Becomes the order reference and the duplicate key. **Strongly recommended** - see above. |
| `email` | No | Applicant email. If you fill this in, **Truv emails the applicant.** Leave blank if you don't want that. |
| `phone` | No | Any format - `(415) 555-4193` is fine. Reduced to 10 digits. |
| `staff_name` | No | Staff member who owns the order |
| `staff_email` | No | Staff member who owns the order - receives Truv's order notifications |
| `cc_emails` | No | Extra people to copy. Separate several with `;`. Maximum 15. |
| `force_new` | No | Put `yes` here to create a new order even if this applicant was sent before - redeterminations, retries, expired orders. |

Need a blank one? `python3 truv_intake.py template`. The template has two sample
rows with `example.com` addresses so you can see the format - **delete them**.
The tool refuses any row with an `example.com`, `example.org` or `example.net`
address, so a forgotten sample row is never sent.

**Column names.** Case, spaces and hyphens are ignored (`First_Name`, `LAST NAME`
and `first-name` all match). These common alternatives are also recognized:

| Column | Also accepted |
|---|---|
| `first_name` | First, FirstName, FName, Given Name |
| `last_name` | Last, LastName, LName, Surname, Family Name |
| `case_number` | Case, Case ID, Case No, Case Num, Case #, CaseNumber |
| `email` | Email Address, E-mail |
| `phone` | Phone Number, Mobile, Cell, Telephone |
| `staff_email` / `staff_name` | Worker Email / Worker Name, Caseworker Email / Caseworker Name |

If your export uses other names, map them in `config.ini` under `[columns]`
instead of changing the export:

```
[columns]
first_name = Applicant First
case_number = Program Case Ref
```

The tool also handles what Excel and case systems produce:

| Your export | What happens |
|---|---|
| Semicolon or tab separated (Excel does this on many locales) | Detected and read. The run log says which separator it used. |
| Saved as plain "CSV (Comma delimited)" on Windows | Read as cp1252, so accented names survive. |
| Windows CRLF line endings, or a UTF-8 BOM | Handled. |
| Blank rows left behind after clearing cells | Ignored silently. They are not reported as errors. |
| Saved as "Unicode Text" / UTF-16 | Read. |
| Extra columns you use internally (SSN, DOB, county) | Not sent and not copied into any file the tool writes. Your original file is moved into `processed/` or `failed/` as it is. |

Things it will refuse, because guessing would be worse than stopping:

- **Two columns with the same name.** Only one could be used, so the values sent
  might not be the ones you meant. Remove the duplicate and re-export.
- **An Excel workbook** - an `.xlsx` in the input folder, or one renamed to
  `.csv`. The run says so and moves it to `failed/`. Re-save it as CSV UTF-8.

---

## Checking a file before you commit to it

```bash
python3 truv_intake.py validate yourfile.csv
```

Reports every problem. **Creates nothing and sends nothing.** Safe to run any
time, on anything.

---

## The emails

Email is **optional and off until you set it up**, because it needs your mail
server's details. When it is on, the tool connects to your mail server as well as
to Truv, and it checks the server's TLS certificate.

**Run summary** - after every run, to the addresses in `to_addrs`:

- `Truv order intake - 12 created, 0 failed, 0 rejected (2026-07-31 14:30:00)`
- `Truv order intake - ran, nothing to do (2026-07-31 15:30:00)`

The "nothing to do" message matters: if the summaries stop arriving, the
scheduler or the machine is down. Check the newest file in `logs/`.

**Per-staff confirmation** - after each file, every `staff_email` and CC gets one
email listing only their own lines and whether each became an order. It contains
the case number and name only - **never any verification results**. Turn it off
with `send_row_confirmations = false`.

---

## Getting results back

By default no verification results come back to you: completed verifications are
reviewed in the Truv dashboard. If that is how your staff work, you can stop here.

If you want results delivered into your own system, that needs a **webhook** -
a URL on your servers that Truv calls when an order finishes. See the separate
*Webhooks & Results Retrieval* guide. It needs a developer.

```bash
python3 truv_intake.py webhook add https://your.host/webhooks/truv
python3 truv_intake.py webhook list
python3 truv_intake.py webhook history     # did Truv reach us? last 30 days
```

`webhook add` subscribes to `order-finalized`. If your webhook was created some
other way, run `webhook list` and check that `order-finalized` is in its event
list - without it, nothing in this section ever fires.

There is a complete working receiver in `webhook_receiver_example.py`.

### When an order is really done

Three things look like "done". Only one of them means the results are ready.

| Signal | What it means | Use it to collect results? |
|---|---|---|
| `task-status-updated` with status `done` | One data connection finished | No |
| `order-status-updated` | One employer or account on the order changed | No - it fires once per employer or account |
| `order-finalized` | The whole order is finished | **Yes** |

An order has no single status field. When you read an order, it is finished
when `completed_at`, `canceled_at` or `is_expired` is set.

### Two kinds of report

An order can carry two kinds of report, and they are retrieved differently.
Collect both if you verify assets.

| Report | Where it is | How many |
|---|---|---|
| Per-connection PDF | `pdf_report` on each entry in `employers[]` and `financial_accounts[]` | One per connection |
| Assets report | `voa_report_id` at the top level of the order | One for the whole order |

A process that only walks `employers[]` and `financial_accounts[]` never sees the
assets report. To retrieve it, read the order, then request the report by ID:

```bash
curl https://prod.truv.com/v1/orders/ORDER_ID/ \
  -H "X-Access-Client-Id: $TRUV_CLIENT_ID" \
  -H "X-Access-Secret: $TRUV_ACCESS_SECRET"
```

Take `user_id` and `voa_report_id` from that response, then download the PDF:

```bash
curl "https://prod.truv.com/v1/users/USER_ID/assets/reports/VOA_REPORT_ID/?fmt=pdf" \
  -H "X-Access-Client-Id: $TRUV_CLIENT_ID" \
  -H "X-Access-Secret: $TRUV_ACCESS_SECRET" \
  -o assets-report.pdf
```

Leave out `?fmt=pdf` to get the same report as JSON.

### Pull one order by hand

```bash
python3 truv_intake.py fetch ORDER_ID            # the JSON
python3 truv_intake.py fetch ORDER_ID --pdf      # every PDF: per connection, plus the assets report
```

---

## The better option: skip the CSV entirely

If you control the application form that produces the CSV, you can create the
order **at the moment the applicant submits**, instead of waiting for the next
run.

```
Today:     form submitted → row into CSV → wait up to an hour → order created
Direct:    form submitted → order created in seconds → row into CSV as a record
```

The CSV does not go away. It stops being a queue and becomes the daily log of
what already happened - which is a better use for it, and it still catches
anything the live call missed.

`direct_example.py` in this folder is a complete, commented implementation. The
migration is genuinely two lines in your submit handler. Ask your Truv contact
if you want help.

To try a single order from the command line:

```bash
python3 truv_intake.py direct --first-name Maria --last-name Lopez --case-number CASE-1234
```

---

## All commands

| Command | What it does |
|---|---|
| `setup` | Interactive first-time setup. Start here. Safe to re-run. |
| `doctor` | Checks everything, PASS/FAIL, sends a test email. |
| `selftest` | Creates one real order to prove it works. |
| `template` | Writes a blank CSV. |
| `validate FILE` | Checks a CSV. Creates nothing. |
| `run` | **The scheduled command.** Processes everything in `input/`. |
| `send FILE` | Processes one specific file right now. |
| `direct` | Creates one order from command-line values. |
| `webhook list\|add\|history` | Sets up or inspects result delivery. |
| `fetch ORDER_ID` | Downloads an order's JSON, or `--pdf` for the report. |
| `version` | Prints the version. |

Add `--dry-run` to `run` to check everything without creating anything.

---

## What Truv supports, and what you own

This tool is a **reference implementation** - a working starting point you run in
your own environment, not a hosted Truv service. Being explicit about the line
saves everyone time when something breaks at 6am.

| Truv owns | You own |
|---|---|
| The API this tool calls, and telling you before it changes | The machine or server the tool runs on |
| The tool's own logic and these guides | The scheduler - cron, launchd or Windows Task Scheduler |
| Verification data, once an order exists | The export that produces the CSV |
| | Your mail server, and the account the tool sends from |
| | Folder permissions, disk space, and the Python install |
| | How long files that hold applicant names are kept (`retention_days`) |

**Diagnosing which side a failure is on.** Run `python3 truv_intake.py doctor`
first - it checks credentials, folder access, Truv connectivity and email
separately, so it tells you which of the two columns above the problem is in.
Every error message names the thing to check. If `doctor` passes and orders are
still not appearing, that is ours; if it fails on folders, email or the
scheduler, that is yours.

**Version.** This is version 2.2. Every request the tool makes carries its
version in the `User-Agent` header. Two things you can do to help:

- Run `python3 truv_intake.py version` and include the output in any support
  request.
- Do not edit `truv_intake.py`. If you need different behavior, ask - a local
  fork is invisible to us and cannot be supported.

**What the tool talks to.** Truv's API over HTTPS, and - only if you turn email
on - your own mail server. It does not upgrade itself or fetch configuration from
anywhere. Nothing changes on your server without you doing it.

**What it keeps on your machine.** The tool writes files that contain applicant
names: the ledger (`state/ledger.csv`), the processed and failed copies of your
files, per-file `.results.csv` files (with the applicant's verification link),
and the logs. On Mac and Linux these are readable only by the account that runs
the tool. On Windows, restrict the folder to that account. Set `retention_days`
in `config.ini` to delete old copies and logs automatically - the ledger is
always kept, because it is what prevents duplicate orders.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `PROBLEM ... WHAT TO DO: ...` | Do the thing it says. Every error names its own fix. |
| Summary emails stopped | The scheduler or the machine is down. Check `logs/`. |
| `HTTP 401` or `HTTP 403` | Wrong keys. Re-copy both values from the dashboard, or re-run `setup`. |
| `config.ini says environment = ...` | The `environment` line disagrees with the key you pasted. Make them match; the key is what actually decides. |
| A file went to `failed/` | Open the summary email. It lists every bad row. Fix and re-drop. |
| "already ordered" messages | Working as intended - that applicant was submitted before. Use `force_new` for a deliberate repeat. |
| Exit code `2` from the scheduler | Some rows failed or a file was rejected. Look in `failed/`. |
| Nothing happens at all | Run `python3 truv_intake.py doctor`. |

Need help? Send your Truv contact:

- the file from `failed/` and its `.results.csv`
- the newest file from `logs/`

**These contain applicant names.** Remove or replace them before sending, or
share through a channel your organization approves for applicant data.

**Never send your `config.ini` or your API keys.** Nobody at Truv needs them.

---

## Files in this folder

| File | What it is |
|---|---|
| `truv_intake.py` | The program. This is the only file you run. |
| `config.ini` | Your settings and keys. Created by `setup`. **Contains secrets.** |
| `config.ini.example` | A blank reference copy. |
| `orders_template.csv` | The right columns, with two sample rows to delete. |
| `direct_example.py` | Reference implementation for the direct pattern. |
| `webhook_receiver_example.py` | Working webhook receiver you can run and test. |
| `START-HERE-windows.bat` | Double-click launcher for Windows. |
| `START-HERE-mac-linux.command` | Double-click launcher for Mac and Linux. |
| `input/` | Drop CSVs here. |
| `processed/` `failed/` | Where files land afterwards. Contain applicant names. |
| `logs/` | One log per day. |
| `state/` | The duplicate-protection ledger. **Do not delete.** |

### Keep `config.ini` private

It holds your API secret. The tool restricts it automatically on Mac and Linux
(`chmod 600`). On Windows, open **Properties → Security** and limit it to the
account that runs the tool.

Deleting `state/ledger.csv` removes the duplicate protection and the tool will
happily re-order every case it has seen before. Don't.
