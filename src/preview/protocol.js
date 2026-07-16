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
 * Render components (parent → iframe):
 *   application-form  — ApplicationForm wrapper; props include productType,
 *                       dataSource, employerLabel, showEmployer, requireEmployer
 *   method-picker     — SmartRouting method picker, props: { recommended, loading }
 *   task-list         — POSTasks task list, props: { applicationId, taskStates }
 *                       where taskStates maps taskId → 'ready'|'completed'|'failed'
 *   bridge            — TruvBridge modal overlay, props: { bridgeToken, isOrder, companyMappingId }
 *   loading           — spinner, props: { label, subtitle }
 *
 * Event names (iframe → parent):
 *   form:submit       — ApplicationForm onSubmit, args: [formResult]
 *   method:select     — MethodPicker onSelect, args: [methodId]
 *   task:start        — TaskList onStart, args: [taskId]
 *   nav:back          — back link under the method picker, args: []
 *   bridge:onLoad     — TruvBridge onLoad, args: []
 *   bridge:onEvent    — TruvBridge onEvent, args: [type, payload, source]
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
