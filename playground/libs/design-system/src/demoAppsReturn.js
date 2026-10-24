// Captures the demo-apps route a "Dev Playground" button was launched from
// (passed as ?from=<hash-route>) and persists it for this tab's session, so
// the Layout's "Back to Demo Apps" link can return to that exact demo instead
// of just the demo-apps home page. Call captureDemoAppsReturn() once on mount
// (safe to call on every Layout mount — it's a no-op once `from` is stripped).
const STORAGE_KEY = 'truv-demo-apps-return-from';

export function captureDemoAppsReturn() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  if (!from) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, from);
  } catch {
    // sessionStorage may be blocked (private mode, sandboxed iframe) — the
    // "Back to Demo Apps" link just falls back to the home page instead.
  }
  // Strip `from` so it doesn't linger in the URL bar or get re-captured.
  params.delete('from');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

export function getDemoAppsReturnUrl(demoAppsBaseUrl) {
  const base = demoAppsBaseUrl.replace(/\/$/, '');
  let from = '';
  try {
    from = sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    // ignore — falls back to the home page below
  }
  return from ? `${base}/#${from}` : base;
}
