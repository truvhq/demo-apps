import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

const ENV_PATH = resolve(import.meta.dirname, "../.env");

dotenvConfig({ path: ENV_PATH });

export const config = {
  TRUV_CLIENT_ID: process.env.TRUV_CLIENT_ID || "",
  TRUV_SECRET: process.env.TRUV_SECRET || "",
  TRUV_BASE_URL: process.env.TRUV_BASE_URL || "https://prod.truv.com/v1",
  TRUV_TEMPLATE_ID: process.env.TRUV_TEMPLATE_ID || "",
  WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL || "http://localhost:8000",
  PORT: parseInt(process.env.PORT || "8000", 10),
};

export const ENV_FILE_PATH = ENV_PATH;

export function reloadConfig() {
  dotenvConfig({ path: ENV_PATH, override: true });
  config.TRUV_CLIENT_ID = process.env.TRUV_CLIENT_ID || "";
  config.TRUV_SECRET = process.env.TRUV_SECRET || "";
  config.TRUV_BASE_URL = process.env.TRUV_BASE_URL || "https://prod.truv.com/v1";
  config.TRUV_TEMPLATE_ID = process.env.TRUV_TEMPLATE_ID || "";
  config.WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || "http://localhost:8000";
}
