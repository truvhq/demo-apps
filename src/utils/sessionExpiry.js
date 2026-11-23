/**
 * FILE SUMMARY: Detects an expired demo session on any /api call
 * DATA FLOW: fetch('/api/...') -> 401 {error: 'session_required'}
 *            -> window event 'truv:session-expired' -> useSession flips to signed-out
 *            -> App renders the sign-in screen at the same hash route
 *
 * Demos call /api directly, so before this watcher an expired session surfaced as
 * a mid-flow error inside whichever demo made the call. One wrapper around fetch
 * turns every such 401 into a single, clean "sign in again" transition.
 */

export const SESSION_EXPIRED_EVENT = 'truv:session-expired';

// Only the server's own "no session" answer counts. A 401 with any other error
// (bad credentials at sign-in, an upstream Truv 401) must not sign the visitor out.
function isSessionRequired(body) {
  return body?.error === 'session_required' || body?.error?.code === 'session_required';
}

function isApiCall(input) {
  const url = typeof input === 'string' ? input : input?.url;
  return typeof url === 'string' && url.includes('/api/');
}

/**
 * Wrap win.fetch once. Safe to call repeatedly.
 * @param {Window} win  Defaults to the browser window; injectable for tests.
 */
export function installSessionExpiryWatcher(win = window) {
  if (win.__truvSessionExpiryWatcher) return;
  win.__truvSessionExpiryWatcher = true;
  const originalFetch = win.fetch.bind(win);
  win.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    if (res.status === 401 && isApiCall(input)) {
      // Read a clone so the caller still gets an unread body.
      res.clone().json()
        .then(body => { if (isSessionRequired(body)) win.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)); })
        .catch(() => {});
    }
    return res;
  };
}
