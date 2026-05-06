/**
 * FILE SUMMARY: useDeviceMode hook
 *
 * Shared state for the mobile/desktop preview toggle. Persisted in localStorage
 * so the choice survives page reloads. A tiny module-scoped pub/sub keeps every
 * subscriber in sync without needing a Context provider.
 */

import { useState, useEffect } from 'preact/hooks';

const STORAGE_KEY = 'truv-demo-device-mode';
const listeners = new Set();
let current = 'mobile';

if (typeof localStorage !== 'undefined') {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'mobile' || saved === 'desktop') current = saved;
}

export function useDeviceMode() {
  const [mode, setLocal] = useState(current);

  useEffect(() => {
    const handler = m => setLocal(m);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  const setMode = (m) => {
    if (m === current) return;
    current = m;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, m);
    listeners.forEach(l => l(m));
  };

  return [mode, setMode];
}
