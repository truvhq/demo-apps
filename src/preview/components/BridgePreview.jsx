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
 *
 * SCROLLING (inline + isOrder only):
 * The hosted order flow at my.truv.com measures its own content and posts
 * `truv/order/set-height` to the SDK, which writes the value straight onto
 * iframe.style.height and does nothing else — it never scrolls, and it never
 * caps the height at the container. So the frame simply grows, and scrolling
 * falls to whichever ANCESTOR is the scroll container — not necessarily the
 * element the widget is mounted into. On an ordinary page that is the document
 * itself and the integration needs no CSS at all; the requirement is really a
 * negative one — nothing between the iframe and that scroll container may clip
 * the overflow or pin the iframe to a fixed height.
 *
 * Here the direct parent has to be the one, because this preview runs inside a
 * fixed-size device-frame iframe: the document can't grow, so the scroll has to
 * happen somewhere below it.
 *
 * Tenants whose flow fits the viewport scroll inside the Bridge document and
 * look fine either way, which is why clipped screens only showed up for some
 * of them.
 */

import { useEffect, useRef } from 'preact/hooks';
import { postEvent } from '../protocol.js';

// The SDK hardcodes https://my.truv.com/orders/ as the inline frame's src, so
// that is the only origin a height message can legitimately come from. If Truv
// ever moves the flow, auto-scroll quietly stops firing — scrolling itself is
// pure CSS and keeps working.
const BRIDGE_ORIGIN = 'https://my.truv.com';
const SET_HEIGHT = 'truv/order/set-height';
// Advancing to a new step in the order wizard moves the reported height by
// hundreds of pixels; an in-place reflow (validation error, an expanded field)
// moves it by a few dozen. Only the former should reset the scroll position —
// yanking the viewport to the top right after an error message rendered would
// hide the one thing the user needs to read.
const SCREEN_CHANGE_PX = 100;

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

  useScrollToTopOnScreenChange(containerRef, inline);

  // Modal mode: side-effect only — the SDK injects its own overlay at the iframe
  // document level, and rendering nothing keeps the base view mounted behind the
  // backdrop. Inline mode: provide the full-viewport container the widget mounts
  // into (opaque, so it covers the base view like a dedicated screen).
  //
  // This container is the nearest scrollable ancestor (see SCROLLING above), so
  // it must NOT pin the iframe's height:
  // `min-h-full` keeps a short flow filling the screen while still letting
  // set-height grow the frame past the viewport (min-height loses to a larger
  // used height, and the SDK's inline style beats its own height="100%"
  // attribute). `block` restates what Preflight already gives iframes, and is
  // spelled out because it is load-bearing here: an inline-level iframe at
  // exactly 100% height leaves descender space under its baseline, which would
  // keep a few pixels of scrollbar permanently visible.
  //
  // Deliberately NO `overscroll-contain`: on a short window the device frame
  // bottoms out at its min-height and the host page starts scrolling too, so
  // there are legitimately two nested scrollbars. Containing the overscroll
  // there strands the user — the wheel sits over this container, the outer
  // scrollbar is visible but nothing reaches it. Let the scroll chain out once
  // this container hits its end.
  if (!inline) return null;
  return (
    <div
      ref={containerRef}
      class="fixed inset-0 bg-white overflow-y-auto [&_iframe]:block [&_iframe]:w-full [&_iframe]:min-h-full [&_iframe]:border-none"
    />
  );
}

// Once the iframe can outgrow its container, a user who scrolled to the bottom
// of one step would land mid-page on the next one. Watch the same set-height
// message the SDK acts on and reset the scroll position when the step changes.
function useScrollToTopOnScreenChange(containerRef, inline) {
  useEffect(() => {
    if (!inline) return;
    let lastHeight = null;
    function onMessage(e) {
      if (e.origin !== BRIDGE_ORIGIN || e.data?.type !== SET_HEIGHT) return;
      const height = e.data.message?.height;
      if (typeof height !== 'number') return;
      const previous = lastHeight;
      lastHeight = height;
      // First measurement is the initial render, which is already at the top.
      if (previous === null || Math.abs(height - previous) < SCREEN_CHANGE_PX) return;
      if (containerRef.current) containerRef.current.scrollTop = 0;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [containerRef, inline]);
}
