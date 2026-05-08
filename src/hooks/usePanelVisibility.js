/**
 * FILE SUMMARY: usePanelVisibility hook
 *
 * Shared state for the right-side Panel show/hide toggle. Per-breakpoint:
 *   - lg+ (sidebar) : default shown, persisted across reloads in localStorage.
 *   - <lg (overlay) : default hidden, in-memory only — opening the overlay on
 *                     a narrow viewport is a transient inspection action, not
 *                     a default mode worth carrying across reloads. The value
 *                     also resets to the default whenever the last subscriber
 *                     unsubscribes (Layout unmount, i.e. the user exits a
 *                     scenario), so re-entering starts with the overlay closed.
 * Reacts to live viewport changes through matchMedia so resizing across the
 * 1024px boundary swaps to the value that applies at the new breakpoint.
 */

import { useState, useEffect } from 'preact/hooks';

const STORAGE_KEY_LG = 'truv-demo-panel-visible-lg';
const LG_QUERY = '(min-width: 1024px)';

const listeners = new Set();
let lgValue = true;     // default visible on wide screens; persisted
let smValue = false;    // default hidden on narrow screens; in-memory only
let isLg = true;

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia(LG_QUERY);
    isLg = mq.matches;
    mq.addEventListener('change', e => {
      isLg = e.matches;
      // When the viewport crosses up into lg, drop any narrow-viewport opening
      // so the next time the user resizes back down the overlay starts hidden.
      if (isLg) smValue = false;
      listeners.forEach(l => l(isLg ? lgValue : smValue));
    });
  }
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_LG);
    if (saved === '0') lgValue = false;
    else if (saved === '1') lgValue = true;
  }
}

export function usePanelVisibility() {
  const [visible, setLocal] = useState(isLg ? lgValue : smValue);

  useEffect(() => {
    const handler = v => setLocal(v);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      // Last subscriber leaving means every consumer (Layout + its toggle
      // buttons) has unmounted — the user exited the scenario. Reset the
      // narrow-viewport value so re-entering starts with the overlay closed.
      if (listeners.size === 0) smValue = false;
    };
  }, []);

  const setVisible = (v) => {
    const next = !!v;
    if (isLg) {
      if (next === lgValue) return;
      lgValue = next;
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY_LG, next ? '1' : '0');
    } else {
      if (next === smValue) return;
      smValue = next;
    }
    listeners.forEach(l => l(next));
  };

  return [visible, setVisible];
}
