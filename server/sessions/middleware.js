/**
 * FILE SUMMARY: Per-request session resolution middleware
 * DATA FLOW: request --> sessionMiddleware --> req.truv (per-request TruvClient)
 *                                          --> req.session (id only)
 * INTEGRATION PATTERN: Sits between cors and routes in server/index.js so all
 * downstream handlers can read req.truv. Handlers that require a session reject
 * the request with 401 when req.truv is null.
 */

import { TruvClient } from '../truv.js';
import { SESSION_COOKIE_NAME, verifySessionCookie } from './cookie.js';

export function sessionMiddleware({ store, cookieSecret }) {
  return function attachSession(req, _res, next) {
    req.truv = null;
    req.session = null;

    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) return next();

    const id = verifySessionCookie(cookie, cookieSecret);
    if (!id) return next();

    const record = store.get(id);
    if (!record) return next();

    store.touch(id);
    req.truv = new TruvClient({ clientId: record.clientId, secret: record.secret });
    req.session = { id };
    next();
  };
}
