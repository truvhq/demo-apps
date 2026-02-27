import { useState, useCallback, useEffect, useRef } from "react";
import { TruvBridgeInline } from "@truv/react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BridgeEvent } from "@/lib/types";

interface BridgeScreenProps {
  bridgeToken: string | null;
  orderId: string | null;
  onCreateOrder: () => void;
  onBridgeEvent: (event: BridgeEvent) => void;
  loading: boolean;
}

const SIDEBAR_ITEMS = [
  { label: "Apply for benefits", header: true },
  { label: "Start" },
  { label: "Getting To Know You" },
  { label: "Benefits" },
  { label: "Household" },
  { label: "People" },
  { label: "Income", active: true, header: true },
  { label: "Connect with Truv", active: true, sub: true },
  { label: "Expenses" },
  { label: "Resources" },
  { label: "Finish" },
];

const PROGRESS_STEPS = [
  "Start",
  "Getting To Know You",
  "Benefits",
  "Household",
  "People",
  "Income",
  "Expenses",
  "Resources",
  "Finish",
];

export function BridgeScreen({
  bridgeToken,
  onCreateOrder,
  onBridgeEvent,
  loading,
}: BridgeScreenProps) {
  const [bridgeComplete, setBridgeComplete] = useState(false);
  const [bridgeOpened, setBridgeOpened] = useState(false);
  const orderCreatedRef = useRef(false);

  const emitEvent = useCallback(
    (type: string, data?: Record<string, unknown> | null) => {
      onBridgeEvent({
        id: crypto.randomUUID(),
        type,
        timestamp: new Date().toISOString(),
        data,
      });
    },
    [onBridgeEvent]
  );

  // Always create a fresh order when the screen mounts
  useEffect(() => {
    if (!orderCreatedRef.current) {
      orderCreatedRef.current = true;
      onCreateOrder();
    }
  }, [onCreateOrder]);

  // When bridge token arrives, open the bridge
  const hasBridge = !!bridgeToken && !bridgeComplete;
  if (hasBridge && !bridgeOpened) {
    setBridgeOpened(true);
    emitEvent("onLoad", { bridgeToken });
  }

  // Main content for the right side of sidebar
  let mainContent: React.ReactNode;

  if (bridgeComplete) {
    mainContent = (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-lg">Verification Complete</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            The applicant has successfully connected their employer. Income and
            employment data has been verified.
          </p>
        </div>
        <Badge
          className="bg-green-100 text-green-700 border-green-200"
          variant="outline"
        >
          Employer Connected
        </Badge>
      </div>
    );
  } else if (hasBridge) {
    // The Truv Bridge iframe uses responsive breakpoints based on its
    // container width. At ~1000px it switches to a tablet/iPad layout
    // with stacked elements instead of the full desktop view. Since our
    // panel is only ~70% of the viewport, the iframe sees a narrow width.
    //
    // Workaround: render the iframe at 133% of the container size so it
    // sees ~1377px (well above the desktop breakpoint), then scale(0.75)
    // brings it back to fit the actual container visually.
    mainContent = (
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <TruvBridgeInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "133.33%",
            height: "133.33%",
            transform: "scale(0.75)",
            transformOrigin: "top left",
          }}
          isOpened={bridgeOpened}
          bridgeParams={{
            bridgeToken,
            isOrder: true,
            onSuccess: (publicToken: string) => {
              setBridgeComplete(true);
              emitEvent("onSuccess", { public_token: publicToken });
            },
            onClose: () => {
              emitEvent("onClose");
            },
            onLoad: () => {
              emitEvent("onLoad");
            },
            onEvent: (eventType: string, payload?: Record<string, unknown>) => {
              emitEvent("onEvent", { event_type: eventType, ...payload });
            },
          }}
        />
      </div>
    );
  } else if (loading) {
    mainContent = (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <div className="text-center">
          <p className="text-sm font-medium">Creating verification order...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Calling POST /v1/orders/ to get a bridge token
          </p>
        </div>
      </div>
    );
  } else {
    // Order creation failed or hasn't produced a token
    mainContent = (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-lg">Order Creation Failed</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Could not create the verification order. Check that TRUV_CLIENT_ID and
            TRUV_SECRET are configured in the backend .env file.
          </p>
        </div>
        <Button
          onClick={() => {
            orderCreatedRef.current = false;
            onCreateOrder();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Government header bar */}
      <div className="bg-[#003366] text-white px-5 py-3 flex items-center gap-3 flex-shrink-0">
        <Shield className="h-5 w-5" />
        <div>
          <p className="text-sm font-semibold tracking-wide">
            Department of Human Services
          </p>
          <p className="text-[10px] opacity-80">
            Apply for Benefits — Income Verification
          </p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="border-b bg-muted/30 px-5 py-2 flex-shrink-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {PROGRESS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-muted-foreground/40 mx-0.5">
                  &mdash;
                </span>
              )}
              <span
                className={
                  i < 5
                    ? "text-green-600 font-medium"
                    : i === 5
                      ? "text-blue-600 font-bold underline"
                      : "text-muted-foreground/60"
                }
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar + main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-44 border-r bg-muted/20 py-3 text-xs flex-shrink-0">
          {SIDEBAR_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`px-3 py-1.5 ${item.sub ? "pl-6" : ""} ${
                item.active && item.sub
                  ? "border-l-2 border-blue-600 bg-blue-50 text-blue-700 font-semibold"
                  : item.active || item.header
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Main content — Bridge widget or loading/complete state */}
        {mainContent}
      </div>
    </div>
  );
}
