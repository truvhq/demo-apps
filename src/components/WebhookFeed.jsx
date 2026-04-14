/**
 * FILE SUMMARY: WebhookFeed and WaitingScreen
 * DATA FLOW: usePanel() polls GET /api/webhooks -> webhooks array -> WebhookFeed renders each event
 * INTEGRATION PATTERN: Used by both Orders and Bridge flows via Panel sidebar and OrderWaitingScreen
 *
 * WebhookFeed renders a list of webhook events showing event type, status, and timestamp.
 * WaitingScreen wraps WebhookFeed with a spinner and explanatory text for use on the
 * OrderWaitingScreen while Truv processes a verification in the background.
 */

// Utility: safely parse a webhook payload from string or object form
export function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// WebhookFeed: renders webhook events in reverse chronological order.
// Each event shows a colored status dot, human-readable event type, and timestamp.
export function WebhookFeed({ webhooks }) {
  // Empty state when no webhooks have been received yet
  if (!webhooks.length) {
    return <div class="text-center text-sm text-gray-400">No webhooks received yet...</div>;
  }

  // Reverse to show newest events first
  const reversed = [...webhooks].reverse();

  return (
    <div class="text-left w-full max-w-md">
      {reversed.map((w, i) => {
        // Extract fields from payload or top-level webhook object
        const payload = parsePayload(w.payload);
        const eventType = payload.event_type || w.event_type || 'unknown';
        const status = payload.status || w.status || '';
        const ts = payload.event_created_at || payload.updated_at || w.received_at || '';
        const timeStr = ts ? new Date(ts).toLocaleTimeString() : '';
        // Color coding: green for completed/done, yellow for pending, blue otherwise
        const dotColor = status === 'completed' || status === 'done' ? 'bg-success'
          : status === 'pending' ? 'bg-warning'
          : 'bg-blue-500';

        return (
          <div key={i} class="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-100 rounded-lg mb-2 text-sm animate-fadeIn">
            <div class={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
            <span class="flex-1 font-medium">{eventType.replace(/-/g, ' ')}</span>
            <span class="text-xs text-gray-400">{timeStr}</span>
          </div>
        );
      })}
    </div>
  );
}

// WaitingScreen: full-page waiting state used by OrderWaitingScreen.
// Shows a spinner, heading, description, and a live WebhookFeed below.
export function WaitingScreen({ webhooks }) {
  return (
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {/* Spinner animation */}
      <div class="w-[4.5rem] h-[4.5rem] mb-7">
        <div class="w-[4.5rem] h-[4.5rem] border-[3px] border-border border-t-primary rounded-full animate-spin" />
      </div>
      <h2 class="text-2xl font-bold tracking-tight mb-2">Waiting for webhooks</h2>
      <p class="text-sm text-gray-500 leading-relaxed max-w-sm mb-9">
        Truv sends webhook events as the verification progresses. Watch them arrive in real time.
      </p>
      {/* Live webhook event feed */}
      <WebhookFeed webhooks={webhooks} />
    </div>
  );
}
