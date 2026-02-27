import { Hono } from "hono";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { config, reloadConfig, readEnvFile, writeEnvFile, isAllowedBaseUrl } from "../config.js";

const execFileAsync = promisify(execFile);

const envConfigSchema = z.object({
  client_id: z.string().max(200).optional(),
  secret: z.string().max(200).optional(),
  base_url: z.string().max(200).optional(),
  template_id: z.string().max(200).optional(),
});

const ngrokSchema = z.object({
  authtoken: z.string().regex(/^[a-zA-Z0-9_-]{10,100}$/, "Invalid authtoken format"),
});

const webhookSchema = z.object({
  webhook_url: z.string().max(500).refine((url) => url.startsWith("https://"), "webhook_url must use https://"),
});

const app = new Hono();

// Localhost-only guard for config endpoints
app.use("/*", async (c, next) => {
  const host = c.req.header("host") || "";
  const isLocalhost = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
  if (!isLocalhost) {
    return c.json({ error: "Config endpoints are localhost-only" }, 403);
  }
  await next();
});

// GET /api/config — current config status (masked)
app.get("/", (c) => {
  return c.json({
    has_credentials: !!(config.TRUV_CLIENT_ID && config.TRUV_SECRET),
    client_id_last4: config.TRUV_CLIENT_ID
      ? config.TRUV_CLIENT_ID.slice(-4)
      : "",
    base_url: config.TRUV_BASE_URL,
    template_id: config.TRUV_TEMPLATE_ID,
    webhook: {
      url: config.WEBHOOK_BASE_URL || null,
    },
  });
});

// POST /api/config/env — update .env values and reload
app.post("/env", zValidator("json", envConfigSchema), async (c) => {
  const body = c.req.valid("json");

  // Validate base_url against allowlist
  if (body.base_url !== undefined && !isAllowedBaseUrl(body.base_url)) {
    return c.json({ error: "Invalid base_url. Must be a valid Truv API URL (*.truv.com/v1)" }, 400);
  }

  const envMap = readEnvFile();

  if (body.client_id !== undefined) envMap.set("TRUV_CLIENT_ID", body.client_id);
  if (body.secret !== undefined) envMap.set("TRUV_SECRET", body.secret);
  if (body.base_url !== undefined) envMap.set("TRUV_BASE_URL", body.base_url);
  if (body.template_id !== undefined) envMap.set("TRUV_TEMPLATE_ID", body.template_id);

  writeEnvFile(envMap);
  reloadConfig();

  return c.json({ ok: true });
});

// POST /api/config/ngrok — save ngrok authtoken
app.post("/ngrok", zValidator("json", ngrokSchema), async (c) => {
  const body = c.req.valid("json");

  try {
    await execFileAsync("ngrok", ["config", "add-authtoken", body.authtoken], {
      timeout: 10000,
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: `Failed to save ngrok authtoken: ${err instanceof Error ? err.message : "unknown error"}` }, 500);
  }
});

// POST /api/config/webhook — register webhook with Truv API
app.post("/webhook", zValidator("json", webhookSchema), async (c) => {
  const body = c.req.valid("json");

  if (!config.TRUV_CLIENT_ID || !config.TRUV_SECRET) {
    return c.json({ error: "API credentials not configured" }, 400);
  }

  const url = `${config.TRUV_BASE_URL}/webhooks/`;
  const payload = {
    url: `${body.webhook_url}/api/webhooks/truv`,
    events: ["task-status-updated", "order-status-updated"],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Client-Id": config.TRUV_CLIENT_ID,
      "X-Access-Secret": config.TRUV_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return c.json({ error: "Webhook registration failed", details: data }, res.status as 400);
  }

  // Save webhook URL to .env
  const envMap = readEnvFile();
  envMap.set("WEBHOOK_BASE_URL", body.webhook_url);
  writeEnvFile(envMap);
  reloadConfig();

  return c.json({
    webhook_id: data.id || null,
    url: body.webhook_url,
    status: "registered",
    response: data,
  });
});

export default app;
