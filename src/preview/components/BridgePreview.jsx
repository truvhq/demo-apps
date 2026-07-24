/**
 * Initializes the TruvBridge widget inside the preview iframe in one of two
 * integration modes:
 *   - default (modal)  — Bridge renders its own modal that fills the iframe's
 *     viewport (Bridge flow: bank/payroll income, PLL, deposit switch).
 *   - inline           — Bridge is embedded into our own container so it sits in
 *     the page like an embedded merchant experience, matching the original
 *     BridgeScreen integration (Orders flow: POS Application/Tasks, Customer
 *     Portal). Pass `inline` for these.
 * SDK callbacks are forwarded to the host as preview:event messages so the Panel
 * sidebar gets the same Bridge log either way.
 */

import { useEffect, useRef } from 'preact/hooks';
import { postEvent } from '../protocol.js';

export function BridgePreview({ bridgeToken, isOrder, companyMappingId, inline }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!bridgeToken || !window.TruvBridge) return;
    const opts = { bridgeToken };
    if (isOrder) opts.isOrder = true;
    if (companyMappingId) opts.companyMappingId = companyMappingId;
    // Inline embed mounts the widget into our container; without a position the
    // SDK draws its own modal.
    if (inline && containerRef.current) opts.position = { type: 'inline', container: containerRef.current };
    const b = window.TruvBridge.init({
      ...opts,
      onLoad: () => postEvent('bridge:onLoad', []),
      onEvent: (type, payload, source) => postEvent('bridge:onEvent', [type, payload, source]),
      onSuccess: (publicToken, meta) => postEvent('bridge:onSuccess', [publicToken, meta]),
      onClose: () => postEvent('bridge:onClose', []),
    });
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken, isOrder, companyMappingId, inline]);

  // Modal mode: side-effect only — the SDK injects its own overlay at the iframe
  // document level, and rendering nothing keeps the base view mounted behind the
  // backdrop. Inline mode: provide the full-viewport container the widget mounts
  // into (opaque, so it covers the base view like a dedicated screen).
  if (!inline) return null;
  return <div ref={containerRef} class="fixed inset-0 bg-white overflow-hidden [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" />;
}
