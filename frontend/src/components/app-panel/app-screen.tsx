import type { DemoStep, OrderResponse } from "@/lib/types";
import { FormScreen } from "./screens/form-screen";
import { BridgeScreen } from "./screens/bridge-screen";
import { ConfirmationScreen } from "./screens/confirmation-screen";
import { ReviewScreen } from "./screens/review-screen";
import { DashboardScreen } from "./screens/dashboard-screen";
import { QrCodeScreen } from "./screens/qr-code-screen";
import { SendLinkScreen } from "./screens/send-link-screen";
import { MonitorScreen } from "./screens/monitor-screen";
import { TemplateScreen } from "./screens/template-screen";
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
  loading,
}: AppScreenProps) {
  switch (step.screenType) {
    case "form":
      return (
        <FormScreen
          formData={formData}
          onChange={onFormChange}
          prefilled={step.screenProps?.prefilled as boolean}
        />
      );
    case "bridge":
      return (
        <BridgeScreen
          bridgeToken={bridgeToken}
          orderId={orderId}
          onCreateOrder={onCreateOrder}
          loading={loading}
        />
      );
    case "confirmation":
      return <ConfirmationScreen orderId={orderId} demoId={demoId} />;
    case "review":
      return (
        <ReviewScreen
          orderData={orderData}
          onRefresh={onGetOrder}
          loading={loading}
        />
      );
    case "dashboard":
      return <DashboardScreen onSelectCase={onGetOrder} />;
    case "qr-code":
      return (
        <QrCodeScreen
          shareUrl={shareUrl}
          onCreateOrder={onCreateOrder}
          loading={loading}
        />
      );
    case "send-link":
      return (
        <SendLinkScreen
          shareUrl={shareUrl}
          onCreateOrder={onCreateOrder}
          formData={formData}
          loading={loading}
        />
      );
    case "monitor":
      return <MonitorScreen webhooks={webhooks} orderId={orderId} />;
    case "template":
      return (
        <TemplateScreen section={step.screenProps?.section as string} />
      );
    default:
      return <div className="text-muted-foreground">Unknown screen type</div>;
  }
}
