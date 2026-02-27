import "dotenv/config";

export const config = {
  TRUV_CLIENT_ID: process.env.TRUV_CLIENT_ID || "",
  TRUV_SECRET: process.env.TRUV_SECRET || "",
  TRUV_BASE_URL: process.env.TRUV_BASE_URL || "https://prod.truv.com/v1",
  TRUV_TEMPLATE_ID: process.env.TRUV_TEMPLATE_ID || "",
  WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL || "http://localhost:8000",
  PORT: parseInt(process.env.PORT || "8000", 10),
};
