/**
 * FILE SUMMARY: Production static-file serving (deployment only)
 *
 * Local development serves the frontend from the Vite dev server, so this does
 * nothing then — there's no dist/. After `npm run build`, a deployment serves
 * the built files here and injects runtime config (dashboard URL, Auth0, Bridge
 * URL) into the HTML so one build can target any environment without rebuilding.
 */
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

// URL baked into the built HTML; replaced at serve time when BRIDGE_URL overrides it.
const BUILT_IN_BRIDGE_URL = 'https://cdn.truv.com/bridge.js';

// Rejects the request unless it has a session. `req.truv` is set by the session
// middleware for a signed-in visitor (and for everyone in local mode), the same
// rule /api/session/status uses.
export function requireSession(req, res, next) {
  if (req.truv) return next();
  res.status(401).json({ error: 'session_required' });
}

// Mounts the SPA from dist/ if it exists. No-op for local dev (Vite serves the
// frontend). The catch-all must be the last route registered on the app.
export function mountStaticIfBuilt(app, config) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const distPath = join(__dirname, '..', 'dist');
  if (!existsSync(join(distPath, 'index.html'))) return;

  const configJson = JSON.stringify({
    dashboardUrl: config.dashboard.url,
    auth0Domain: config.sso.domain,
    auth0ClientId: config.sso.clientId,
    auth0Audience: config.sso.audience,
  }).replace(/</g, '\\u003c');
  const configScript = `<script>window.__DEMO_CONFIG__=${configJson};</script>`;

  const renderHtml = (file) => readFileSync(join(distPath, file), 'utf-8')
    .replaceAll(BUILT_IN_BRIDGE_URL, config.bridgeUrl)
    .replace('</head>', `${configScript}</head>`);
  const indexHtml = renderHtml('index.html');
  const previewHtml = existsSync(join(distPath, 'preview.html')) ? renderHtml('preview.html') : null;

  // Serve injected HTML explicitly; static serves only hashed assets.
  if (previewHtml) app.get('/preview.html', (_req, res) => res.type('html').send(previewHtml));
  // The Batching guide's downloads (PDFs, kit zip, CSV) are behind sign-in like the
  // page itself. Anything else in dist/ is public: the sign-in screen needs it.
  app.use('/batching', requireSession);
  app.use(express.static(distPath, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.type('html').send(indexHtml);
  });
}
