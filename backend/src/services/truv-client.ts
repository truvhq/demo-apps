import { config } from "../config.js";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Access-Client-Id": config.TRUV_CLIENT_ID,
    "X-Access-Secret": config.TRUV_SECRET,
  };
}

async function truvRequest(
  method: string,
  path: string,
  jsonBody?: Record<string, unknown>
): Promise<[number, Record<string, unknown>, number]> {
  const url = `${config.TRUV_BASE_URL}${path}`;
  const start = performance.now();

  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  const durationMs = Math.round(performance.now() - start);

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = { raw: await res.text() };
  }

  return [res.status, data, durationMs];
}

export async function createOrder(
  orderParams: Record<string, unknown>
): Promise<[number, Record<string, unknown>, number]> {
  return truvRequest("POST", "/orders/", orderParams);
}

export async function getOrder(
  truvOrderId: string
): Promise<[number, Record<string, unknown>, number]> {
  return truvRequest("GET", `/orders/${truvOrderId}/`);
}

export async function refreshOrder(
  truvOrderId: string
): Promise<[number, Record<string, unknown>, number]> {
  return truvRequest("POST", `/orders/${truvOrderId}/refresh/`);
}
