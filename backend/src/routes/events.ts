import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe } from "../services/api-logger.js";

const MAX_CONNECTIONS = 50;
let activeConnections = 0;

const app = new Hono();

// GET /api/events/stream
app.get("/stream", (c) => {
  const orderId = c.req.query("order_id") || null;

  if (activeConnections >= MAX_CONNECTIONS) {
    return c.json({ error: "Too many SSE connections" }, 429);
  }

  activeConnections++;

  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribe(orderId, (event) => {
      stream
        .writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
        .catch(() => {});
    });

    // Send keepalive pings
    const pingInterval = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
    }, 30_000);

    // Keep the stream open until aborted — single promise, no busy-wait
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(pingInterval);
        unsubscribe();
        activeConnections--;
        resolve();
      });
    });
  });
});

export default app;
