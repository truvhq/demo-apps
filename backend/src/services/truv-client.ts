import { config } from "../config.js";

export interface TruvApiResult<T = Record<string, unknown>> {
  statusCode: number;
  data: T;
  durationMs: number;
}

export interface TruvOrderResponse {
  id: string;
  bridge_token: string;
  share_url: string | null;
  status: string;
  [key: string]: unknown;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Access-Client-Id": config.TRUV_CLIENT_ID,
    "X-Access-Secret": config.TRUV_SECRET,
  };
}

async function truvRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  jsonBody?: Record<string, unknown>
): Promise<TruvApiResult<T>> {
  const url = `${config.TRUV_BASE_URL}${path}`;
  const start = performance.now();

  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  const durationMs = Math.round(performance.now() - start);

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = { raw: await res.text() } as T;
  }

  return { statusCode: res.status, data, durationMs };
}

export async function createOrder(
  orderParams: Record<string, unknown>
): Promise<TruvApiResult<TruvOrderResponse>> {
  return truvRequest<TruvOrderResponse>("POST", "/orders/", orderParams);
}

export async function getOrder(
  truvOrderId: string
): Promise<TruvApiResult<TruvOrderResponse>> {
  return truvRequest<TruvOrderResponse>("GET", `/orders/${truvOrderId}/`);
}

export async function refreshOrder(
  truvOrderId: string
): Promise<TruvApiResult<TruvOrderResponse>> {
  return truvRequest<TruvOrderResponse>("POST", `/orders/${truvOrderId}/refresh/`);
}

export async function getOrderCertifications(
  truvOrderId: string
): Promise<TruvApiResult> {
  return truvRequest("GET", `/orders/${truvOrderId}/certifications/`);
}
