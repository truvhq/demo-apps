/**
 * FILE SUMMARY: usePreviewIframe — host-side channel to the preview iframe.
 *
 * Manages the postMessage handshake with `preview.html`: listens for events from
 * the iframe and dispatches them to the supplied handler map; exposes a `send`
 * function that delivers `preview:render` commands to the iframe (the latest
 * command is replayed on every `preview:ready`, so it survives iframe reloads).
 *
 * Only one command is buffered: state-derived render commands are idempotent,
 * and the host always sends the latest snapshot — earlier intent is irrelevant
 * once superseded.
 */

import { useEffect, useRef, useCallback } from 'preact/hooks';
import { MSG, postRender } from '../preview/protocol.js';

export function usePreviewIframe(iframeRef, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const readyRef = useRef(false);
  const latestCmdRef = useRef(null);

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      const w = iframeRef.current?.contentWindow;
      if (!w || e.source !== w) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === MSG.READY) {
        readyRef.current = true;
        if (latestCmdRef.current) {
          postRender(w, latestCmdRef.current.component, latestCmdRef.current.props);
        }
        return;
      }
      if (msg.type === MSG.EVENT) {
        const handler = handlersRef.current?.[msg.name];
        if (typeof handler === 'function') handler(...(msg.args || []));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef]);

  // If the iframe element itself reloads (e.g., HMR, devtools refresh), the new
  // PreviewRoot will postReady again — but we need to mark not-ready so we
  // don't try to use the previous contentWindow before it's gone.
  useEffect(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    function onLoad() { readyRef.current = false; }
    ifr.addEventListener('load', onLoad);
    return () => ifr.removeEventListener('load', onLoad);
  }, [iframeRef]);

  const send = useCallback((component, props) => {
    latestCmdRef.current = { component, props };
    const w = iframeRef.current?.contentWindow;
    if (readyRef.current && w) {
      postRender(w, component, props);
    }
  }, [iframeRef]);

  return send;
}
