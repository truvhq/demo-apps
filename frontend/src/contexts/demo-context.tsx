import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { CreateOrderResponse, OrderResponse, BridgeEvent, ApiLogEntry, WebhookEventEntry } from "@/lib/types";
import { useApiLog } from "@/hooks/use-api-log";
import { useWebhookStream } from "@/hooks/use-webhook-stream";
import { createOrder as apiCreateOrder, getOrder as apiGetOrder } from "@/lib/api";

interface DemoContextValue {
  // Order state
  orderId: string | null;
  truvOrderId: string | null;
  bridgeToken: string | null;
  shareUrl: string | null;
  status: string | null;
  orderData: OrderResponse | null;
  loading: boolean;

  // Form state
  formData: Record<string, string>;
  setFormData: (data: Record<string, string>) => void;

  // Bridge events
  bridgeEvents: BridgeEvent[];
  addBridgeEvent: (event: BridgeEvent) => void;

  // API logs + webhooks (merged from REST + SSE)
  allApiLogs: ApiLogEntry[];
  allWebhooks: WebhookEventEntry[];

  // Actions
  handleCreateOrder: (demoId: string) => Promise<void>;
  handleGetOrder: () => Promise<void>;
  clearOrderData: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [truvOrderId, setTruvOrderId] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [formData, setFormDataState] = useState<Record<string, string>>({});
  const [bridgeEvents, setBridgeEvents] = useState<BridgeEvent[]>([]);
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const apiLog = useApiLog();
  const webhookStream = useWebhookStream(orderId);

  const allApiLogs = useMemo(
    () => [...apiLog.logs, ...webhookStream.apiCalls],
    [apiLog.logs, webhookStream.apiCalls]
  );
  const allWebhooks = webhookStream.webhooks;

  const setFormData = useCallback((data: Record<string, string>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const addBridgeEvent = useCallback((event: BridgeEvent) => {
    setBridgeEvents((prev) => [...prev, event]);
  }, []);

  const clearOrderData = useCallback(() => {
    setOrderId(null);
    setTruvOrderId(null);
    setBridgeToken(null);
    setShareUrl(null);
    setStatus(null);
    setBridgeEvents([]);
    setOrderData(null);
  }, []);

  const applyOrderResult = useCallback((result: CreateOrderResponse) => {
    setOrderId(result.order_id);
    setTruvOrderId(result.truv_order_id);
    setBridgeToken(result.bridge_token);
    setShareUrl(result.share_url);
    setStatus(result.status);
  }, []);

  const handleCreateOrder = useCallback(async (demoId: string) => {
    clearOrderData();
    setLoading(true);
    try {
      const result = await apiCreateOrder({
        demo_id: demoId,
        first_name: formData.first_name,
        last_name: formData.last_name,
        ssn: formData.ssn,
        email: formData.email,
        phone: formData.phone,
      });
      applyOrderResult(result);
      apiLog.fetchLogs(result.order_id);
    } catch (e) {
      console.error("Failed to create order:", e);
    } finally {
      setLoading(false);
    }
  }, [formData.first_name, formData.last_name, formData.ssn, formData.email, formData.phone, clearOrderData, applyOrderResult, apiLog.fetchLogs]);

  const handleGetOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const data = await apiGetOrder(orderId);
      setOrderData(data);
      apiLog.fetchLogs(orderId);
    } catch (e) {
      console.error("Failed to get order:", e);
    } finally {
      setLoading(false);
    }
  }, [orderId, apiLog.fetchLogs]);

  const value = useMemo<DemoContextValue>(() => ({
    orderId,
    truvOrderId,
    bridgeToken,
    shareUrl,
    status,
    orderData,
    loading,
    formData,
    setFormData,
    bridgeEvents,
    addBridgeEvent,
    allApiLogs,
    allWebhooks,
    handleCreateOrder,
    handleGetOrder,
    clearOrderData,
  }), [
    orderId, truvOrderId, bridgeToken, shareUrl, status, orderData, loading,
    formData, setFormData, bridgeEvents, addBridgeEvent,
    allApiLogs, allWebhooks, handleCreateOrder, handleGetOrder, clearOrderData,
  ]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoContext must be used within DemoProvider");
  return ctx;
}
