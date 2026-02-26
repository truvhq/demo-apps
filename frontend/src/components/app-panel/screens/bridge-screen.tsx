import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconLoader2, IconExternalLink } from "@tabler/icons-react";

interface BridgeScreenProps {
  bridgeToken: string | null;
  orderId: string | null;
  onCreateOrder: () => void;
  loading: boolean;
}

declare global {
  interface Window {
    TruvBridge?: {
      init: (config: Record<string, unknown>) => { open: () => void; close: () => void };
    };
  }
}

export function BridgeScreen({ bridgeToken, orderId, onCreateOrder, loading }: BridgeScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<{ open: () => void; close: () => void } | null>(null);
  const [bridgeLoaded, setBridgeLoaded] = useState(false);
  const [bridgeComplete, setBridgeComplete] = useState(false);

  // Load Truv Bridge script
  useEffect(() => {
    if (document.getElementById("truv-bridge-script")) {
      setBridgeLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "truv-bridge-script";
    script.src = "https://cdn.truv.com/bridge.js";
    script.onload = () => setBridgeLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize Bridge when token is available
  useEffect(() => {
    if (!bridgeToken || !bridgeLoaded || !containerRef.current) return;

    if (bridgeRef.current) {
      bridgeRef.current.close();
    }

    bridgeRef.current = window.TruvBridge!.init({
      bridgeToken,
      target: containerRef.current,
      onSuccess: () => {
        setBridgeComplete(true);
      },
      onClose: () => {},
      onError: (error: unknown) => {
        console.error("Bridge error:", error);
      },
    });

    bridgeRef.current.open();

    return () => {
      bridgeRef.current?.close();
    };
  }, [bridgeToken, bridgeLoaded]);

  if (!orderId && !bridgeToken) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground text-center max-w-sm">
          Click the button below to create a Truv order. The backend will call{" "}
          <code className="bg-muted px-1 rounded text-xs">POST /v1/orders/</code>{" "}
          and return a bridge token.
        </p>
        <Button onClick={onCreateOrder} disabled={loading}>
          {loading && <IconLoader2 size={16} className="mr-2 animate-spin" />}
          Create Order & Open Bridge
        </Button>
      </div>
    );
  }

  if (bridgeComplete) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-semibold text-lg">Verification Complete</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          The applicant has successfully connected their employer.
          Proceed to the next step to review the verified data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Truv Bridge Widget</h3>
          <p className="text-sm text-muted-foreground">
            The applicant connects their employer through the embedded widget below.
          </p>
        </div>
        {!bridgeLoaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 size={16} className="animate-spin" />
            Loading Bridge...
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <IconExternalLink size={12} />
          Sandbox mode — use <code className="bg-muted px-1 rounded">goodlogin</code> / <code className="bg-muted px-1 rounded">goodpassword</code>
        </p>
      </div>

      <div
        ref={containerRef}
        className="min-h-[500px] rounded-lg border bg-white"
      />
    </div>
  );
}
