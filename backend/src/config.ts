import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";

const ENV_PATH = resolve(import.meta.dirname, "../.env");

dotenvConfig({ path: ENV_PATH });

function loadConfig() {
  return {
    TRUV_CLIENT_ID: process.env.TRUV_CLIENT_ID || "",
    TRUV_SECRET: process.env.TRUV_SECRET || "",
    TRUV_BASE_URL: process.env.TRUV_BASE_URL || "https://prod.truv.com/v1",
    TRUV_TEMPLATE_ID: process.env.TRUV_TEMPLATE_ID || "",
    WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL || "http://localhost:8000",
    PORT: Number.isNaN(parseInt(process.env.PORT || "8000", 10))
      ? 8000
      : parseInt(process.env.PORT || "8000", 10),
  };
}

let _config = loadConfig();

export function getConfig() {
  return _config;
}

export const ENV_FILE_PATH = ENV_PATH;

const ALLOWED_BASE_URLS = [
  "https://prod.truv.com/v1",
  "https://sandbox.truv.com/v1",
  "https://dev.truv.com/v1",
];

export function isAllowedBaseUrl(url: string): boolean {
  return ALLOWED_BASE_URLS.includes(url) || /^https:\/\/[a-z0-9.-]+\.truv\.com\/v1$/.test(url);
}

function sanitizeEnvValue(value: string): string {
  return value.replace(/[\n\r\0]/g, "");
}

export function readEnvFile(): Map<string, string> {
  const map = new Map<string, string>();
  let content = "";
  try {
    content = readFileSync(ENV_PATH, "utf-8");
  } catch {
    // file doesn't exist yet
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      map.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
  }
  return map;
}

export function writeEnvFile(envMap: Map<string, string>) {
  const lines = Array.from(envMap.entries()).map(([k, v]) => `${k}=${sanitizeEnvValue(v)}`);
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", { encoding: "utf-8", mode: 0o600 });
}

export function reloadConfig() {
  dotenvConfig({ path: ENV_PATH, override: true });
  _config = loadConfig();
}

// backwards compat — re-export as `config` using a proxy so reads always get latest
export const config: Readonly<ReturnType<typeof loadConfig>> = new Proxy({} as ReturnType<typeof loadConfig>, {
  get(_target, prop: string) {
    return (_config as Record<string, unknown>)[prop];
  },
});
