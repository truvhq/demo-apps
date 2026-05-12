/**
 * FILE SUMMARY: Tracks whether any DeviceFrame is currently mounted in the
 * tree, so the Layout's mobile/desktop toggle can show only when relevant.
 *
 * DeviceFrame instances call useRegisterDeviceFrame() in mount/unmount; the
 * provider keeps a counter so multiple frames or quick remounts don't break
 * the signal. Layout reads useHasDeviceFrame() and conditionally renders the
 * DeviceToggle. Demos don't need to do anything — registration is automatic.
 */

import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';

const Ctx = createContext({ count: 0, increment: () => {}, decrement: () => {} });

export function DeviceFramePresenceProvider({ children }) {
  const [count, setCount] = useState(0);
  // Stable identity for the mutators — children's mount/unmount effects depend
  // on these and shouldn't re-fire just because count changed.
  const api = useMemo(() => ({
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => c - 1),
  }), []);
  const value = useMemo(() => ({ count, ...api }), [count, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRegisterDeviceFrame() {
  const { increment, decrement } = useContext(Ctx);
  useEffect(() => {
    increment();
    return decrement;
  }, [increment, decrement]);
}

export function useHasDeviceFrame() {
  return useContext(Ctx).count > 0;
}
