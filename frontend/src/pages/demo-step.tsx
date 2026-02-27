import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { getDemoById } from "@/config/demos";
import { DemoShell } from "@/components/demo-shell/demo-shell";
import { BrowserFrame } from "@/components/app-panel/browser-frame";
import { AppScreen } from "@/components/app-panel/app-screen";
import { ApiPanel } from "@/components/api-panel/api-panel";
import { useDemo } from "@/hooks/use-demo";
import { useApiLog } from "@/hooks/use-api-log";
import { useWebhookStream } from "@/hooks/use-webhook-stream";
import { createOrder, getOrder } from "@/lib/api";
import type { OrderResponse, BridgeEvent } from "@/lib/types";

export function DemoStepPage() {
  const { demoId, stepIndex: stepStr } = useParams<{ demoId: string; stepIndex: string }>();
  const navigate = useNavigate();
  const stepIndex = parseInt(stepStr || "0", 10);
  const demo = getDemoById(demoId || "");

  const demoState = useDemo();
  const apiLog = useApiLog();
  const webhookStream = useWebhookStream(demoState.orderId);
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Merge SSE api calls into the log
  const allApiLogs = [...apiLog.logs, ...webhookStream.apiCalls];
  const allWebhooks = webhookStream.webhooks;

  // Fetch logs when we have an orderId
  useEffect(() => {
    if (demoState.orderId) {
      apiLog.fetchLogs(demoState.orderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoState.orderId]);


  const handleCreateOrder = useCallback(async () => {
    if (!demoId) return;
    // Clear old order state so bridge doesn't use stale token
    demoState.clearOrderData();
    setLoading(true);
    try {
      const result = await createOrder({
        demo_id: demoId,
        product_type: "income",
        first_name: demoState.formData.first_name,
        last_name: demoState.formData.last_name,
      });
      demoState.setOrderData(result);
      apiLog.fetchLogs(result.order_id);
    } catch (e) {
      console.error("Failed to create order:", e);
    } finally {
      setLoading(false);
    }
  }, [demoId, demoState, apiLog]);

  const handleGetOrder = useCallback(async () => {
    if (!demoState.orderId) return;
    setLoading(true);
    try {
      const data = await getOrder(demoState.orderId);
      setOrderData(data);
      apiLog.fetchLogs(demoState.orderId);
    } catch (e) {
      console.error("Failed to get order:", e);
    } finally {
      setLoading(false);
    }
  }, [demoState.orderId, apiLog]);

  const handleBridgeEvent = useCallback(
    (event: BridgeEvent) => {
      demoState.addBridgeEvent(event);
    },
    [demoState.addBridgeEvent]
  );

  if (!demo || isNaN(stepIndex) || stepIndex < 0 || stepIndex >= demo.steps.length) {
    navigate("/", { replace: true });
    return null;
  }

  const step = demo.steps[stepIndex];

  return (
    <DemoShell
      demo={demo}
      currentStep={stepIndex}
      leftPanel={
        <BrowserFrame url={step.browserUrl}>
          <AppScreen
            step={step}
            demoId={demoId!}
            formData={demoState.formData}
            onFormChange={demoState.setFormData}
            orderId={demoState.orderId}
            bridgeToken={demoState.bridgeToken}
            shareUrl={demoState.shareUrl}
            orderData={orderData}
            webhooks={allWebhooks}
            onCreateOrder={handleCreateOrder}
            onGetOrder={handleGetOrder}
            onBridgeEvent={handleBridgeEvent}
            loading={loading}
          />
        </BrowserFrame>
      }
      rightPanel={
        <ApiPanel
          step={step}
          apiLogs={allApiLogs}
          webhooks={allWebhooks}
          bridgeEvents={demoState.bridgeEvents}
        />
      }
    />
  );
}
