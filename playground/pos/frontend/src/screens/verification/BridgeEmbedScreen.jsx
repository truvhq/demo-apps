import React, { useEffect, useRef, useState } from 'react';

import { addBridgeEvent, Card } from '@truv-demo/design-system';

/** Embeds Truv's Bridge widget inline. Ported from the reference implementation's
 * BridgeScreen.jsx (TruvBridge.init lifecycle) — window.TruvBridge comes from
 * the cdn.truv.com/bridge.js script tag loaded in index.html.
 *
 * Two things confirmed against that reference implementation:
 * 1. Sizing — the Bridge SDK injects its own <iframe> with its own default
 *    inline width/height; without overriding those explicitly the widget
 *    renders at a tiny intrinsic size instead of filling its container.
 * 2. Double-init guard — React 18 StrictMode double-invokes effects in dev
 *    (mount -> effect -> cleanup -> mount -> effect again). Without a guard,
 *    TruvBridge.init()+open() runs, gets torn down by the first cleanup, then
 *    races to re-init into the same container — which can leave the iframe
 *    blank rather than just small. bridgeInitRef prevents the second init.
 */
export function BridgeEmbedScreen({ bridgeToken, isOrder = true, onSuccess, onClose }) {
  const containerRef = useRef(null);
  const bridgeInitRef = useRef(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!bridgeToken || !containerRef.current || bridgeInitRef.current) return;
    if (!window.TruvBridge) {
      const message = 'window.TruvBridge is not loaded — check the cdn.truv.com/bridge.js script tag.';
      setEvents((e) => [...e, { type: 'error', message }]);
      addBridgeEvent({ label: `Error: ${message}` });
      return;
    }
    bridgeInitRef.current = true;
    const bridge = window.TruvBridge.init({
      bridgeToken,
      isOrder,
      position: { type: 'inline', container: containerRef.current },
      onLoad: () => {
        setEvents((e) => [...e, { type: 'load' }]);
        addBridgeEvent({ label: 'onLoad()' });
      },
      onEvent: (event, meta) => {
        setEvents((e) => [...e, { type: 'event', event }]);
        addBridgeEvent({ label: `onEvent("${event}")`, data: meta ?? null });
        if (event === 'COMPLETED' || event === 'order') {
          onSuccess?.();
        }
      },
      onSuccess: () => {
        addBridgeEvent({ label: 'onSuccess()' });
        onSuccess?.();
      },
      onClose: () => {
        addBridgeEvent({ label: 'onClose()' });
        onClose?.();
      },
    });
    bridge.open();
    return () => { try { bridge.close(); } catch { /* ignore */ } };
  }, [bridgeToken]);

  return (
    <Card title="Complete Verification">
      <style>{`
        .truv-bridge-container { width: 100%; height: 700px; overflow: hidden; border: 1px solid var(--truv-grey-30); border-radius: 12px; }
        .truv-bridge-container iframe { width: 100% !important; height: 100% !important; border: none !important; }
      `}</style>
      <div ref={containerRef} className="truv-bridge-container" />
      <div style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
        Sandbox test login: employer "Home Depot", username <code>goodlogin</code>, password <code>goodpassword</code>.
      </div>
      {events.length > 0 && (
        <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--truv-grey-60)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {events.map((e, i) => (
            <div key={i}>{e.type === 'event' ? `Bridge event: ${e.event}` : e.type === 'error' ? `Error: ${e.message}` : e.type}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
