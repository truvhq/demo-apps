import { useState, useCallback } from "react";
import type { CreateOrderResponse } from "@/lib/types";

interface DemoState {
  orderId: string | null;
  truvOrderId: string | null;
  bridgeToken: string | null;
  shareUrl: string | null;
  status: string | null;
  formData: Record<string, string>;
}

export function useDemo() {
  const [state, setState] = useState<DemoState>({
    orderId: null,
    truvOrderId: null,
    bridgeToken: null,
    shareUrl: null,
    status: null,
    formData: {},
  });

  const setFormData = useCallback((data: Record<string, string>) => {
    setState((prev) => ({ ...prev, formData: { ...prev.formData, ...data } }));
  }, []);

  const setOrderData = useCallback((data: CreateOrderResponse) => {
    setState((prev) => ({
      ...prev,
      orderId: data.order_id,
      truvOrderId: data.truv_order_id,
      bridgeToken: data.bridge_token,
      shareUrl: data.share_url,
      status: data.status,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      orderId: null,
      truvOrderId: null,
      bridgeToken: null,
      shareUrl: null,
      status: null,
      formData: {},
    });
  }, []);

  return { ...state, setFormData, setOrderData, reset };
}
