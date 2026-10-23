/**
 * FILE SUMMARY: Tracks whether any DeviceFrame is currently mounted in the
 * tree, so the Layout's mobile/desktop toggle can show only when relevant.
 *
 * DeviceFrame instances call useRegisterDeviceFrame() in mount/unmount; a
 * module-level counter keeps the count right with multiple frames or quick
 * remounts. Layout reads useHasDeviceFrame() and conditionally renders the
 * DeviceToggle. Demos don't need to do anything — registration is automatic.
 *
 * The count is kept outside React state. When the provider held it in state,
 * every frame mount re-rendered the whole App, and in a dev tab that had
 * hot-reloaded that remounted the App and closed the Bridge window that had just
 * opened. Now only the components that read the count re-render.
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
