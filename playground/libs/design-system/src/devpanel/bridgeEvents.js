// Module-level store (not React state) for TruvBridge SDK lifecycle events —
// captured wherever `window.TruvBridge.init()` actually runs (BridgeEmbedScreen,
// in both POS and LOS), independent of whether the Dev Panel happens to be
// mounted/open at that moment, or which screen is currently on top. This is
// the same relationship the reference demo app (`/Users/brian/demo-apps`)
// has between its Bridge widget screens and its dev panel's "Bridge" tab —
// distinct from the "API Calls" tab (server-proxied REST calls) and
// "Webhooks" tab (server-received async events): this is client-side SDK
// callback traffic that never touches the backend.
let events = [];
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(events));
}

export function addBridgeEvent(event) {
  events = [{ ...event, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString() }, ...events].slice(0, 200);
  notify();
}

export function getBridgeEvents() {
  return events;
}

export function subscribeBridgeEvents(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
