import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWebhook } from '../../server/webhook-setup.js';

// Fake TruvClient factory. Each method is a Vitest spy whose return value is set
// per-test via mockResolvedValueOnce so each test owns its Truv API responses.
function makeTruvClient() {
  return {
    listWebhooks: vi.fn(),
    deleteWebhook: vi.fn().mockResolvedValue({ statusCode: 204 }),
    createWebhook: vi.fn(),
  };
}

describe('registerWebhook', () => {
  beforeEach(() => {
    // Silence console output so failing-path logs don't pollute test reporter output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates the webhook and returns the new id on success', async () => {
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({ statusCode: 200, data: { results: [] } });
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 201, data: { id: 'wh-new-123' } });

    const result = await registerWebhook(truv, 'https://tunnel.example/api/webhooks/truv');

    expect(result).toEqual({ webhookId: 'wh-new-123', error: null });
    expect(truv.createWebhook).toHaveBeenCalledOnce();
    const createArgs = truv.createWebhook.mock.calls[0][0];
    expect(createArgs.name).toBe('demo-apps');
    expect(createArgs.webhook_url).toBe('https://tunnel.example/api/webhooks/truv');
    expect(createArgs.env_type).toBe('sandbox');
    expect(Array.isArray(createArgs.events)).toBe(true);
    expect(createArgs.events).toContain('task-status-updated');
  });

  it('deletes existing demo-apps webhooks for the same env before creating a new one', async () => {
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        results: [
          { id: 'wh-old-a', name: 'demo-apps', env_type: 'sandbox' },
          { id: 'wh-old-b', name: 'demo-apps', env_type: 'sandbox' },
          { id: 'wh-other', name: 'demo-apps', env_type: 'prod' },      // different env: keep
          { id: 'wh-keep', name: 'someone-else', env_type: 'sandbox' }, // different name: keep
        ],
      },
    });
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 201, data: { id: 'wh-new' } });

    await registerWebhook(truv, 'https://tunnel.example/api/webhooks/truv');

    expect(truv.deleteWebhook).toHaveBeenCalledTimes(2);
    expect(truv.deleteWebhook).toHaveBeenCalledWith('wh-old-a');
    expect(truv.deleteWebhook).toHaveBeenCalledWith('wh-old-b');
    expect(truv.deleteWebhook).not.toHaveBeenCalledWith('wh-other');
    expect(truv.deleteWebhook).not.toHaveBeenCalledWith('wh-keep');
  });

  it('returns the Truv error as-is when the URL is already registered for this env', async () => {
    // Simulates the case where a prior run registered the same ngrok URL under a
    // different name (e.g., the old "quickstart") and cleanup didn't touch it.
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({ statusCode: 200, data: { results: [] } });
    const truvError = {
      error: {
        code: 'incorrect_parameters',
        message: 'Incorrect request parameters',
        extra: {
          'invalid-params': [
            { field: 'env_type', message: 'Webhook url for sandbox already registered' },
          ],
        },
      },
    };
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 400, data: truvError });

    const result = await registerWebhook(truv, 'https://tunnel.example/api/webhooks/truv');

    expect(result.webhookId).toBeNull();
    expect(result.error).toBe(truvError); // full body passed through, not re-wrapped
    expect(truv.deleteWebhook).not.toHaveBeenCalled();
  });

  it('logs the full Truv error payload so nested invalid-params are visible', async () => {
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({ statusCode: 200, data: { results: [] } });
    const truvError = {
      error: {
        code: 'incorrect_parameters',
        extra: {
          'invalid-params': [{ field: 'env_type', message: 'Webhook url for sandbox already registered' }],
        },
      },
    };
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 400, data: truvError });
    const errorSpy = vi.spyOn(console, 'error');

    await registerWebhook(truv, 'https://tunnel.example/api/webhooks/truv');

    // The payload must be logged in full (pretty-printed JSON), not truncated to [Array]
    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).toContain('Failed to register webhook');
    expect(logged).toContain('Webhook url for sandbox already registered');
    expect(logged).toContain('invalid-params');
  });

  it('proceeds with registration when listWebhooks fails', async () => {
    // A broken list endpoint shouldn't prevent creating a fresh webhook
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({ statusCode: 500, data: { error: 'upstream' } });
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 201, data: { id: 'wh-new' } });

    const result = await registerWebhook(truv, 'https://tunnel.example/api/webhooks/truv');

    expect(truv.deleteWebhook).not.toHaveBeenCalled();
    expect(result).toEqual({ webhookId: 'wh-new', error: null });
  });

  it('honors a custom env option and only deletes webhooks for that env', async () => {
    const truv = makeTruvClient();
    truv.listWebhooks.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        results: [
          { id: 'wh-prod', name: 'demo-apps', env_type: 'prod' },
          { id: 'wh-sandbox', name: 'demo-apps', env_type: 'sandbox' },
        ],
      },
    });
    truv.createWebhook.mockResolvedValueOnce({ statusCode: 201, data: { id: 'wh-new' } });

    await registerWebhook(truv, 'https://prod.example/api/webhooks/truv', { env: 'prod' });

    expect(truv.deleteWebhook).toHaveBeenCalledTimes(1);
    expect(truv.deleteWebhook).toHaveBeenCalledWith('wh-prod');
    expect(truv.createWebhook.mock.calls[0][0].env_type).toBe('prod');
  });
});
