import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconAntenna, IconClock } from "@tabler/icons-react";
import type { WebhookEventEntry } from "@/lib/types";

interface MonitorScreenProps {
  webhooks: WebhookEventEntry[];
  orderId: string | null;
}

export function MonitorScreen({ webhooks, orderId }: MonitorScreenProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live Progress Monitor</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Watching for webhook events in real-time as the applicant completes verification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Listening</span>
        </div>
      </div>

      {orderId && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Order: <code className="bg-muted px-1 rounded">{orderId}</code>
          </p>
        </div>
      )}

      <ScrollArea className="h-[400px]">
        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <IconAntenna size={32} className="animate-pulse" />
            <p className="text-sm">Waiting for webhook events...</p>
            <p className="text-xs max-w-sm text-center">
              Events will appear here as the applicant progresses through
              the verification flow on their device.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((wh, i) => (
              <Card key={wh.id || i}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        WEBHOOK
                      </Badge>
                      <span className="text-sm font-medium">{wh.event_type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {wh.status && (
                        <Badge variant="secondary" className="text-xs">
                          {wh.status}
                        </Badge>
                      )}
                      {wh.received_at && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <IconClock size={12} />
                          {new Date(wh.received_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
