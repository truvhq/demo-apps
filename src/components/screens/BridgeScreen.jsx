import { useState, useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App.jsx';
import { API_BASE } from '../hooks.js';

export function BridgeScreen({ orderId, demoPath, companyMappingId, addBridgeEvent, startPolling, onCompleted }) {
  const [bridgeToken, setBridgeToken] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const bridgeInitRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) { setError(data.error || 'Unknown error'); return; }
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!bridgeToken || !containerRef.current || !window.TruvBridge || bridgeInitRef.current) return;
    bridgeInitRef.current = true;
    const bridgeOpts = {
      bridgeToken, isOrder: true,
      position: { type: 'inline', container: containerRef.current },
    };
    if (companyMappingId) bridgeOpts.companyMappingId = companyMappingId;
    const b = window.TruvBridge.init({
      ...bridgeOpts,
      onLoad: () => addBridgeEvent('onLoad()', null),
      onEvent: (type, payload, source) => {
        const payloadStr = payload ? 'payload' : 'undefined';

        addBridgeEvent(`onEvent("${type}", ${payloadStr}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
        if (type === 'COMPLETED' && source === 'order') {
          if (onCompleted) onCompleted();
          navigate(`${demoPath}/waiting/${orderId}`);
        }
      },
      onSuccess: () => addBridgeEvent('onSuccess()', null),
      onClose: () => {
        addBridgeEvent('onClose()', null);
        navigate(`${demoPath}`);
      },
    });
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken]);

  if (error) return <div class="text-center py-16 text-red-600">{error}</div>;
  if (!bridgeToken) return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return <div ref={containerRef} class="w-full h-full overflow-hidden bg-white [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" style="zoom: 0.85;" />;
}
