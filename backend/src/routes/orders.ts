import { Hono } from "hono";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, apiLogs, webhookEvents } from "../db/schema.js";
import * as truvClient from "../services/truv-client.js";
import { logApiCall } from "../services/api-logger.js";

const app = new Hono();

// POST /api/orders
app.post("/", async (c) => {
  const body = await c.req.json<{
    demo_id: string;
    product_type?: string;
    first_name?: string;
    last_name?: string;
  }>();

  const orderId = randomUUID();

  const truvParams: Record<string, unknown> = {
    products: ["income", "assets"],
    first_name: body.first_name || "John",
    last_name: body.last_name || "Doe",
  };

  const [statusCode, data, durationMs] = await truvClient.createOrder(truvParams);

  await logApiCall({
    method: "POST",
    endpoint: "/v1/orders/",
    requestBody: truvParams,
    responseBody: data,
    statusCode,
    durationMs,
    orderId,
  });

  if (statusCode >= 400) {
    return c.json(data, statusCode as 400);
  }

  db.insert(orders)
    .values({
      id: orderId,
      truvOrderId: (data.id as string) || "",
      demoId: body.demo_id,
      bridgeToken: (data.bridge_token as string) || "",
      shareUrl: (data.share_url as string) || null,
      status: (data.status as string) || "created",
      rawResponse: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    })
    .run();

  return c.json({
    order_id: orderId,
    truv_order_id: data.id || "",
    bridge_token: data.bridge_token || null,
    share_url: data.share_url || null,
    status: data.status || "created",
  });
});

// GET /api/orders/:orderId
app.get("/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  if (order.truvOrderId) {
    const [statusCode, data, durationMs] = await truvClient.getOrder(order.truvOrderId);

    await logApiCall({
      method: "GET",
      endpoint: `/v1/orders/${order.truvOrderId}/`,
      responseBody: data,
      statusCode,
      durationMs,
      orderId,
    });

    if (statusCode < 400) {
      db.update(orders)
        .set({
          status: (data.status as string) || order.status,
          rawResponse: JSON.stringify(data),
        })
        .where(eq(orders.id, orderId))
        .run();

      return c.json({
        order_id: order.id,
        truv_order_id: order.truvOrderId || "",
        status: (data.status as string) || order.status || "unknown",
        bridge_token: order.bridgeToken,
        share_url: order.shareUrl,
        raw_response: data,
      });
    }
  }

  return c.json({
    order_id: order.id,
    truv_order_id: order.truvOrderId || "",
    status: order.status || "unknown",
    bridge_token: order.bridgeToken,
    share_url: order.shareUrl,
    raw_response: order.rawResponse ? JSON.parse(order.rawResponse) : null,
  });
});

// POST /api/orders/:orderId/refresh
app.post("/:orderId/refresh", async (c) => {
  const orderId = c.req.param("orderId");
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const [statusCode, data, durationMs] = await truvClient.refreshOrder(
    order.truvOrderId || ""
  );

  await logApiCall({
    method: "POST",
    endpoint: `/v1/orders/${order.truvOrderId}/refresh/`,
    responseBody: data,
    statusCode,
    durationMs,
    orderId,
  });

  if (statusCode >= 400) {
    return c.json(data, statusCode as 400);
  }

  db.update(orders)
    .set({
      status: (data.status as string) || order.status,
      bridgeToken: (data.bridge_token as string) || order.bridgeToken,
      rawResponse: JSON.stringify(data),
    })
    .where(eq(orders.id, orderId))
    .run();

  return c.json({
    order_id: order.id,
    truv_order_id: order.truvOrderId || "",
    bridge_token: data.bridge_token || null,
    share_url: data.share_url || null,
    status: data.status || "refreshed",
  });
});

// GET /api/orders/:orderId/logs
app.get("/:orderId/logs", (c) => {
  const orderId = c.req.param("orderId");
  const logs = db
    .select()
    .from(apiLogs)
    .where(eq(apiLogs.orderId, orderId))
    .all();

  return c.json(
    logs.map((log) => ({
      id: log.id,
      order_id: log.orderId,
      method: log.method,
      endpoint: log.endpoint,
      request_body: log.requestBody ? JSON.parse(log.requestBody) : null,
      response_body: log.responseBody ? JSON.parse(log.responseBody) : null,
      status_code: log.statusCode,
      duration_ms: log.durationMs,
      timestamp: log.timestamp,
    }))
  );
});

// GET /api/orders/:orderId/webhooks
app.get("/:orderId/webhooks", (c) => {
  const orderId = c.req.param("orderId");
  const events = db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.orderId, orderId))
    .all();

  return c.json(
    events.map((evt) => ({
      id: evt.id,
      order_id: evt.orderId,
      webhook_id: evt.webhookId,
      event_type: evt.eventType,
      status: evt.status,
      payload: JSON.parse(evt.payload),
      received_at: evt.receivedAt,
    }))
  );
});

export default app;
