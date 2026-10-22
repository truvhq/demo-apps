/**
 * FILE SUMMARY: Tracks whether any DeviceFrame is currently mounted in the
 * tree, so the Layout's mobile/desktop toggle can show only when relevant.
 *
 * DeviceFrame instances call useRegisterDeviceFrame() in mount/unmount; a
 * module-level counter keeps the signal right for multiple frames or quick
 * remounts. Layout reads useHasDeviceFrame() and conditionally renders the
 * DeviceToggle. Demos don't need to do anything — registration is automatic.
 *
 * The count lives outside React state on purpose. Registering a frame must
 * re-render only the components that read it, never the provider's children:
 * when the provider owned the state, every frame mount re-rendered the whole
 * App from the top, and in a dev tab that had hot-reloaded that remounted the
 * App and closed the Bridge window that had just opened.
 */

import { useEffect, useState } from 'preact/hooks';

let frames = 0;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn(frames > 0));

// Kept so main.jsx does not change; it no longer holds any state.
export function DeviceFramePresenceProvider({ children }) {
  return children;
}

export function useRegisterDeviceFrame() {
  useEffect(() => {
    frames += 1;
    notify();
    return () => {
      frames -= 1;
      notify();
    };
  }, []);
}

export function useHasDeviceFrame() {
  const [has, setHas] = useState(frames > 0);
  useEffect(() => {
    listeners.add(setHas);
    setHas(frames > 0);
    return () => { listeners.delete(setHas); };
  }, []);
  return has;
}
