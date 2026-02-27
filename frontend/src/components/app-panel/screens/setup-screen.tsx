import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getConfigStatus,
  saveEnvConfig,
  saveNgrokToken,
  registerWebhook,
} from "@/lib/api";
import type { ConfigStatus, WebhookResult } from "@/lib/types";

interface SetupScreenProps {
  section: string;
}

export function SetupScreen({ section }: SetupScreenProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    getConfigStatus().then(setStatus).catch(() => {});
  }, []);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  switch (section) {
    case "env":
      return (
        <EnvSection
          status={status}
          loading={loading}
          message={message}
          onSave={async (data) => {
            setLoading(true);
            setMessage(null);
            try {
              await saveEnvConfig(data);
              const updated = await getConfigStatus();
              setStatus(updated);
              showMessage("success", "Credentials saved successfully");
            } catch (err) {
              showMessage("error", String(err));
            } finally {
              setLoading(false);
            }
          }}
        />
      );

    case "templates":
      return (
        <TemplatesSection
          status={status}
          loading={loading}
          message={message}
          onSave={async (templateId) => {
            setLoading(true);
            setMessage(null);
            try {
              await saveEnvConfig({ template_id: templateId });
              const updated = await getConfigStatus();
              setStatus(updated);
              showMessage("success", "Template ID saved");
            } catch (err) {
              showMessage("error", String(err));
            } finally {
              setLoading(false);
            }
          }}
        />
      );

    case "webhooks":
      return (
        <WebhooksSection
          status={status}
          loading={loading}
          message={message}
          onRegister={async (url) => {
            setLoading(true);
            setMessage(null);
            try {
              const result = await registerWebhook({ webhook_url: url });
              const updated = await getConfigStatus();
              setStatus(updated);
              showMessage("success", `Webhook registered (ID: ${result.webhook_id})`);
              return result;
            } catch (err) {
              showMessage("error", String(err));
              return null;
            } finally {
              setLoading(false);
            }
          }}
        />
      );

    default:
      return <div className="text-muted-foreground">Unknown setup section</div>;
  }
}

// --- Env Section ---

function EnvSection({
  status,
  loading,
  message,
  onSave,
}: {
  status: ConfigStatus | null;
  loading: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onSave: (data: { client_id?: string; secret?: string; base_url?: string }) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your Truv credentials are sent as{" "}
          <code className="text-xs bg-muted px-1 rounded">X-Access-Client-Id</code> and{" "}
          <code className="text-xs bg-muted px-1 rounded">X-Access-Secret</code> headers
          on every API call.
        </p>
      </div>

      {status && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Status</span>
              {status.has_credentials ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  Configured
                </Badge>
              ) : (
                <Badge variant="secondary">Not configured</Badge>
              )}
            </div>
            {status.has_credentials && (
              <p className="text-xs text-muted-foreground mt-2">
                Client ID: ····{status.client_id_last4} &middot; Base URL: {status.base_url}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="client-id">Client ID</Label>
          <Input
            id="client-id"
            placeholder="Enter TRUV_CLIENT_ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="secret">Secret</Label>
          <Input
            id="secret"
            type="password"
            placeholder="Enter TRUV_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="base-url">Base URL (optional)</Label>
          <Input
            id="base-url"
            placeholder="https://prod.truv.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Defaults to <code>https://prod.truv.com/v1</code>. Use sandbox URL for testing.
          </p>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <Button
        className="w-full"
        disabled={loading || (!clientId && !secret && !baseUrl)}
        onClick={() => {
          const data: Record<string, string> = {};
          if (clientId) data.client_id = clientId;
          if (secret) data.secret = secret;
          if (baseUrl) data.base_url = baseUrl;
          onSave(data);
        }}
      >
        {loading ? "Saving..." : "Save Credentials"}
      </Button>
    </div>
  );
}

// --- Templates Section ---

function TemplatesSection({
  status,
  loading,
  message,
  onSave,
}: {
  status: ConfigStatus | null;
  loading: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onSave: (templateId: string) => void;
}) {
  const [templateId, setTemplateId] = useState("");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Templates</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Templates control Bridge branding, search customization, and landing pages.
          Create or edit templates in the Truv Dashboard.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <a
            href="https://dashboard.truv.com/app/customization/templates"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline font-medium"
          >
            Open Truv Dashboard → Customization → Templates ↗
          </a>
          {status?.template_id && (
            <p className="text-xs text-muted-foreground">
              Current template: <code className="bg-muted px-1 rounded">{status.template_id}</code>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="template-id">Template ID</Label>
        <Input
          id="template-id"
          placeholder="Paste template_id from dashboard"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          This ID is passed in <code>POST /v1/orders/</code> to apply your customizations
          when Bridge opens.
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <Button
        className="w-full"
        disabled={loading || !templateId}
        onClick={() => onSave(templateId)}
      >
        {loading ? "Saving..." : "Save Template ID"}
      </Button>
    </div>
  );
}

// --- Webhooks Section ---

function WebhooksSection({
  status,
  loading,
  message,
  onRegister,
}: {
  status: ConfigStatus | null;
  loading: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onRegister: (url: string) => Promise<WebhookResult | null>;
}) {
  const [ngrokToken, setNgrokToken] = useState("");
  const [ngrokSaved, setNgrokSaved] = useState(false);
  const [ngrokLoading, setNgrokLoading] = useState(false);
  const [ngrokError, setNgrokError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [result, setResult] = useState<WebhookResult | null>(null);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Webhooks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Register a webhook URL so Truv sends event notifications to your backend.
          Use ngrok to expose your local server.
        </p>
      </div>

      {status?.webhook?.url && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current webhook</span>
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2 break-all">
              {status.webhook.url}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label htmlFor="ngrok-token">ngrok Authtoken</Label>
        <div className="flex gap-2">
          <Input
            id="ngrok-token"
            type="password"
            placeholder="Paste your ngrok authtoken"
            value={ngrokToken}
            onChange={(e) => setNgrokToken(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={ngrokLoading || !ngrokToken}
            onClick={async () => {
              setNgrokLoading(true);
              try {
                await saveNgrokToken(ngrokToken);
                setNgrokSaved(true);
              } catch (err) {
                setNgrokError(err instanceof Error ? err.message : "Failed to save ngrok token");
              } finally {
                setNgrokLoading(false);
              }
            }}
          >
            {ngrokSaved ? "Saved" : ngrokLoading ? "..." : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Find your token at{" "}
          <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            dashboard.ngrok.com
          </a>.
          Saved via <code>ngrok config add-authtoken</code>.
        </p>
        {ngrokError && (
          <p className="text-sm text-red-600">{ngrokError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="webhook-url">Webhook URL</Label>
        <Input
          id="webhook-url"
          placeholder="https://xxxx.ngrok-free.app"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Events subscribed: <code>task-status-updated</code>, <code>order-status-updated</code>
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <Button
        className="w-full"
        disabled={loading || !webhookUrl || !status?.has_credentials}
        onClick={async () => {
          const res = await onRegister(webhookUrl);
          if (res) setResult(res);
        }}
      >
        {loading ? "Registering..." : "Register Webhook"}
      </Button>

      {!status?.has_credentials && (
        <p className="text-xs text-amber-600">
          Configure API keys first (Step 1) before registering webhooks.
        </p>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Registration Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
