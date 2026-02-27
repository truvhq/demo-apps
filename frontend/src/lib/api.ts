import type {
  ApiLogEntry,
  CreateOrderResponse,
  OrderResponse,
  WebhookEventEntry,
  ConfigStatus,
  WebhookResult,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function createOrder(data: {
  demo_id: string;
  first_name?: string;
  last_name?: string;
}): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Create order failed: ${res.status}`;
    try { message = JSON.parse(text).error || message; } catch {}
    throw new Error(message);
  }
  return res.json();
}

export async function getOrder(orderId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
  if (!res.ok) {
    throw new Error(`Get order failed: ${res.status}`);
  }
  return res.json();
}

export async function refreshOrder(orderId: string): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/refresh`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Refresh order failed: ${res.status}`);
  }
  return res.json();
}

export async function getOrderCertifications(orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/certifications`);
  if (!res.ok) throw new Error(`Get certifications failed: ${res.status}`);
  return res.json();
}

export async function getApiLogs(orderId: string): Promise<ApiLogEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/logs`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getWebhookEvents(orderId: string): Promise<WebhookEventEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/webhooks`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export function subscribeToEvents(orderId: string): EventSource {
  return new EventSource(`${API_BASE}/api/events/stream?order_id=${orderId}`);
}

// --- Config API ---

export async function getConfigStatus(): Promise<ConfigStatus> {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) throw new Error(`Get config failed: ${res.status}`);
  return res.json();
}

export async function saveEnvConfig(data: {
  client_id?: string;
  secret?: string;
  base_url?: string;
  template_id?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/config/env`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Save config failed: ${res.status}`;
    try { message = JSON.parse(text).error || message; } catch {}
    throw new Error(message);
  }
}

export async function saveNgrokToken(authtoken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/config/ngrok`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authtoken }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Save ngrok token failed: ${res.status}`;
    try { message = JSON.parse(text).error || message; } catch {}
    throw new Error(message);
  }
}

export async function registerWebhook(data: {
  webhook_url: string;
}): Promise<WebhookResult> {
  const res = await fetch(`${API_BASE}/api/config/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Register webhook failed: ${res.status}`;
    try { message = JSON.parse(text).error || message; } catch {}
    throw new Error(message);
  }
  return res.json();
}
