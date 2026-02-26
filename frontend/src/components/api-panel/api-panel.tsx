import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiCallEntry } from "./api-call-entry";
import { WebhookEntry } from "./webhook-entry";
import { DocsLink } from "./docs-link";
import type { ApiLogEntry, WebhookEventEntry, DemoStep } from "@/lib/types";

interface ApiPanelProps {
  step: DemoStep;
  apiLogs: ApiLogEntry[];
  webhooks: WebhookEventEntry[];
}

export function ApiPanel({ step, apiLogs, webhooks }: ApiPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="intro" className="flex flex-col h-full">
        <TabsList className="mx-4 mt-3 mb-0">
          <TabsTrigger value="intro">Intro</TabsTrigger>
          <TabsTrigger value="api">
            API Log
            {apiLogs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium">
                {apiLogs.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            Webhooks
            {webhooks.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium">
                {webhooks.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intro" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {step.backendAction && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Backend Action</p>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded">{step.backendAction}</code>
                </div>
              )}

              {step.docsLinks.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Documentation</p>
                  <div className="space-y-1.5">
                    {step.docsLinks.map((link) => (
                      <DocsLink key={link.url} label={link.label} url={link.url} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="api" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {apiLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No API calls yet. Interact with the demo to trigger API calls.
                </p>
              ) : (
                apiLogs.map((log) => (
                  <ApiCallEntry key={log.id} log={log} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="webhooks" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {webhooks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No webhooks received yet. Webhooks arrive as the applicant
                  progresses through verification.
                </p>
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
