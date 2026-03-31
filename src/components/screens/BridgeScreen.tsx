import { useState, useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App';
import { API_BASE } from '../hooks';

interface BridgeScreenProps {
  orderId: string;
  demoPath: string;
  companyMappingId?: string;
  addBridgeEvent: (type: string, data: unknown) => void;
  startPolling: (userId: string) => void;
  onCompleted?: () => void;
}

export function BridgeScreen({ orderId, demoPath, companyMappingId, addBridgeEvent, startPolling, onCompleted }: BridgeScreenProps) {
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeInitRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json() as { bridge_token?: string; user_id?: string; error?: string };
        if (cancelled) return;
        if (!resp.ok) { setError(data.error ?? 'Unknown error'); return; }
        setBridgeToken(data.bridge_token ?? null);
        if (data.user_id) startPolling(data.user_id);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!bridgeToken || !containerRef.current || !window.TruvBridge || bridgeInitRef.current) return;
    bridgeInitRef.current = true;
    const container = containerRef.current;
    const bridgeOpts: TruvBridgeOptions = {
      bridgeToken, isOrder: true,
      position: { type: 'inline', container },
    };
    if (companyMappingId) bridgeOpts.companyMappingId = companyMappingId;
    const b = window.TruvBridge.init({
      ...bridgeOpts,
      onLoad: () => addBridgeEvent('onLoad', null),
      onEvent: (type, _, source) => {
        addBridgeEvent('onEvent', { eventType: type, source });
        if (type === 'COMPLETED' && source === 'order') {
          if (onCompleted) onCompleted();
          navigate(`${demoPath}/waiting/${orderId}`);
        }
      },
      onSuccess: () => addBridgeEvent('onSuccess', null),
      onClose: () => addBridgeEvent('onClose', null),
    });
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken]);

  if (error) return <div class="text-center py-16 text-red-600">{error}</div>;
  if (!bridgeToken) return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return <div ref={containerRef} class="w-full h-full overflow-hidden bg-white [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" style="zoom: 0.85;" />;
}
