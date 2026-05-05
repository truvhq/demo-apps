/**
 * FILE SUMMARY: Coverage Analysis bulk-lookup routes.
 * DATA FLOW: Frontend uploads CSV --> POST /api/coverage/:kind/jobs creates a job
 *            --> background runner batches Truv company-mappings-search / providers
 *                calls with concurrency + retries
 *            --> Frontend polls GET .../jobs/:id and downloads .../jobs/:id/csv.
 * INTEGRATION PATTERN: Standalone bulk processor; reuses TruvClient.searchCompanies
 *                      and searchProviders. Job state is in-memory (per server process).
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { serializeCsv } from '../lib/csv.js';

// Runner config: gentle concurrency + exponential backoff for 429 / 5xx.
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1000, 2000, 4000, 8000];
const COOLDOWN_MS = 5000;
const COOLDOWN_TRIGGER = 3; // consecutive 429s
const MAX_ROWS = 10_000;

// Per docs: product_type ∈ income | employment | deposit_switch | pll | insurance | transactions | assets | admin.
// Bank coverage is keyed off data_source=financial_accounts, so the relevant products are transactions + assets.
const PAYROLL_PRODUCTS = new Set(['income', 'employment', 'deposit_switch', 'pll', 'insurance', 'admin']);
const BANK_PRODUCTS = new Set(['transactions', 'assets']);

// Output column order for the result table + CSV export.
const PAYROLL_COLUMNS = ['input_name', 'input_state', 'input_domain', 'status', 'match_name', 'match_id', 'match_domain', 'match_logo_url', 'success_rate', 'confidence_level', 'error'];
const BANK_COLUMNS    = ['input_name', 'input_domain', 'status', 'match_name', 'match_id', 'match_domain', 'match_logo_url', 'success_rate', 'confidence_level', 'error'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function coverageAnalysisRoutes({ truv, apiLogger }) {
  const router = Router();
  const jobs = new Map();

  // POST /api/coverage/:kind/jobs — accept rows + product type, kick off async processing.
  router.post('/api/coverage/:kind/jobs', (req, res) => {
    const { kind } = req.params;
    if (kind !== 'payroll' && kind !== 'bank') return res.status(404).json({ error: 'Unknown kind' });

    const { rows, product_type, session_id } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' });
    if (rows.length > MAX_ROWS) return res.status(413).json({ error: `Max ${MAX_ROWS} rows` });

    const validProducts = kind === 'payroll' ? PAYROLL_PRODUCTS : BANK_PRODUCTS;
    if (product_type && !validProducts.has(product_type)) return res.status(400).json({ error: `Invalid product_type for ${kind}` });

    const jobId = uuidv4();
    const job = {
      id: jobId,
      kind,
      product_type: product_type || null,
      session_id: session_id || null,
      status: 'running',
      total: rows.length,
      processed: 0,
      results: rows.map((r, i) => ({ index: i, status: 'pending', input_name: r.name || '', input_state: r.state || '', input_domain: r.domain || '' })),
      created_at: Date.now(),
    };
    jobs.set(jobId, job);

    runJob({ job, truv, apiLogger }).catch(err => {
      console.error('Coverage job failed:', err);
      job.status = 'failed';
      job.error = err.message;
    });

    res.json({ job_id: jobId, total: job.total });
  });

  // GET /api/coverage/:kind/jobs/:id — poll status + partial results.
  router.get('/api/coverage/:kind/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.kind !== req.params.kind) return res.status(404).json({ error: 'Not found' });
    res.json({
      job_id: job.id,
      status: job.status,
      total: job.total,
      processed: job.processed,
      product_type: job.product_type,
      rows: job.results,
      error: job.error || null,
    });
  });

  // GET /api/coverage/:kind/jobs/:id/csv — download CSV of completed results.
  router.get('/api/coverage/:kind/jobs/:id/csv', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.kind !== req.params.kind) return res.status(404).json({ error: 'Not found' });
    const cols = job.kind === 'payroll' ? PAYROLL_COLUMNS : BANK_COLUMNS;
    const csv = serializeCsv(job.results, cols);
    const filename = `${job.kind}_coverage_${job.id.slice(0, 8)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  return router;
}

// Runs a job to completion: spawns CONCURRENCY workers that pull from a shared cursor.
// Each worker performs one Truv lookup per row, with retries + cooldown after consecutive 429s.
// Rows that exhaust retries due to rate limiting get a second pass after the cooldown clears.
async function runJob({ job, truv, apiLogger }) {
  let cursor = 0;
  // Shared throttle state. `gate` is a Promise that, when set, every worker awaits before its
  // next attempt — so a cooldown pauses the whole pool, not just the worker that tripped it.
  const throttle = { consecutive: 0, gate: null };

  async function processRow(row) {
    if (!row.input_name) {
      row.status = 'error';
      row.error = 'missing name';
      row.confidence = 'n/a';
      return;
    }
    try {
      const lookup = await lookupWithRetry({ job, row, truv, apiLogger, throttle });
      applyResult(job, row, lookup);
    } catch (err) {
      row.status = 'error';
      row.error = err.message || String(err);
      row._throttled = err.throttled === true;
    }
  }

  async function worker() {
    while (cursor < job.results.length) {
      const i = cursor++;
      await processRow(job.results[i]);
      job.processed++;
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, job.results.length) }, () => worker());
  await Promise.all(workers);

  // Second pass: rows whose retries were exhausted by 429s get one more chance,
  // sequentially so we don't immediately re-trip the rate limit.
  const throttled = job.results.filter(r => r._throttled);
  for (const row of throttled) {
    if (throttle.gate) await throttle.gate;
    job.processed--;
    row._throttled = false;
    row.error = null;
    row.status = 'pending';
    await processRow(row);
    job.processed++;
  }
  for (const row of job.results) delete row._throttled;

  job.status = 'completed';
  job.completed_at = Date.now();
}

// Calls the right Truv search method with retry/backoff.
async function lookupWithRetry({ job, row, truv, apiLogger, throttle }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Respect a global cooldown opened by any worker.
    if (throttle.gate) await throttle.gate;

    const result = job.kind === 'payroll'
      ? await truv.lookupCompany({
          name: row.input_name,
          domain: row.input_domain || undefined,
          state: row.input_state || undefined,
          product_type: job.product_type || undefined,
        })
      : await truv.searchProviders(row.input_name, job.product_type || undefined, 'financial_accounts');

    const endpoint = job.kind === 'payroll'
      ? '/v1/companies/'
      : `/v1/providers/?query=${encodeURIComponent(row.input_name)}&data_source=financial_accounts${job.product_type ? `&product_type=${job.product_type}` : ''}`;

    apiLogger.logApiCall({
      sessionId: job.session_id,
      method: job.kind === 'payroll' ? 'POST' : 'GET',
      endpoint,
      requestBody: job.kind === 'payroll' ? result.requestBody : undefined,
      responseBody: result.data,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    });

    if (result.statusCode < 400) {
      throttle.consecutive = 0;
      return result;
    }

    if ((result.statusCode === 429 || result.statusCode >= 500) && attempt < MAX_ATTEMPTS - 1) {
      if (result.statusCode === 429) {
        throttle.consecutive++;
        if (throttle.consecutive >= COOLDOWN_TRIGGER && !throttle.gate) {
          // Trip the cooldown for the entire worker pool.
          throttle.gate = sleep(COOLDOWN_MS).then(() => {
            throttle.gate = null;
            throttle.consecutive = 0;
          });
        }
      }
      // Wait for the global cooldown if it's open; otherwise per-attempt backoff.
      if (throttle.gate) await throttle.gate;
      else await sleep(BACKOFF_MS[attempt]);
      continue;
    }

    // 4xx other than 429, or retryable error on the final attempt — not retryable.
    if (result.statusCode === 429) {
      const err = new Error('rate limited (retries exhausted)');
      err.throttled = true;
      throw err;
    }
    const msg = result.data?.error?.message || result.data?.detail || `HTTP ${result.statusCode}`;
    throw new Error(msg);
  }
  const err = new Error('max retries exceeded');
  err.throttled = true;
  throw err;
}

// Map a Truv response onto the row's status/match_* fields.
// Uses the API's own confidence_level + success_rate verbatim, no derivation.
function applyResult(job, row, result) {
  // Both endpoints return either a top-level array or a wrapped { results: [...] }.
  // POST /v1/companies/ may also return a single object.
  const data = result.data;
  let matches = [];
  if (Array.isArray(data)) matches = data;
  else if (Array.isArray(data?.results)) matches = data.results;
  else if (data && typeof data === 'object' && (data.company_mapping_id || data.id || data.name)) matches = [data];

  if (!matches.length) {
    row.status = 'not_found';
    row.match_name = '';
    row.match_id = '';
    row.match_domain = '';
    row.match_logo_url = '';
    row.success_rate = '';
    row.confidence_level = '';
    return;
  }

  const top = matches[0];
  row.status = 'covered';
  row.match_name = top.name || '';
  row.match_id = top.company_mapping_id || top.id || '';
  row.match_domain = top.domain || '';
  row.match_logo_url = top.logo_url || '';
  row.success_rate = top.success_rate ?? '';
  row.confidence_level = top.confidence_level ?? '';
}
