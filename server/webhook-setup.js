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

// Registers a webhook URL with Truv. First deletes any existing demo-apps webhooks
// for this environment to avoid duplicates, then creates a new registration
// subscribing to all relevant event types.
async function registerWebhook(truvClient, webhookUrl) {
  // Clean up old demo-apps webhooks to avoid duplicate registrations
  const listResult = await truvClient.listWebhooks();
  if (listResult.statusCode === 200 && listResult.data.results) {
    for (const wh of listResult.data.results) {
      if (wh.name === 'demo-apps' && wh.env_type === envType) {
        await truvClient.deleteWebhook(wh.id);
        console.log(`Deleted old demo-apps webhook ${wh.id}`);
      }
    }
  }

  // Create a new webhook registration with all event types used by the demos
  const createResult = await truvClient.createWebhook({
    name: 'demo-apps',
    webhook_url: webhookUrl,
    env_type: envType,
    events: [
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
    ],
  });

  if (createResult.statusCode === 201) {
    webhookId = createResult.data.id;
    console.log(`Webhook registered: ${webhookUrl} (id: ${webhookId})`);
  } else {
    console.error('Failed to register webhook:', createResult.data);
  }
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
  await registerWebhook(truvClient, webhookUrl);
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
