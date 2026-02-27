import { useCallback } from "react";
import { useParams, Navigate } from "react-router";
import { getDemoById } from "@/config/demos";
import { DemoShell } from "@/components/demo-shell/demo-shell";
import { BrowserFrame } from "@/components/app-panel/browser-frame";
import { AppScreen } from "@/components/app-panel/app-screen";
import { ApiPanel } from "@/components/api-panel/api-panel";
import { useDemoContext } from "@/contexts/demo-context";

export function DemoStepPage() {
  const { demoId, stepIndex: stepStr } = useParams<{ demoId: string; stepIndex: string }>();
  const stepIndex = parseInt(stepStr || "0", 10);
  const demo = getDemoById(demoId || "");

  const ctx = useDemoContext();

  const onCreateOrder = useCallback(() => {
    if (demoId) ctx.handleCreateOrder(demoId);
  }, [demoId, ctx.handleCreateOrder]);

  if (!demo || isNaN(stepIndex) || stepIndex < 0 || stepIndex >= demo.steps.length) {
    return <Navigate to="/" replace />;
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
            formData={ctx.formData}
            onFormChange={ctx.setFormData}
            orderId={ctx.orderId}
            bridgeToken={ctx.bridgeToken}
            shareUrl={ctx.shareUrl}
            orderData={ctx.orderData}
            webhooks={ctx.allWebhooks}
            onCreateOrder={onCreateOrder}
            onGetOrder={ctx.handleGetOrder}
            onBridgeEvent={ctx.addBridgeEvent}
            loading={ctx.loading}
          />
        </BrowserFrame>
      }
      rightPanel={
        <ApiPanel
          step={step}
          apiLogs={ctx.allApiLogs}
          webhooks={ctx.allWebhooks}
          bridgeEvents={ctx.bridgeEvents}
        />
      }
    />
  );
}
