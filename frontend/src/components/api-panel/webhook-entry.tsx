import type { WebhookEventEntry } from "@/lib/types";
import { MethodBadge } from "./method-badge";
import { JsonViewer } from "./json-viewer";
import { IconClock } from "@tabler/icons-react";

export function WebhookEntry({ event }: { event: WebhookEventEntry }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MethodBadge method="WEBHOOK" />
          <span className="text-xs font-medium">{event.event_type}</span>
        </div>
        {event.received_at && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <IconClock size={10} />
            {new Date(event.received_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      <JsonViewer data={event.payload} />
    </div>
  );
}
