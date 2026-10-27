import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { errorHandler } from '../../server/lib/error-handler.js';

const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => s.close(r)))); vi.restoreAllMocks(); });

function start(limit = '1kb') {
  const app = express();
  app.use(express.json({ limit }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/boom', () => { throw new Error('secret detail at /Users/someone/app.js'); });
  app.get('/teapot', (_req, _res, next) => next(Object.assign(new Error('x'), { status: 418 })));
  app.use(errorHandler);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
const post = (base, body) => fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

describe('the app-wide error handler', () => {
  it('answers a malformed body with a short JSON 400, not a page with a stack trace', async () => {
    const base = await start();
    const res = await post(base, '{');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text).error).toBe('bad_request');
    expect(text).not.toMatch(/node_modules|\.js:\d+|at /);
  });

  it('answers an oversized body with a 413', async () => {
    const base = await start('1kb');
    const res = await post(base, JSON.stringify({ pad: 'A'.repeat(5000) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('too_large');
  });

  it('keeps the status of other errors and drops their detail, which goes to the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = await start();
    const boom = await fetch(`${base}/boom`);
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain('/Users/');
    expect(log).toHaveBeenCalled();
    const teapot = await fetch(`${base}/teapot`);
    expect(teapot.status).toBe(418);
  });

  it('leaves a good request alone', async () => {
    const base = await start();
    const res = await post(base, JSON.stringify({ a: 1 }));
    expect(await res.json()).toEqual({ a: 1 });
  });
});

describe('the server entry', () => {
  it('is valid JavaScript, and wires the handler last', async () => {
    const entry = fileURLToPath(new URL('../../server/index.js', import.meta.url));
    expect(() => execFileSync(process.execPath, ['--check', entry], { stdio: 'pipe' })).not.toThrow();
    const { readFileSync } = await import('fs');
    const text = readFileSync(entry, 'utf8');
    expect(text.indexOf('app.use(errorHandler)')).toBeGreaterThan(text.indexOf('app.use(sandboxRoutes(deps))'));
    expect(text.indexOf('app.use(errorHandler)')).toBeGreaterThan(text.indexOf('mountStaticIfBuilt(app, config)'));
  });
});
