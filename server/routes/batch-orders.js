/**
 * FILE SUMMARY: Batch Orders runner routes.
 * DATA FLOW: Frontend builds/uploads applicant rows --> POST /api/batch/jobs creates a job
 *            --> background runner chunks the rows and sends each chunk to
 *                POST /v1/orders/batch/, then polls GET /v1/orders/batch/:id/ until each
 *                chunk's job completes
 *            --> Frontend polls GET /api/batch/jobs/:id for live progress + per-order
 *                results + any order-batch-completed webhooks, and downloads
 *                GET /api/batch/jobs/:id/csv.
 * INTEGRATION PATTERN: Standalone bulk processor (mirrors coverage-analysis.js). Reuses
 *            TruvClient.createBatchOrders / getBatchJob. Job state is in-memory (per process).
 *
 * The chunking is the point of the demo: the whole applicant list is split into
 * chunks of `chunk_size`, up to `concurrency` chunks are in flight at once, and
 * requests are paced `delay_ms` apart. Those three knobs are passed straight
 * through from the UI so a solutions engineer can feel the tradeoffs live.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { serializeCsv } from '../lib/csv.js';
import { getBatchEvent } from '../batch-events.js';

// Guardrails. The API allows 10,000 orders per batch request and 3,000 orders/hour;
// we cap a single demo run at 3,000 rows so one run can't blow the hourly budget,
// and cap a single batch at 500 to match the UI slider (one consistent story).
const MAX_ROWS = 3000;
const MAX_CHUNK_SIZE = 500;
const MAX_CONCURRENCY = 8;
const MAX_DELAY_MS = 10_000;

// Products whose per-order payload may carry employers[] (i.e. company_name). The
// API rejects employers for anything else ("Providing employers information only
// supported for products: admin, deposit_switch, employment, income, pll"), so we
// only attach company_name for these. The curated UI only offers income/employment.
const EMPLOYER_PRODUCTS = new Set(['income', 'employment', 'deposit_switch', 'pll', 'admin']);

// Polling the batch job status: how often, and how long before we give up waiting
// on a single chunk (it stays whatever status it last reported).
const STATUS_POLL_INTERVAL_MS = 1500;
const STATUS_POLL_MAX_ATTEMPTS = 80;              // ~2 minutes per chunk

const JOB_TTL_MS = 30 * 60_000;
const JOB_SWEEP_INTERVAL_MS = 5 * 60_000;

// Products this batch runner supports (sent as the per-order `products` array).
// income verifies income + employment; assets verifies bank assets; employment is
// VOE only. The demo offers income+assets (default), income, or assets.
const VALID_PRODUCTS = new Set(['income', 'employment', 'assets']);

// Output columns for the results CSV export.
const RESULT_COLUMNS = ['input_name', 'order_number', 'status', 'order_id', 'share_url', 'short_share_url', 'error'];
const CSV_HEADER_LABELS = { order_number: 'Order number', order_id: 'Order ID', share_url: 'Share URL', short_share_url: 'Short share URL' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Build a single Truv order payload from a normalized applicant row.
// Only `products`, `first_name` and `last_name` are required by the API; everything
// else is sent only when present. `company_name` goes inside employers[], and
// cc_emails may arrive as an array or a ";"/"," separated string.
export function buildOrder(row, products, notify) {
  const productList = Array.isArray(products) ? products : [products];
  const order = {
    products: productList,
    first_name: (row.first_name || '').trim(),
    last_name: (row.last_name || '').trim(),
  };

  const email = (row.email || '').trim();
  const phone = (row.phone || '').trim();
  const externalUserId = (row.external_user_id || '').trim();
  const ssn = (row.ssn || '').trim();
  const dob = (row.date_of_birth || '').trim();
  const notes = (row.notes || '').trim();

  if (email) order.email = email;
  if (phone) order.phone = phone;
  if (externalUserId) order.external_user_id = externalUserId;
  if (ssn) order.ssn = ssn;
  if (dob) order.date_of_birth = dob;
  if (notes) order.notes = notes;

  // order_number drives safe retries: supplying one that already exists makes the
  // API report that row as `existing` instead of creating a duplicate. When a row
  // has no order_number we generate one so a plain re-run always creates fresh orders.
  const providedOrderNumber = (row.order_number || '').trim();
  order.order_number = providedOrderNumber || `batch-${uuidv4()}`;

  // company_name only rides along as employers[] when the order has a product that
  // accepts employers (income/employment); an assets-only order would be rejected.
  const company = (row.company_name || '').trim();
  if (company && productList.some(p => EMPLOYER_PRODUCTS.has(p))) order.employers = [{ company_name: company }];

  const ccRaw = row.cc_emails;
  const ccList = Array.isArray(ccRaw)
    ? ccRaw
    : String(ccRaw || '').split(/[;,]/);
  const ccEmails = ccList.map(s => String(s).trim()).filter(Boolean);
  if (ccEmails.length) order.cc_emails = ccEmails;

  // notification_settings controls Truv's applicant email/SMS for this order.
  // suppress_user_notifications wins - the API ignores the delay when it's true.
  // first_notification_delay_hours is how a job run off-hours holds the first
  // notification until business hours (see the callout in the UI).
  if (notify) {
    if (notify.suppress) order.notification_settings = { suppress_user_notifications: true };
    else if (notify.delayHours > 0) order.notification_settings = { first_notification_delay_hours: notify.delayHours };
  }

  return order;
}

// Split an array into consecutive chunks of at most `size`.
export function chunkRows(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export default function batchOrdersRoutes({ truv, apiLogger, localMode = false }) {
  const router = Router();
  const jobs = new Map();

  const sweepInterval = setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const finishedAt = job.completed_at || job.created_at;
        if (finishedAt < cutoff) jobs.delete(id);
      }
    }
  }, JOB_SWEEP_INTERVAL_MS);
  sweepInterval.unref?.();

  // POST /api/batch/jobs - accept applicant rows + chunking knobs, start processing.
  router.post('/api/batch/jobs', (req, res) => {
    const truvClient = req.truv || truv;
    if (!truvClient) return res.status(401).json({ error: 'session_required' });

    const body = req.body || {};
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' });
    if (rows.length > MAX_ROWS) return res.status(413).json({ error: `Max ${MAX_ROWS} rows per run` });
    if (!rows.every(r => r && typeof r === 'object' && !Array.isArray(r))) return res.status(400).json({ error: 'each row must be an object' });

    // products is an array; accept a legacy single `product` too. Default to income+assets.
    let products = Array.isArray(body.products) ? body.products : (body.product ? [body.product] : ['income', 'assets']);
    products = products.filter(p => typeof p === 'string');
    if (products.length === 0) return res.status(400).json({ error: 'products required' });
    const badProduct = products.find(p => !VALID_PRODUCTS.has(p));
    if (badProduct) return res.status(400).json({ error: `Invalid product: ${badProduct}` });

    // Clamp the knobs so a bad value from the UI can't create a pathological run.
    const chunkSize = clamp(parseInt(body.chunk_size, 10) || 50, 1, MAX_CHUNK_SIZE);
    const concurrency = clamp(parseInt(body.concurrency, 10) || 1, 1, MAX_CONCURRENCY);
    const delayMs = clamp(parseInt(body.delay_ms, 10) || 0, 0, MAX_DELAY_MS);
    const templateId = (body.template_id || '').trim() || null;

    // notification_settings, applied to every order in the run. A benefits batch
    // run off-hours sets a delay so the first applicant email/SMS lands at the start
    // of business hours; suppress turns applicant notifications off entirely.
    const notify = {
      suppress: !!(body.notify && body.notify.suppress),
      delayHours: clamp(parseInt(body.notify?.delay_hours, 10) || 0, 0, 24),
    };

    // Normalize + snapshot each row up front so the runner, the results table, and
    // the CSV export all agree on order_number and display name.
    const orders = rows.map(r => buildOrder(r, products, notify));
    const chunks = chunkRows(orders, chunkSize);

    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'running',
      products,
      chunk_size: chunkSize,
      concurrency,
      delay_ms: delayMs,
      template_id: templateId,
      session_id: body.session_id || null,
      // Bind the job to the creating session so hosted (multi-tenant) mode can gate
      // reads - the results carry applicant names, order numbers, and live share_urls.
      owner_session: req.session?.id || null,
      total: orders.length,
      chunk_count: chunks.length,
      // Per-applicant result rows, pre-seeded as pending and indexed globally.
      rows: orders.map((o, i) => ({
        global_index: i,
        input_name: `${o.first_name} ${o.last_name}`.trim() || '(no name)',
        order_number: o.order_number,
        status: 'pending',
        order_id: null,
        share_url: null,
        short_share_url: null,
        bridge_token: null,
        error: null,
      })),
      chunks: chunks.map((c, i) => ({
        index: i,
        size: c.length,
        offset: i * chunkSize,
        batch_id: null,
        status: 'queued',   // queued | sending | polling | completed | failed
        created: 0,
        existing: 0,
        failed: 0,
        duration_ms: null,
        error: null,
        webhook: null,
      })),
      processed_chunks: 0,
      created_at: Date.now(),
    };
    jobs.set(jobId, job);

    runJob({ job, chunks, truv: truvClient, apiLogger }).catch(err => {
      console.error('Batch job failed:', err);
      job.status = 'failed';
      job.error = err.message;
    });

    res.json({ job_id: jobId, total: job.total, chunk_count: job.chunk_count });
  });

  // In hosted (multi-tenant) mode a job's results - applicant names, order numbers,
  // and live share_urls - may only be read by the session that created it. Local
  // single-tenant mode stays open (no per-visitor session), matching the rest of the app.
  function ownsJob(req, job) {
    if (localMode) return true;
    return !!req.session && req.session.id === job.owner_session;
  }

  // GET /api/batch/jobs/:id - poll live status, per-chunk + per-order results, webhooks.
  router.get('/api/batch/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (!ownsJob(req, job)) return res.status(403).json({ error: 'forbidden' });

    // Attach any order-batch-completed webhook that has arrived for each chunk.
    const chunks = job.chunks.map(c => {
      const webhook = c.batch_id ? getBatchEvent(c.batch_id) : null;
      if (webhook) c.webhook = webhook;
      return c;
    });
    const webhooks = chunks.map(c => c.webhook).filter(Boolean);

    res.json({
      job_id: job.id,
      status: job.status,
      products: job.products,
      chunk_size: job.chunk_size,
      concurrency: job.concurrency,
      delay_ms: job.delay_ms,
      template_id: job.template_id,
      total: job.total,
      chunk_count: job.chunk_count,
      processed_chunks: job.processed_chunks,
      counts: countStatuses(job.rows),
      chunks,
      rows: job.rows,
      webhooks,
      error: job.error || null,
    });
  });

  // GET /api/batch/jobs/:id/csv - download per-order results once the job is done.
  router.get('/api/batch/jobs/:id/csv', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (!ownsJob(req, job)) return res.status(403).json({ error: 'forbidden' });
    if (job.status !== 'completed' && job.status !== 'failed') return res.status(409).json({ error: 'Job not finished' });
    const csv = serializeCsv(job.rows, RESULT_COLUMNS, CSV_HEADER_LABELS);
    const filename = `batch_orders_${job.id.slice(0, 8)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  return router;
}

// Runs a batch job to completion: a pool of `concurrency` workers pulls chunks off
// a shared cursor, each worker paced by a shared `delay_ms` gate so requests are
// spaced out across the whole pool rather than bursting.
async function runJob({ job, chunks, truv, apiLogger }) {
  let cursor = 0;
  const pace = { nextAllowed: 0 };

  // Space the start of each outbound request by delay_ms, shared across workers.
  async function paced() {
    if (!job.delay_ms) return;
    const now = Date.now();
    const start = Math.max(now, pace.nextAllowed);
    pace.nextAllowed = start + job.delay_ms;
    const wait = start - now;
    if (wait > 0) await sleep(wait);
  }

  async function worker() {
    while (cursor < chunks.length) {
      const i = cursor++;
      await paced();
      await processChunk({ job, chunk: chunks[i], meta: job.chunks[i], truv, apiLogger });
      job.processed_chunks++;
    }
  }

  const workers = Array.from({ length: Math.min(job.concurrency, chunks.length) }, () => worker());
  await Promise.all(workers);

  job.status = 'completed';
  job.completed_at = Date.now();
}

// Sends one chunk to POST /v1/orders/batch/, then polls GET /v1/orders/batch/:id/
// until that chunk's job reports a terminal status. Folds the per-order results
// back onto the job's global rows by (offset + result.index).
async function processChunk({ job, chunk, meta, truv, apiLogger }) {
  meta.status = 'sending';
  const started = Date.now();

  const createRes = await truv.createBatchOrders(chunk, { templateId: job.template_id });
  apiLogger.logApiCall({
    sessionId: job.session_id,
    method: 'POST',
    endpoint: '/v1/orders/batch/',
    requestBody: createRes.requestBody,
    responseBody: createRes.data,
    statusCode: createRes.statusCode,
    durationMs: createRes.durationMs,
  });

  if (createRes.statusCode >= 400) {
    meta.status = 'failed';
    meta.error = extractError(createRes.data) || `HTTP ${createRes.statusCode}`;
    meta.duration_ms = Date.now() - started;
    // Mark every row in this chunk as failed so the UI reflects the whole-chunk error.
    for (let k = 0; k < meta.size; k++) failRow(job, meta.offset + k, meta.error);
    return;
  }

  let batch = createRes.data || {};
  meta.batch_id = batch.id || null;
  applyBatchResults(job, meta, batch);

  // If the API already finished the job in the create response, we're done.
  // Otherwise poll the status endpoint until it reaches a terminal state.
  let attempts = 0;
  while (isPending(batch.status) && meta.batch_id && attempts < STATUS_POLL_MAX_ATTEMPTS) {
    meta.status = 'polling';
    await sleep(STATUS_POLL_INTERVAL_MS);
    attempts++;
    const statusRes = await truv.getBatchJob(meta.batch_id);
    // Log only the terminal poll to keep the API log readable (one create + one final read).
    if (statusRes.statusCode >= 400) {
      meta.status = 'failed';
      meta.error = extractError(statusRes.data) || `HTTP ${statusRes.statusCode}`;
      logStatus(apiLogger, job, meta.batch_id, statusRes);
      meta.duration_ms = Date.now() - started;
      for (let k = 0; k < meta.size; k++) if (job.rows[meta.offset + k].status === 'pending') failRow(job, meta.offset + k, meta.error);
      return;
    }
    batch = statusRes.data || {};
    applyBatchResults(job, meta, batch);
    // Log the final poll on a terminal status, or the last poll when we give up waiting,
    // so the activity panel always shows how the chunk ended (completed or stalled).
    if (!isPending(batch.status) || attempts >= STATUS_POLL_MAX_ATTEMPTS) logStatus(apiLogger, job, meta.batch_id, statusRes);
  }

  meta.duration_ms = Date.now() - started;

  if (batch.status === 'failed') {
    // Job-level failure (the API returns HTTP 200 with status 'failed' and a
    // job-level errors array). Fail any rows the results array didn't account for.
    meta.status = 'failed';
    meta.error = extractError(batch) || 'batch failed';
    for (let k = 0; k < meta.size; k++) if (job.rows[meta.offset + k].status === 'pending') failRow(job, meta.offset + k, meta.error);
    return;
  }

  if (isPending(batch.status)) {
    // We hit the poll cap while the job was still processing. Don't pretend it
    // finished - mark the chunk and its still-pending rows as timed out so the UI
    // shows the stall honestly rather than reporting a clean "completed".
    meta.status = 'timeout';
    meta.error = `Still processing after ${Math.round(STATUS_POLL_MAX_ATTEMPTS * STATUS_POLL_INTERVAL_MS / 1000)}s - check the dashboard`;
    for (let k = 0; k < meta.size; k++) {
      const row = job.rows[meta.offset + k];
      if (row.status === 'pending') { row.status = 'timeout'; row.error = 'Still processing'; }
    }
    return;
  }

  meta.status = 'completed';
}

function logStatus(apiLogger, job, batchId, res) {
  apiLogger.logApiCall({
    sessionId: job.session_id,
    method: 'GET',
    endpoint: `/v1/orders/batch/${batchId}/`,
    responseBody: res.data,
    statusCode: res.statusCode,
    durationMs: res.durationMs,
  });
}

// Fold a batch job's `results` array onto the global rows and recompute the chunk's
// created/existing/failed tallies. Safe to call repeatedly as polling progresses.
function applyBatchResults(job, meta, batch) {
  const results = Array.isArray(batch.results) ? batch.results : [];
  let created = 0, existing = 0, failed = 0;
  for (const r of results) {
    const gi = meta.offset + (r.index || 0);
    const row = job.rows[gi];
    if (!row) continue;
    row.status = r.status || row.status;
    if (r.order_id) row.order_id = r.order_id;
    if (r.order_number) row.order_number = r.order_number;
    if (r.share_url) row.share_url = r.share_url;
    if (r.short_share_url) row.short_share_url = r.short_share_url;
    if (r.bridge_token) row.bridge_token = r.bridge_token;
    if (r.errors) row.error = formatFieldErrors(r.errors);
    if (r.status === 'created') created++;
    else if (r.status === 'existing') existing++;
    else if (r.status === 'failed') failed++;
  }
  meta.created = created;
  meta.existing = existing;
  meta.failed = failed;
}

function failRow(job, gi, error) {
  const row = job.rows[gi];
  if (!row) return;
  row.status = 'failed';
  row.error = error;
}

function isPending(status) {
  return status == null || status === 'pending' || status === 'running' || status === 'processing';
}

function countStatuses(rows) {
  const counts = { created: 0, existing: 0, failed: 0, pending: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status]++;
    else counts.pending++;
  }
  return counts;
}

// Turn a field-keyed errors object ({ first_name: ["This field is required."] }) into
// a short readable string for the results table.
function formatFieldErrors(errors) {
  if (!errors) return null;
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) return errors.join('; ');
  try {
    return Object.entries(errors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
      .join('; ');
  } catch {
    return 'validation error';
  }
}

function extractError(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  return data.error?.message || data.detail || data.message || formatFieldErrors(data.errors) || null;
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Exported for tests.
export { runJob, applyBatchResults, countStatuses, formatFieldErrors, MAX_ROWS, MAX_CHUNK_SIZE };
