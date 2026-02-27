import { Hono } from "hono";
import { execFile } from "child_process";
import { promisify } from "util";
import { config, reloadConfig, readEnvFile, writeEnvFile, isAllowedBaseUrl } from "../config.js";

const execFileAsync = promisify(execFile);

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
app.post("/env", async (c) => {
  const body = await c.req.json<{
    client_id?: string;
    secret?: string;
    base_url?: string;
    template_id?: string;
  }>();

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
app.post("/ngrok", async (c) => {
  const body = await c.req.json<{ authtoken: string }>();

  if (!body.authtoken) {
    return c.json({ error: "authtoken is required" }, 400);
  }

  // Validate authtoken format
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(body.authtoken)) {
    return c.json({ error: "Invalid authtoken format" }, 400);
  }

  try {
    await execFileAsync("ngrok", ["config", "add-authtoken", body.authtoken], {
      timeout: 10000,
    });
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save ngrok authtoken" }, 500);
  }
});

// POST /api/config/webhook — register webhook with Truv API
app.post("/webhook", async (c) => {
  const body = await c.req.json<{ webhook_url: string }>();

  if (!config.TRUV_CLIENT_ID || !config.TRUV_SECRET) {
    return c.json({ error: "API credentials not configured" }, 400);
  }

  // Validate webhook_url is https
  if (!body.webhook_url || !body.webhook_url.startsWith("https://")) {
    return c.json({ error: "webhook_url must use https://" }, 400);
  }

  const url = `${config.TRUV_BASE_URL}/webhooks/`;
  const payload = {
    url: `${body.webhook_url}/api/webhooks`,
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
  });

  const data = await res.json();

  if (!res.ok) {
    return c.json({ error: "Webhook registration failed" }, res.status as 400);
  }

  // Save webhook URL to .env
  const envMap = readEnvFile();
  envMap.set("WEBHOOK_BASE_URL", body.webhook_url);
  writeEnvFile(envMap);
  reloadConfig();

  return c.json({
    webhook_id: (data as Record<string, unknown>).id || null,
    url: body.webhook_url,
    status: "registered",
    response: data,
  });
});

export default app;
