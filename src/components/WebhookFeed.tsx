import type { WebhookEventRow } from './hooks';

export function parsePayload(raw: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

export function WebhookFeed({ webhooks }: { webhooks: WebhookEventRow[] }) {
  if (!webhooks.length) {
    return <div class="text-center text-sm text-gray-400">No webhooks received yet...</div>;
  }

  const reversed = [...webhooks].reverse();

  return (
    <div class="text-left w-full max-w-md">
      {reversed.map((w, i) => {
        const payload = parsePayload(w.payload);
        const eventType = (payload.event_type as string | undefined) ?? w.event_type ?? 'unknown';
        const status = (payload.status as string | undefined) ?? w.status ?? '';
        const ts = (payload.event_created_at as string | undefined) ?? (payload.updated_at as string | undefined) ?? w.received_at ?? '';
        const timeStr = ts ? new Date(ts).toLocaleTimeString() : '';
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

export function WaitingScreen({ webhooks }: { webhooks: WebhookEventRow[] }) {
  return (
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div class="w-[4.5rem] h-[4.5rem] mb-7">
        <div class="w-[4.5rem] h-[4.5rem] border-[3px] border-border border-t-primary rounded-full animate-spin" />
      </div>
      <h2 class="text-2xl font-bold tracking-tight mb-2">Waiting for webhooks</h2>
      <p class="text-sm text-gray-500 leading-relaxed max-w-sm mb-9">
        Truv sends webhook events as the verification progresses. Watch them arrive in real time.
      </p>
      <WebhookFeed webhooks={webhooks} />
    </div>
  );
}
