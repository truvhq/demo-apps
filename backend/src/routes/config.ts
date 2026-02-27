import { Hono } from "hono";
import { readFileSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { config, ENV_FILE_PATH, reloadConfig } from "../config.js";

const execFileAsync = promisify(execFile);

const app = new Hono();

// GET /api/config — current config status
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

  // Read existing .env
  let envContent = "";
  try {
    envContent = readFileSync(ENV_FILE_PATH, "utf-8");
  } catch {
    // file doesn't exist yet
  }

  const envMap = new Map<string, string>();
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      envMap.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
  }

  // Update only provided fields
  if (body.client_id !== undefined) envMap.set("TRUV_CLIENT_ID", body.client_id);
  if (body.secret !== undefined) envMap.set("TRUV_SECRET", body.secret);
  if (body.base_url !== undefined) envMap.set("TRUV_BASE_URL", body.base_url);
  if (body.template_id !== undefined) envMap.set("TRUV_TEMPLATE_ID", body.template_id);

  // Write back
  const lines = Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE_PATH, lines.join("\n") + "\n", "utf-8");

  // Reload in-memory config
  reloadConfig();

  return c.json({ ok: true });
});

// POST /api/config/ngrok — save ngrok authtoken
app.post("/ngrok", async (c) => {
  const body = await c.req.json<{ authtoken: string }>();

  if (!body.authtoken) {
    return c.json({ error: "authtoken is required" }, 400);
  }

  try {
    await execFileAsync("ngrok", ["config", "add-authtoken", body.authtoken], {
      timeout: 10000,
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "Failed to save ngrok authtoken", details: message }, 500);
  }
});

// POST /api/config/webhook — register webhook with Truv API
app.post("/webhook", async (c) => {
  const body = await c.req.json<{ webhook_url: string }>();

  if (!config.TRUV_CLIENT_ID || !config.TRUV_SECRET) {
    return c.json({ error: "API credentials not configured" }, 400);
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
    return c.json(
      { error: "Webhook registration failed", details: data },
      res.status as 400
    );
  }

  // Save webhook URL to .env
  let envContent = "";
  try {
    envContent = readFileSync(ENV_FILE_PATH, "utf-8");
  } catch {
    // ignore
  }

  const envMap = new Map<string, string>();
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      envMap.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
  }
  envMap.set("WEBHOOK_BASE_URL", body.webhook_url);
  const lines = Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE_PATH, lines.join("\n") + "\n", "utf-8");
  reloadConfig();

  return c.json({
    webhook_id: (data as Record<string, unknown>).id || null,
    url: body.webhook_url,
    status: "registered",
    response: data,
  });
});

export default app;
