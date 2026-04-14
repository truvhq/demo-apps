import { describe, it, expect, vi } from 'vitest';

// Mock direct imports used by useReportFetch (no longer via barrel)
vi.mock('../../src/components/hooks.js', () => ({
  API_BASE: 'http://localhost:3000',
}));
vi.mock('../../src/components/WebhookFeed.jsx', () => ({
  parsePayload(raw) {
    if (!raw) return {};
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  },
}));

import { getReportTypes, checkWebhookDone, WEBHOOK_EVENTS } from '../../src/components/useReportFetch.js';

// ---------------------------------------------------------------------------
// WEBHOOK_EVENTS constants
// ---------------------------------------------------------------------------
describe('WEBHOOK_EVENTS', () => {
  it('exports TASK and ORDER constants', () => {
    expect(WEBHOOK_EVENTS.TASK).toBe('task');
    expect(WEBHOOK_EVENTS.ORDER).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// getReportTypes
// ---------------------------------------------------------------------------
describe('getReportTypes', () => {
  it('returns [] for empty input', () => {
    expect(getReportTypes([])).toEqual([]);
  });

  it('returns ["income"] for income product', () => {
    expect(getReportTypes(['income'])).toEqual(['income']);
  });

  it('auto-pairs assets with income_insights', () => {
    expect(getReportTypes(['assets'])).toEqual(['assets', 'income_insights']);
  });

  it('includes income_insights when both income and assets are present', () => {
    expect(getReportTypes(['income', 'assets'])).toEqual([
      'income',
      'assets',
      'income_insights',
    ]);
  });

  it('does NOT duplicate income_insights when already in the list', () => {
    const result = getReportTypes(['assets', 'income_insights']);
    expect(result).toEqual(['assets', 'income_insights']);
  });

  it('returns ["employment"] for employment product', () => {
    expect(getReportTypes(['employment'])).toEqual(['employment']);
  });

  it('returns ["deposit_switch"] for deposit_switch product', () => {
    expect(getReportTypes(['deposit_switch'])).toEqual(['deposit_switch']);
  });

  it('handles mixed products without auto-pairing side effects', () => {
    expect(getReportTypes(['income', 'deposit_switch'])).toEqual([
      'income',
      'deposit_switch',
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkWebhookDone
// ---------------------------------------------------------------------------
describe('checkWebhookDone', () => {
  it('returns true for task-status-updated:done (top-level fields)', () => {
    const webhooks = [
      { event_type: 'task-status-updated', status: 'done', payload: null },
    ];
    expect(checkWebhookDone(webhooks, 'task')).toBe(true);
  });

  it('returns true for order-status-updated:completed (top-level fields)', () => {
    const webhooks = [
      { event_type: 'order-status-updated', status: 'completed', payload: null },
    ];
    expect(checkWebhookDone(webhooks, 'order')).toBe(true);
  });

  it('returns false for an empty webhooks array', () => {
    expect(checkWebhookDone([], 'task')).toBe(false);
  });

  it('returns false when webhookEvent is null', () => {
    const webhooks = [
      { event_type: 'task-status-updated', status: 'done', payload: null },
    ];
    expect(checkWebhookDone(webhooks, null)).toBe(false);
  });

  it('returns false when webhookEvent is undefined', () => {
    const webhooks = [
      { event_type: 'task-status-updated', status: 'done', payload: null },
    ];
    expect(checkWebhookDone(webhooks, undefined)).toBe(false);
  });

  it('works when event data is inside a JSON payload string', () => {
    const webhooks = [
      {
        payload: JSON.stringify({
          event_type: 'task-status-updated',
          status: 'done',
        }),
      },
    ];
    expect(checkWebhookDone(webhooks, 'task')).toBe(true);
  });

  it('works with parsed payload for order webhookEvent', () => {
    const webhooks = [
      {
        payload: JSON.stringify({
          event_type: 'order-status-updated',
          status: 'completed',
        }),
      },
    ];
    expect(checkWebhookDone(webhooks, 'order')).toBe(true);
  });

  it('returns false when event_type matches but status does not', () => {
    const webhooks = [
      { event_type: 'task-status-updated', status: 'pending', payload: null },
    ];
    expect(checkWebhookDone(webhooks, 'task')).toBe(false);
  });

  it('returns false when status matches but event_type does not', () => {
    const webhooks = [
      { event_type: 'some-other-event', status: 'done', payload: null },
    ];
    expect(checkWebhookDone(webhooks, 'task')).toBe(false);
  });
});
