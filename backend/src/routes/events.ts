import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe } from "../services/api-logger.js";

const app = new Hono();

// GET /api/events/stream
app.get("/stream", (c) => {
  const orderId = c.req.query("order_id") || null;

  return streamSSE(c, async (stream) => {
    let alive = true;

    const unsubscribe = subscribe(orderId, (event) => {
      if (!alive) return;
      stream
        .writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
        .catch(() => {
          alive = false;
        });
    });

    // Send keepalive pings
    const pingInterval = setInterval(() => {
      if (!alive) {
        clearInterval(pingInterval);
        return;
      }
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {
        alive = false;
        clearInterval(pingInterval);
      });
    }, 30_000);

    // Wait until the stream is aborted
    stream.onAbort(() => {
      alive = false;
      clearInterval(pingInterval);
      unsubscribe();
    });

    // Keep the stream open
    while (alive) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

export default app;
