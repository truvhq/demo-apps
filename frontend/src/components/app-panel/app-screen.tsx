import type { ReactNode } from "react";
import type { BridgeEvent, DemoStep, OrderResponse } from "@/lib/types";
import { FormScreen } from "./screens/form-screen";
import { BridgeScreen } from "./screens/bridge-screen";
import { ConfirmationScreen } from "./screens/confirmation-screen";
import { ReviewScreen } from "./screens/review-screen";
import { DashboardScreen } from "./screens/dashboard-screen";
import { QrCodeScreen } from "./screens/qr-code-screen";
import { SendLinkScreen } from "./screens/send-link-screen";
import { MonitorScreen } from "./screens/monitor-screen";
import { SetupScreen } from "./screens/setup-screen";
import type { WebhookEventEntry } from "@/lib/types";

interface AppScreenProps {
  step: DemoStep;
  demoId: string;
  formData: Record<string, string>;
  onFormChange: (data: Record<string, string>) => void;
  orderId: string | null;
  bridgeToken: string | null;
  shareUrl: string | null;
  orderData: OrderResponse | null;
  webhooks: WebhookEventEntry[];
  onCreateOrder: () => void;
  onGetOrder: () => void;
  onBridgeEvent: (event: BridgeEvent) => void;
  loading: boolean;
}

export function AppScreen({
  step,
  demoId,
  formData,
  onFormChange,
  orderId,
  bridgeToken,
  shareUrl,
  orderData,
  webhooks,
  onCreateOrder,
  onGetOrder,
  onBridgeEvent,
  loading,
}: AppScreenProps) {
  // Bridge fills edge-to-edge (manages its own layout)
  if (step.screenType === "bridge") {
    return (
      <BridgeScreen
        bridgeToken={bridgeToken}
        orderId={orderId}
        onCreateOrder={onCreateOrder}
        onBridgeEvent={onBridgeEvent}
        loading={loading}
      />
    );
  }

  // All other screens get padding
  let content: ReactNode;
  switch (step.screenType) {
    case "form":
      content = (
        <FormScreen
          formData={formData}
          onChange={onFormChange}
          prefilled={step.screenProps?.prefilled as boolean}
        />
      );
      break;
    case "confirmation":
      content = <ConfirmationScreen orderId={orderId} demoId={demoId} />;
      break;
    case "review":
      content = (
        <ReviewScreen
          orderData={orderData}
          orderId={orderId}
          onRefresh={onGetOrder}
          loading={loading}
        />
      );
      break;
    case "dashboard":
      content = <DashboardScreen onSelectCase={onGetOrder} />;
      break;
    case "qr-code":
      content = (
        <QrCodeScreen
          shareUrl={shareUrl}
          onCreateOrder={onCreateOrder}
          loading={loading}
        />
      );
      break;
    case "send-link":
      content = (
        <SendLinkScreen
          shareUrl={shareUrl}
          onCreateOrder={onCreateOrder}
          formData={formData}
          loading={loading}
        />
      );
      break;
    case "monitor":
      content = <MonitorScreen webhooks={webhooks} orderId={orderId} />;
      break;
    case "setup":
      content = (
        <SetupScreen section={step.screenProps?.section as string} />
      );
      break;
default:
      content = <div className="text-muted-foreground">Unknown screen type</div>;
  }

  return <div className="p-6">{content}</div>;
}
