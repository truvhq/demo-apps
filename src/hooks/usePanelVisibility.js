/**
 * FILE SUMMARY: usePanelVisibility hook
 *
 * Shared state for the right-side Panel show/hide toggle. Persisted in
 * localStorage so the choice survives page reloads. Mirrors useDeviceMode's
 * pub/sub pattern so subscribers stay in sync without a Context provider.
 */

import { useState, useEffect } from 'preact/hooks';

const STORAGE_KEY = 'truv-demo-panel-visible';
const listeners = new Set();
let current = true;

if (typeof localStorage !== 'undefined') {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === '0') current = false;
  else if (saved === '1') current = true;
}

export function usePanelVisibility() {
  const [visible, setLocal] = useState(current);

  useEffect(() => {
    const handler = v => setLocal(v);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  const setVisible = (v) => {
    const next = !!v;
    if (next === current) return;
    current = next;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    listeners.forEach(l => l(next));
  };

  return [visible, setVisible];
}
