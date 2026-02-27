import { Hono } from "hono";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/index.js";
import { orders, apiLogs, webhookEvents } from "../db/schema.js";
import * as truvClient from "../services/truv-client.js";
import { logApiCall } from "../services/api-logger.js";
import { config } from "../config.js";

const createOrderSchema = z.object({
  demo_id: z.string().min(1).max(50),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  ssn: z.string().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
});

const app = new Hono();

// POST /api/orders
app.post("/", zValidator("json", createOrderSchema), async (c) => {
  const body = c.req.valid("json");

  const orderId = randomUUID();

  const truvParams: Record<string, unknown> = {
    products: ["income", "assets"],
    first_name: body.first_name || "John",
    last_name: body.last_name || "Doe",
    ssn: body.ssn || "222233333",
    order_number: orderId,
    external_user_id: orderId,
    notification_settings: {
      suppress_user_notifications: false,
      first_notification_delay_hours: 24,
    },
  };

  if (body.email) truvParams.email = body.email;
  if (body.phone) truvParams.phone = body.phone;
  if (config.TRUV_TEMPLATE_ID) truvParams.template_id = config.TRUV_TEMPLATE_ID;

  const result = await truvClient.createOrder(truvParams);

  await logApiCall({
    method: "POST",
    endpoint: "/v1/orders/",
    requestBody: truvParams,
    responseBody: result.data as Record<string, unknown>,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    orderId,
  });

  if (result.statusCode >= 400) {
    return c.json(result.data, result.statusCode as 400);
  }

  db.insert(orders)
    .values({
      id: orderId,
      truvOrderId: result.data.id,
      demoId: body.demo_id,
      bridgeToken: result.data.bridge_token,
      shareUrl: result.data.share_url,
      status: result.data.status || "created",
      rawResponse: JSON.stringify(result.data),
      createdAt: new Date().toISOString(),
    })
    .run();

  return c.json({
    order_id: orderId,
    truv_order_id: result.data.id,
    bridge_token: result.data.bridge_token,
    share_url: result.data.share_url,
    status: result.data.status || "created",
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
    const result = await truvClient.getOrder(order.truvOrderId);

    await logApiCall({
      method: "GET",
      endpoint: `/v1/orders/${order.truvOrderId}/`,
      responseBody: result.data as Record<string, unknown>,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      orderId,
    });

    if (result.statusCode < 400) {
      db.update(orders)
        .set({
          status: result.data.status || order.status,
          rawResponse: JSON.stringify(result.data),
        })
        .where(eq(orders.id, orderId))
        .run();

      return c.json({
        order_id: order.id,
        truv_order_id: order.truvOrderId,
        status: result.data.status || order.status || "unknown",
        bridge_token: order.bridgeToken,
        share_url: order.shareUrl,
        raw_response: result.data,
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

  const result = await truvClient.refreshOrder(order.truvOrderId || "");

  await logApiCall({
    method: "POST",
    endpoint: `/v1/orders/${order.truvOrderId}/refresh/`,
    responseBody: result.data as Record<string, unknown>,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    orderId,
  });

  if (result.statusCode >= 400) {
    return c.json(result.data, result.statusCode as 400);
  }

  db.update(orders)
    .set({
      status: result.data.status || order.status,
      bridgeToken: result.data.bridge_token || order.bridgeToken,
      rawResponse: JSON.stringify(result.data),
    })
    .where(eq(orders.id, orderId))
    .run();

  return c.json({
    order_id: order.id,
    truv_order_id: order.truvOrderId || "",
    bridge_token: result.data.bridge_token,
    share_url: result.data.share_url,
    status: result.data.status || "refreshed",
  });
});

// GET /api/orders/:orderId/certifications
app.get("/:orderId/certifications", async (c) => {
  const orderId = c.req.param("orderId");
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const result = await truvClient.getOrderCertifications(order.truvOrderId || "");

  await logApiCall({
    method: "GET",
    endpoint: `/v1/orders/${order.truvOrderId}/certifications/`,
    responseBody: result.data,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    orderId,
  });

  if (result.statusCode >= 400) {
    return c.json(result.data, result.statusCode as 400);
  }

  return c.json(result.data);
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
