/**
 * FILE SUMMARY: The app-wide error handler. A malformed or oversized request body gets a short JSON answer,
 * not Express's default page with a stack trace and file paths in it. Anything else keeps its status
 * and loses its detail: the detail goes to the server log.
 */
export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'The request body is not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'The request body is too large.' });
  console.error(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  return res.status(status).json({ error: status === 500 ? 'internal_error' : 'request_failed' });
}
