import type {
  ApiLogEntry,
  CreateOrderResponse,
  OrderResponse,
  WebhookEventEntry,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function createOrder(data: {
  demo_id: string;
  product_type?: string;
  first_name?: string;
  last_name?: string;
}): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Create order failed: ${res.status}`);
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
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/logs`);
  if (!res.ok) return [];
  return res.json();
}

export async function getWebhookEvents(orderId: string): Promise<WebhookEventEntry[]> {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/webhooks`);
  if (!res.ok) return [];
  return res.json();
}

export function subscribeToEvents(orderId: string): EventSource {
  return new EventSource(`${API_BASE}/api/events/stream?order_id=${orderId}`);
}

// --- Config API ---

export interface ConfigStatus {
  has_credentials: boolean;
  client_id_last4: string;
  base_url: string;
  template_id: string;
  webhook: { url: string | null };
}

export interface WebhookResult {
  webhook_id: string | null;
  url: string;
  status: string;
  response: Record<string, unknown>;
}

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
  if (!res.ok) throw new Error(`Save config failed: ${res.status}`);
}

export async function saveNgrokToken(authtoken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/config/ngrok`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authtoken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Save ngrok token failed: ${res.status}`);
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
    const err = await res.json();
    throw new Error(err.error || `Register webhook failed: ${res.status}`);
  }
  return res.json();
}
