import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { orders, webhookEvents } from "../db/schema.js";
import { pushWebhookEvent } from "../services/api-logger.js";

const app = new Hono();

// POST /api/webhooks/truv
app.post("/truv", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-webhook-sign") || "";

  // Verify HMAC-SHA256 signature
  if (config.TRUV_SECRET) {
    const expected = `v1=${createHmac("sha256", config.TRUV_SECRET).update(rawBody).digest("hex")}`;
    try {
      if (
        !timingSafeEqual(
          Buffer.from(signature, "utf8"),
          Buffer.from(expected, "utf8")
        )
      ) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }
    } catch {
      return c.json({ error: "Invalid webhook signature" }, 401);
    }
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = (payload.event_type as string) || "unknown";
  const webhookId = (payload.webhook_id as string) || null;
  const status = (payload.status as string) || null;

  // Try to find the order
  const truvOrderId = payload.order_id as string | undefined;
  let orderId: string | null = null;

  if (truvOrderId) {
    const order = db
      .select()
      .from(orders)
      .where(eq(orders.truvOrderId, truvOrderId))
      .get();
    if (order) {
      orderId = order.id;
      if (status) {
        db.update(orders)
          .set({ status })
          .where(eq(orders.id, order.id))
          .run();
      }
    }
  }

  // Store webhook event
  const now = new Date().toISOString();
  const result = db
    .insert(webhookEvents)
    .values({
      orderId,
      webhookId,
      eventType,
      status,
      payload: JSON.stringify(payload),
      receivedAt: now,
    })
    .returning()
    .get();

  // Push to SSE subscribers
  pushWebhookEvent(orderId, {
    id: result.id,
    order_id: orderId,
    webhook_id: webhookId,
    event_type: eventType,
    status,
    payload,
    received_at: result.receivedAt,
  });

  return c.json({ status: "ok" });
});

export default app;
