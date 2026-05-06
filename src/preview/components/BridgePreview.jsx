/**
 * Initializes the TruvBridge widget inside the preview iframe. Critically: NO
 * position: 'inline' — Bridge renders as its default modal that fills the
 * iframe's viewport. SDK callbacks are forwarded to the host as preview:event
 * messages so the Panel sidebar gets the same Bridge log it had pre-refactor.
 */

import { useEffect } from 'preact/hooks';
import { postEvent } from '../protocol.js';

export function BridgePreview({ bridgeToken, isOrder, companyMappingId }) {
  useEffect(() => {
    if (!bridgeToken || !window.TruvBridge) return;
    const opts = { bridgeToken };
    if (isOrder) opts.isOrder = true;
    if (companyMappingId) opts.companyMappingId = companyMappingId;
    const b = window.TruvBridge.init({
      ...opts,
      onLoad: () => postEvent('bridge:onLoad', []),
      onEvent: (type, payload, source) => postEvent('bridge:onEvent', [type, payload, source]),
      onSuccess: (publicToken, meta) => postEvent('bridge:onSuccess', [publicToken, meta]),
      onClose: () => postEvent('bridge:onClose', []),
    });
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken, isOrder, companyMappingId]);

  // Side-effect-only component: TruvBridge.init() injects its own DOM at the
  // iframe document level. Rendering nothing here lets the underlying base
  // view stay visible behind the modal's backdrop.
  return null;
}
