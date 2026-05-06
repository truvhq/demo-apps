/**
 * FILE SUMMARY: Preview iframe ↔ host postMessage protocol.
 *
 * Two directions:
 *   iframe → parent
 *     { type: 'preview:ready' }                                   handshake; parent may then send render commands
 *     { type: 'preview:event', name: '<event-name>', args: [...] } user/SDK event from inside the preview
 *
 *   parent → iframe
 *     { type: 'preview:render', component: '<name>', props: {...} } render the named component with given props
 *
 * Event names used by SmartRouting:
 *   form:submit       — ApplicationForm onSubmit, args: [formResult]
 *   method:select     — MethodPicker onSelect, args: [methodId]
 *   bridge:onLoad     — TruvBridge onLoad, args: []
 *   bridge:onEvent    — TruvBridge onEvent, args: [type, payload]
 *   bridge:onSuccess  — TruvBridge onSuccess, args: [publicToken, meta]
 *   bridge:onClose    — TruvBridge onClose, args: []
 *
 * Same-origin only — both sides use window.location.origin as targetOrigin.
 */

export const MSG = {
  READY: 'preview:ready',
  RENDER: 'preview:render',
  EVENT: 'preview:event',
};

export function postReady() {
  window.parent.postMessage({ type: MSG.READY }, window.location.origin);
}

export function postEvent(name, args = []) {
  window.parent.postMessage({ type: MSG.EVENT, name, args }, window.location.origin);
}

export function postRender(targetWindow, component, props = {}) {
  targetWindow.postMessage({ type: MSG.RENDER, component, props }, window.location.origin);
}
