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
  ssn?: string;
  email?: string;
  phone?: string;
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
