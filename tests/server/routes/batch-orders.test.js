import { describe, it, expect, vi } from 'vitest';
import {
  buildOrder,
  chunkRows,
  applyBatchResults,
  countStatuses,
  formatFieldErrors,
  runJob,
} from '../../../server/routes/batch-orders.js';

const noopLogger = { logApiCall: vi.fn() };

describe('buildOrder', () => {
  it('always sends products + first/last name', () => {
    const o = buildOrder({ first_name: 'Maria', last_name: 'Lopez' }, 'income');
    expect(o.products).toEqual(['income']);
    expect(o.first_name).toBe('Maria');
    expect(o.last_name).toBe('Lopez');
  });

  it('puts company_name inside employers[] for employer products', () => {
    expect(buildOrder({ first_name: 'A', last_name: 'B', company_name: 'Starbucks' }, 'income').employers)
      .toEqual([{ company_name: 'Starbucks' }]);
    expect(buildOrder({ first_name: 'A', last_name: 'B', company_name: 'Starbucks' }, 'employment').employers)
      .toEqual([{ company_name: 'Starbucks' }]);
  });

  it('does NOT attach employers for non-employer products (the API rejects it)', () => {
    const o = buildOrder({ first_name: 'A', last_name: 'B', company_name: 'Chase' }, 'assets');
    expect(o).not.toHaveProperty('employers');
  });

  it('omits optional fields when blank', () => {
    const o = buildOrder({ first_name: 'A', last_name: 'B', email: '', phone: '  ' }, 'income');
    expect(o).not.toHaveProperty('email');
    expect(o).not.toHaveProperty('phone');
    expect(o).not.toHaveProperty('employers');
  });

  it('respects a provided order_number (enables duplicate detection)', () => {
    const o = buildOrder({ first_name: 'A', last_name: 'B', order_number: 'CASE-1001' }, 'income');
    expect(o.order_number).toBe('CASE-1001');
  });

  it('generates an order_number when none is supplied (fresh runs never collide)', () => {
    const o = buildOrder({ first_name: 'A', last_name: 'B' }, 'income');
    expect(o.order_number).toMatch(/^batch-/);
  });

  it('adds notification_settings only when notify is set, suppress winning over delay', () => {
    expect(buildOrder({ first_name: 'A', last_name: 'B' }, 'income')).not.toHaveProperty('notification_settings');
    expect(buildOrder({ first_name: 'A', last_name: 'B' }, 'income', { suppress: false, delayHours: 0 }))
      .not.toHaveProperty('notification_settings');
    expect(buildOrder({ first_name: 'A', last_name: 'B' }, 'income', { suppress: false, delayHours: 6 }).notification_settings)
      .toEqual({ first_notification_delay_hours: 6 });
    expect(buildOrder({ first_name: 'A', last_name: 'B' }, 'income', { suppress: true, delayHours: 6 }).notification_settings)
      .toEqual({ suppress_user_notifications: true });
  });

  it('splits cc_emails from a string and from an array', () => {
    expect(buildOrder({ first_name: 'A', last_name: 'B', cc_emails: 'x@e.org; y@e.org' }, 'income').cc_emails)
      .toEqual(['x@e.org', 'y@e.org']);
    expect(buildOrder({ first_name: 'A', last_name: 'B', cc_emails: ['x@e.org'] }, 'income').cc_emails)
      .toEqual(['x@e.org']);
  });
});

describe('chunkRows', () => {
  it('splits into consecutive chunks of at most size', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns a single chunk when size >= length', () => {
    expect(chunkRows([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('formatFieldErrors', () => {
  it('flattens a field-keyed error object', () => {
    expect(formatFieldErrors({ first_name: ['This field is required.'] }))
      .toBe('first_name: This field is required.');
  });
  it('passes strings through and joins arrays', () => {
    expect(formatFieldErrors('nope')).toBe('nope');
    expect(formatFieldErrors(['a', 'b'])).toBe('a; b');
  });
});

describe('applyBatchResults', () => {
  it('folds per-order results onto global rows by offset + index', () => {
    const job = { rows: Array.from({ length: 4 }, (_, i) => ({ global_index: i, status: 'pending', order_id: null, share_url: null })) };
    const meta = { offset: 2, created: 0, existing: 0, failed: 0 };
    applyBatchResults(job, meta, {
      results: [
        { index: 0, status: 'created', order_id: 'ord_1', share_url: 'https://s/1' },
        { index: 1, status: 'failed', errors: { first_name: ['required'] } },
      ],
    });
    expect(job.rows[2]).toMatchObject({ status: 'created', order_id: 'ord_1', share_url: 'https://s/1' });
    expect(job.rows[3]).toMatchObject({ status: 'failed', error: 'first_name: required' });
    expect(meta).toMatchObject({ created: 1, failed: 1, existing: 0 });
  });
});

describe('countStatuses', () => {
  it('tallies each status, bucketing unknown as pending', () => {
    const rows = [{ status: 'created' }, { status: 'existing' }, { status: 'failed' }, { status: 'created' }, { status: 'weird' }];
    expect(countStatuses(rows)).toEqual({ created: 2, existing: 1, failed: 1, pending: 1 });
  });
});

// --- Full runner (immediate-completion path, no polling delays) ---

function makeJob(orders, { chunkSize = 2, concurrency = 1, delayMs = 0 } = {}) {
  const chunks = chunkRows(orders, chunkSize);
  const job = {
    id: 'j', status: 'running', product: 'income',
    chunk_size: chunkSize, concurrency, delay_ms: delayMs, template_id: null, session_id: null,
    total: orders.length, chunk_count: chunks.length,
    rows: orders.map((o, i) => ({ global_index: i, input_name: `${o.first_name} ${o.last_name}`.trim(), order_number: o.order_number, status: 'pending', order_id: null, share_url: null, short_share_url: null, error: null })),
    chunks: chunks.map((c, i) => ({ index: i, size: c.length, offset: i * chunkSize, batch_id: null, status: 'queued', created: 0, existing: 0, failed: 0, duration_ms: null, error: null, webhook: null })),
    processed_chunks: 0, created_at: Date.now(),
  };
  return { job, chunks };
}

describe('runJob', () => {
  it('processes every chunk and folds results, marking the job completed', async () => {
    const orders = Array.from({ length: 5 }, (_, i) => buildOrder({ first_name: `F${i}`, last_name: 'L' }, 'income'));
    const { job, chunks } = makeJob(orders, { chunkSize: 2, concurrency: 2 });

    let batchSeq = 0;
    const truv = {
      createBatchOrders: vi.fn(async (orderList) => {
        const id = `batch_${batchSeq++}`;
        return {
          statusCode: 202,
          durationMs: 1,
          requestBody: { orders: orderList },
          data: {
            id,
            status: 'completed',
            results: orderList.map((_, idx) => ({ index: idx, status: 'created', order_id: `${id}_o${idx}`, share_url: `https://s/${id}/${idx}` })),
          },
        };
      }),
      getBatchJob: vi.fn(),
    };

    await runJob({ job, chunks, truv, apiLogger: noopLogger });

    expect(job.status).toBe('completed');
    expect(job.processed_chunks).toBe(3);                 // 2 + 2 + 1
    expect(truv.createBatchOrders).toHaveBeenCalledTimes(3);
    expect(truv.getBatchJob).not.toHaveBeenCalled();       // completed inline, no poll
    expect(countStatuses(job.rows)).toEqual({ created: 5, existing: 0, failed: 0, pending: 0 });
    expect(job.chunks.every(c => c.status === 'completed')).toBe(true);
    expect(job.chunks.every(c => c.batch_id)).toBe(true);
  });

  it('reports a whole chunk failed on an HTTP error without aborting the run', async () => {
    const orders = Array.from({ length: 4 }, (_, i) => buildOrder({ first_name: `F${i}`, last_name: 'L' }, 'income'));
    const { job, chunks } = makeJob(orders, { chunkSize: 2, concurrency: 1 });

    let call = 0;
    const truv = {
      createBatchOrders: vi.fn(async (orderList) => {
        call++;
        if (call === 1) return { statusCode: 400, durationMs: 1, requestBody: {}, data: { detail: 'bad request' } };
        return {
          statusCode: 202, durationMs: 1, requestBody: {},
          data: { id: 'batch_ok', status: 'completed', results: orderList.map((_, idx) => ({ index: idx, status: 'created', order_id: `o${idx}` })) },
        };
      }),
      getBatchJob: vi.fn(),
    };

    await runJob({ job, chunks, truv, apiLogger: noopLogger });

    expect(job.status).toBe('completed');                  // run still finishes
    expect(job.chunks[0]).toMatchObject({ status: 'failed', error: 'bad request' });
    expect(job.chunks[1].status).toBe('completed');
    const counts = countStatuses(job.rows);
    expect(counts.failed).toBe(2);                          // the bad chunk's rows
    expect(counts.created).toBe(2);                         // the good chunk's rows
  });
});
