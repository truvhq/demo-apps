import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { config } from "./config.js";

// Import DB to trigger table creation
import "./db/index.js";

import ordersRoutes from "./routes/orders.js";
import webhooksRoutes from "./routes/webhooks.js";
import eventsRoutes from "./routes/events.js";
import configRoutes from "./routes/config.js";

const app = new Hono();

app.use("*", secureHeaders());

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.route("/api/orders", ordersRoutes);
app.route("/api/webhooks", webhooksRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/config", configRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

console.log(`Backend listening on http://localhost:${config.PORT}`);

serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: config.PORT,
});
