// === Screen & Demo Types ===

export type ScreenType =
  | "form"
  | "bridge"
  | "confirmation"
  | "review"
  | "dashboard"
  | "qr-code"
  | "send-link"
  | "monitor"
  | "setup";

export interface DemoStep {
  title: string;
  description: string;
  browserUrl: string;
  screenType: ScreenType;
  screenProps?: Record<string, unknown>;
  backendAction?: string;
  docsLinks: { label: string; url: string }[];
}

export interface DemoConfig {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  category: string;
  steps: DemoStep[];
}

// === API Response Types ===

export interface ApiLogEntry {
  id: number;
  order_id: string | null;
  method: string;
  endpoint: string;
  request_body: Record<string, unknown> | null;
  response_body: Record<string, unknown> | null;
  status_code: number | null;
  duration_ms: number | null;
  timestamp: string | null;
}

export interface WebhookEventEntry {
  id: number;
  order_id: string | null;
  webhook_id: string | null;
  event_type: string;
  status: string | null;
  payload: Record<string, unknown>;
  received_at: string | null;
}

export interface BridgeEvent {
  id: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown> | null;
}

export interface CreateOrderResponse {
  order_id: string;
  truv_order_id: string;
  bridge_token: string | null;
  share_url: string | null;
  status: string;
}

export interface OrderResponse {
  order_id: string;
  truv_order_id: string;
  status: string;
  bridge_token: string | null;
  share_url: string | null;
  raw_response: Record<string, unknown> | null;
}

// === Config Types ===

export interface ConfigStatus {
  has_credentials: boolean;
  client_id_last4: string;
  base_url: string;
  template_id: string;
  webhook: { url: string | null };
}

export interface WebhookResult {
  webhook_id: string | null;
  url: string;
  status: string;
  response: Record<string, unknown>;
}
