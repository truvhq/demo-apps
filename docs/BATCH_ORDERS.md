# Batch Orders - live batch intake tool

Route: `#public-sector/batch-orders` · Component: [`src/demos/BatchOrders.jsx`](../src/demos/BatchOrders.jsx)
· Runner UI: [`src/components/BatchRunner.jsx`](../src/components/BatchRunner.jsx)
· Server: [`server/routes/batch-orders.js`](../server/routes/batch-orders.js)

A Public Sector **Demo** (listed in the Demos section of the Public Sector hub). It is
a hands-on way to *understand* bulk order creation - the batch endpoint, the job
lifecycle, the per-order results, and the `order-batch-completed` webhook and how to
handle it. **It is a learning sandbox, not a production bulk-runner**: you build a small
file, send it to the Truv sandbox, and watch what comes back. For the sales narrative of
batch intake, see the animated [Batching](./BATCHING.md) guide; this demo is where you
poke at the actual endpoint.

It renders in the Checkr look (`<Layout theme="checkr">`, matching the hub and the
Renewals/Batching flows). It is a plain demo in the `INDUSTRIES` registry (App.jsx)  - 
listed in `PublicSectorHub` `CARD_TEXT`/`ORDER` with an icon in `DemoHub` `DEMO_ICONS`.
Behind the Public Sector sign-in it runs against the sandbox with the session (or local
`.env`) credentials.

## Applicant notifications (notification_settings)

When an order carries an email or phone, Truv sends the applicant the verification link
by email/SMS. The demo exposes `notification_settings` as a batch-level control applied
to every order, with a callout explaining the off-hours case:

- `first_notification_delay_hours` (integer, hours) - delay the **first** applicant
  notification. A batch intake is often a scheduled overnight job; set this so the first
  email/SMS fires at the **start of business hours** instead of 2am (a 2am job with `6`
  holds notifications until 8am).
- `suppress_user_notifications` (boolean) - turn applicant notifications off entirely.
  It **overrides** the delay (the API ignores `first_notification_delay_hours` when this
  is true).

Both are confirmed against the batch create schema and the
[Configure notifications](https://docs.truv.com/developers/integration/embedded-orders/follow-up#configure-notifications)
docs. `buildOrder` attaches `notification_settings` to each order only when a delay or
suppress is set.

---

## What you can do

- **Build the file two ways** - edit rows directly in the grid, or upload a CSV.
- **Choose the columns** - a field selector drives both the grid and the exported
  template. Only `first_name` and `last_name` are locked on (required by the API);
  `phone`, `email`, `company_name`, `order_number` and `external_user_id` are checked
  by default but can be removed; `date_of_birth`, `ssn`, `cc_emails`, `notes` are
  opt-in. Turning a column on back-fills sample data into the existing rows. Only
  selected fields ever leave the browser. `phone` stays blank by default (a real
  mobile number is required or the order fails), and `email` cells are +bulktestN
  aliases of a test inbox so every address is valid and reaches one inbox.
- **Export a template** - a blank CSV with exactly the selected columns plus two
  example rows, generated client-side.
- **Tune the chunking** - chunk size, concurrency, and pacing are live sliders,
  and the script view rewrites itself to match so you can see the exact runner.
- **Watch it run** - per-chunk cards (batch id, status, created/existing/failed,
  duration), a per-order results table with `share_url` links, and the
  `order-batch-completed` webhook when a webhook URL is configured.
- **Export results** - the per-order outcomes as CSV.

---

## The endpoints

| Step | Truv call | Notes |
|------|-----------|-------|
| Create | `POST /v1/orders/batch/` | Body `{ orders: [...] }`. Returns `202` with a job id. Each order takes the same fields as a single order; `company_name` goes inside `employers[]`. |
| Poll | `GET /v1/orders/batch/{id}/` | Until `status` is `completed`. Each result is `created`, `existing`, or `failed`. |
| Webhook | `order-batch-completed` | Batch-level payload (`batch_id`, `created_count`, `failed_count`). The hands-off alternative to polling. |

Per-order status:

- **created** - a new order.
- **existing** - an `order_number` that already exists. Nothing is created and the
  existing order is left untouched, so retrying a batch is safe.
- **failed** - the order could not be created; the row carries the field errors.

`order_number` is the key to that safety: supply one and a repeat run reports
`existing` instead of duplicating. A row with no `order_number` gets a generated
one server-side, so a plain re-run always creates fresh orders.

Limits: a single batch request takes up to 10,000 orders; to send more you run several
requests (e.g. 30,000 at once as 3 requests of 10,000). This demo caps a single run at
30,000 rows and a single batch at 10,000, and the UI copy, the slider max, and the
server clamp all agree on those numbers.

Products: the UI offers **Income & Assets** (default), **Income & Employment**, and
**Assets only**, each mapping to the per-order `products` array (`["income","assets"]`,
`["income"]`, `["assets"]`). `company_name` only rides along as `employers[]` when the
order includes a product that accepts employers (income/employment); `buildOrder`
skips `employers[]` for an assets-only order, which the API would otherwise reject.
Employment-only is not offered (not a public-sector use case).

---

## How the runner works

[`server/routes/batch-orders.js`](../server/routes/batch-orders.js) mirrors the
Coverage Analysis runner: in-memory jobs (no DB), swept on a TTL, driven by three
knobs passed straight through from the UI.

- **Chunk size** - rows per `POST /v1/orders/batch/` request.
- **Concurrency** - a worker pool pulls chunks off a shared cursor, so up to N
  chunks are in flight at once.
- **Delay** - a shared pacing gate spaces the *start* of each outbound request by
  `delay_ms` across the whole pool, rather than bursting.

Each chunk is created, then polled until its job reports a terminal status, and the
per-order results are folded back onto the job's global rows by `offset + index`.
A chunk that fails on an HTTP error marks its own rows failed and the run
continues - one bad chunk never blocks the rest, mirroring the API's own
per-order behavior. A job-level `failed` status fails any still-pending rows; if a
chunk is still pending when the poll cap is hit it is marked `timeout` (never
silently reported as `completed`). `TruvClient._request` carries a 30s
`AbortSignal.timeout` so a hung socket can't wedge a worker forever.

Reads are session-scoped: the job records its creating session, and in hosted
(multi-tenant) mode `GET /jobs/:id` and `/csv` 403 unless the caller owns the job -
the results carry applicant names, order numbers, and live `share_url`s. Local
single-tenant mode stays open, like the rest of the app.

### The `order-batch-completed` webhook

Unlike the other order events, this payload carries a `batch_id` but **no**
`user_id` or `link_id`, so it can't be stored against a user and served by the
per-user webhook polling path. Instead [`server/index.js`](../server/index.js)
records it in an in-memory registry keyed by `batch_id`
([`server/batch-events.js`](../server/batch-events.js)), and the job poll attaches
any matching event to its chunks. The results table comes from polling either way,
so the demo works with or without a reachable webhook URL.

---

## API surface (this app's backend)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/batch/jobs` | `{ rows, products[], chunk_size, concurrency, delay_ms, template_id?, notify?, session_id }` -> `{ job_id }` |
| GET | `/api/batch/jobs/:id` | Live status, per-chunk + per-order results, webhooks |
| GET | `/api/batch/jobs/:id/csv` | Per-order results as CSV |

## Tests

- [`tests/server/routes/batch-orders.test.js`](../tests/server/routes/batch-orders.test.js)
  - `buildOrder`, `chunkRows`, `applyBatchResults`, `countStatuses`, and the full
    `runJob` (chunking, concurrency, result folding, whole-chunk HTTP failure).
- [`tests/demos/batch-orders.test.js`](../tests/demos/batch-orders.test.js)
  - the locked-field contract, CSV parsing + aliases, and the live script text.
