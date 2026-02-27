import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ApiCallEntry } from "./api-call-entry";
import { WebhookEntry } from "./webhook-entry";
import { DocsLink } from "./docs-link";
import { JsonBlock } from "./json-viewer";
import { Code2, Radio, BookOpen, Zap, Download } from "lucide-react";
import type {
  ApiLogEntry,
  WebhookEventEntry,
  BridgeEvent,
  DemoStep,
} from "@/lib/types";

interface ApiPanelProps {
  step: DemoStep;
  apiLogs: ApiLogEntry[];
  webhooks: WebhookEventEntry[];
  bridgeEvents: BridgeEvent[];
}

function BridgeEventEntry({ event }: { event: BridgeEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const colorMap: Record<string, string> = {
    onSuccess: "bg-green-100 text-green-700 border-green-200",
    onClose: "bg-gray-100 text-gray-700 border-gray-200",
    onError: "bg-red-100 text-red-700 border-red-200",
    onEvent: "bg-blue-100 text-blue-700 border-blue-200",
    onLoad: "bg-purple-100 text-purple-700 border-purple-200",
  };
  const color = colorMap[event.type] || colorMap.onEvent;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={`text-[10px] ${color}`}>
          {event.type}
        </Badge>
        <span className="text-[10px] text-muted-foreground font-mono">
          {time}
        </span>
      </div>
      {event.data && <JsonBlock data={event.data} />}
    </div>
  );
}

export function ApiPanel({
  step,
  apiLogs,
  webhooks,
  bridgeEvents,
}: ApiPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs defaultValue="intro" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-3 pb-0 flex-shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="intro" className="flex-1 gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Guide
            </TabsTrigger>
            <TabsTrigger value="api" className="flex-1 gap-1.5">
              <Code2 className="h-3.5 w-3.5" />
              API
              {apiLogs.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] ml-1"
                >
                  {apiLogs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="bridge" className="flex-1 gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Bridge
              {bridgeEvents.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] ml-1"
                >
                  {bridgeEvents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex-1 gap-1.5">
              <Radio className="h-3.5 w-3.5" />
              Webhooks
              {webhooks.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] ml-1"
                >
                  {webhooks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="intro" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              <div>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {step.backendAction && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Backend Action
                  </p>
                  <code className="text-xs bg-background px-2 py-1 rounded border font-mono inline-block">
                    {step.backendAction}
                  </code>
                </div>
              )}

              {step.docsLinks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Documentation
                  </p>
                  <div className="space-y-1.5">
                    {step.docsLinks.map((link) => (
                      <DocsLink
                        key={link.url}
                        label={link.label}
                        url={link.url}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Resources
                </p>
                <a
                  href="/postman/truv-public-sector.postman_collection.json"
                  download
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Postman Collection
                </a>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="api" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {apiLogs.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Code2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No API calls yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Interact with the demo to trigger real Truv API calls.
                  </p>
                </div>
              ) : (
                apiLogs.map((log) => (
                  <ApiCallEntry key={log.id} log={log} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="bridge" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {bridgeEvents.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Zap className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No Bridge events yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bridge callback events (onLoad, onEvent, onSuccess, onClose,
                    onError) appear here in real-time as the user interacts with
                    the widget.
                  </p>
                </div>
              ) : (
                bridgeEvents.map((event) => (
                  <BridgeEventEntry key={event.id} event={event} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="webhooks" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {webhooks.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Radio className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No webhooks received yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Webhooks stream in real-time as the applicant progresses.
                    Requires ngrok or a public URL for Truv to reach your
                    backend.
                  </p>
                </div>
              ) : (
                webhooks.map((event) => (
                  <WebhookEntry key={event.id} event={event} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
