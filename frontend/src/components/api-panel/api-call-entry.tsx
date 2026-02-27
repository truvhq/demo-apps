import type { ApiLogEntry } from "@/lib/types";
import { MethodBadge } from "./method-badge";
import { JsonViewer } from "./json-viewer";
import { Badge } from "@/components/ui/badge";
import { IconClock } from "@tabler/icons-react";

export function ApiCallEntry({ log }: { log: ApiLogEntry }) {
  const isSuccess = log.status_code && log.status_code >= 200 && log.status_code < 300;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MethodBadge method={log.method} />
          <span className="text-xs font-mono truncate">{log.endpoint}</span>
        </div>
        <div className="flex items-center gap-2">
          {log.status_code && (
            <Badge variant={isSuccess ? "default" : "destructive"} className="text-[10px]">
              {log.status_code}
            </Badge>
          )}
          {log.duration_ms && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <IconClock size={10} />
              {log.duration_ms}ms
            </span>
          )}
        </div>
      </div>

      {log.request_body && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 uppercase font-medium">Request</p>
          <JsonViewer data={log.request_body} />
        </div>
      )}

      {log.response_body && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 uppercase font-medium">Response</p>
          <JsonViewer data={log.response_body} />
        </div>
      )}
    </div>
  );
}
