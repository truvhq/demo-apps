/**
 * FILE SUMMARY: Automatic Webhook Registration via ngrok
 * DATA FLOW: Server startup --> setupWebhook() --> Truv Webhooks API (register URL)
 * INTEGRATION PATTERN: Used by both Orders and Bridge flows to receive async events.
 *
 * On server startup, registers an ngrok tunnel URL as a webhook endpoint with Truv.
 * This allows the local development server to receive webhook callbacks for order
 * status updates, task completions, and other async events. Cleans up on shutdown.
 */

// Module-level state for the current webhook registration.
// Note: this is per-process, so each demo server manages its own webhook.
let webhookId = null;

// Environment type determines which Truv environment sends webhooks (sandbox/production)
const envType = process.env.TRUV_ENV_TYPE || 'sandbox';

// The webhook name used for registration. Also the lookup key during cleanup so old
// registrations from previous runs are removed before creating a new one.
const WEBHOOK_NAME = 'demo-apps';

// Event types the demos subscribe to.
const WEBHOOK_EVENTS = [
  'task-status-updated',
  'order-status-updated',
  'order-created',
  'order-refresh-failed',
  'link-connected',
  'link-disconnected',
  'link-deleted',
  'employment-created',
  'employment-updated',
  'profile-created',
  'profile-updated',
  'statements-created',
  'statements-updated',
  'shifts-created',
  'shifts-updated',
  'bank-accounts-created',
  'bank-accounts-updated',
];

// Registers a webhook URL with Truv. First deletes any existing demo-apps webhooks
// for this environment to avoid duplicates, then creates a new registration subscribing
// to all relevant event types.
//
// Returns { webhookId, error }:
//   - On success: { webhookId: <id>, error: null }
//   - On failure: { webhookId: null, error: <Truv error body as-is> }
// The Truv error is not swallowed or retried. Callers log it and continue startup so
// the server stays usable even when webhook registration fails (e.g., duplicate URL
// from a previous run that was registered under a different name).
export async function registerWebhook(truvClient, webhookUrl, { env = envType } = {}) {
  // Clean up old demo-apps webhooks to avoid duplicate registrations
  const listResult = await truvClient.listWebhooks();
  if (listResult.statusCode === 200 && listResult.data.results) {
    for (const wh of listResult.data.results) {
      if (wh.name === WEBHOOK_NAME && wh.env_type === env) {
        await truvClient.deleteWebhook(wh.id);
        console.log(`Deleted old ${WEBHOOK_NAME} webhook ${wh.id}`);
      }
    }
  }

  const createResult = await truvClient.createWebhook({
    name: WEBHOOK_NAME,
    webhook_url: webhookUrl,
    env_type: env,
    events: WEBHOOK_EVENTS,
  });

  if (createResult.statusCode === 201) {
    console.log(`Webhook registered: ${webhookUrl} (id: ${createResult.data.id})`);
    return { webhookId: createResult.data.id, error: null };
  }

  // Surface the Truv error as-is so the cause (e.g., "Webhook url for sandbox already
  // registered") is visible in logs instead of being truncated to [Array].
  console.error('Failed to register webhook:', JSON.stringify(createResult.data, null, 2));
  return { webhookId: null, error: createResult.data };
}

// Entry point called at server startup. Reads NGROK_URL from .env and registers
// the webhook. Returns the tunnel URL for display, or null if ngrok is not configured.
export async function setupWebhook({ path, truvClient }) {
  const ngrokUrl = process.env.NGROK_URL;
  if (!ngrokUrl) {
    console.log('NGROK_URL not set — skipping webhook registration. Set it in .env to receive webhooks.');
    return null;
  }

  const webhookUrl = ngrokUrl + path;
  const { webhookId: registeredId } = await registerWebhook(truvClient, webhookUrl);
  webhookId = registeredId;
  return ngrokUrl;
}

// Cleanup function called on SIGINT. Deletes the webhook registration from Truv
// so stale webhooks don't accumulate across server restarts.
export async function teardownWebhook(truvClient) {
  if (webhookId) {
    try {
      await truvClient.deleteWebhook(webhookId);
      console.log(`Webhook ${webhookId} deleted`);
    } catch { /* ignore */ }
  }
}
