import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import bridgeRoutes from '../../../server/routes/bridge.js';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';

/**
 * Helper: start a tiny Express server with the bridge router mounted,
 * using the given mocked dependencies. Returns { server, baseUrl, truv, apiLogger }.
 */
function startTestServer(truvOverrides = {}) {
  const truv = createMockTruv(truvOverrides);
  const apiLogger = createMockApiLogger();

  const app = express();
  app.use(express.json());
  app.use(bridgeRoutes({ truv, apiLogger }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, truv, apiLogger });
    });
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── POST /api/bridge-token ─────────────────────────────────────────────────

describe('POST /api/bridge-token', () => {
  const userId = 'user-abc-123';
  const bridgeToken = 'bt_tok_xyz';

  describe('happy path', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        createUser: {
          statusCode: 200,
          data: { id: userId },
          durationMs: 12,
        },
        createUserBridgeToken: {
          statusCode: 200,
          data: { bridge_token: bridgeToken },
          durationMs: 8,
        },
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns bridge_token and user_id', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: ['payroll'] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ bridge_token: bridgeToken, user_id: userId });
    });

    it('logs POST /v1/users/ with the correct userId', () => {
      const calls = ctx.apiLogger.logApiCall.mock.calls;
      const userCall = calls.find(
        ([arg]) => arg.endpoint === '/v1/users/' && arg.method === 'POST',
      );
      expect(userCall).toBeDefined();
      // userId should be the real id returned by createUser, not null
      expect(userCall[0].userId).toBe(userId);
    });

    it('logs POST /v1/users/:id/tokens/', () => {
      const calls = ctx.apiLogger.logApiCall.mock.calls;
      const tokenCall = calls.find(
        ([arg]) => arg.endpoint === `/v1/users/${userId}/tokens/` && arg.method === 'POST',
      );
      expect(tokenCall).toBeDefined();
      expect(tokenCall[0].userId).toBe(userId);
    });
  });

  describe('company_mapping_id passthrough', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        createUser: { statusCode: 200, data: { id: userId }, durationMs: 5 },
        createUserBridgeToken: {
          statusCode: 200,
          data: { bridge_token: bridgeToken },
          durationMs: 5,
        },
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('passes company_mapping_id to createUserBridgeToken', async () => {
      await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_type: 'income',
          data_sources: ['payroll'],
          company_mapping_id: 'cmp_42',
        }),
      });

      expect(ctx.truv.createUserBridgeToken).toHaveBeenCalledWith(
        userId,
        'income',
        expect.objectContaining({ company_mapping_id: 'cmp_42' }),
      );
    });
  });

  describe('provider_id passthrough', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        createUser: { statusCode: 200, data: { id: userId }, durationMs: 5 },
        createUserBridgeToken: {
          statusCode: 200,
          data: { bridge_token: bridgeToken },
          durationMs: 5,
        },
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('passes provider_id to createUserBridgeToken', async () => {
      await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_type: 'income',
          data_sources: ['payroll'],
          provider_id: 'prov_99',
        }),
      });

      expect(ctx.truv.createUserBridgeToken).toHaveBeenCalledWith(
        userId,
        'income',
        expect.objectContaining({ provider_id: 'prov_99' }),
      );
    });
  });

  // ─── Error paths ────────────────────────────────────────────────────────

  describe('when createUser returns 400', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({
        createUser: {
          statusCode: 400,
          data: { message: 'Bad request' },
          durationMs: 3,
        },
      });

      res = await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income' }),
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns 400 with error payload', async () => {
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to create user');
      expect(body.details).toEqual({ message: 'Bad request' });
    });

    it('still logs the POST /v1/users/ call', () => {
      const calls = ctx.apiLogger.logApiCall.mock.calls;
      const userCall = calls.find(
        ([arg]) => arg.endpoint === '/v1/users/' && arg.method === 'POST',
      );
      expect(userCall).toBeDefined();
    });

    it('does not call createUserBridgeToken', () => {
      expect(ctx.truv.createUserBridgeToken).not.toHaveBeenCalled();
    });
  });

  describe('when createUserBridgeToken returns 400', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({
        createUser: { statusCode: 200, data: { id: userId }, durationMs: 5 },
        createUserBridgeToken: {
          statusCode: 400,
          data: { message: 'Invalid token params' },
          durationMs: 4,
        },
      });

      res = await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: ['payroll'] }),
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns 400 with error payload', async () => {
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to create bridge token');
      expect(body.details).toEqual({ message: 'Invalid token params' });
    });

    it('logs both API calls', () => {
      const calls = ctx.apiLogger.logApiCall.mock.calls;
      expect(calls.length).toBe(2);

      const userCall = calls.find(
        ([arg]) => arg.endpoint === '/v1/users/' && arg.method === 'POST',
      );
      expect(userCall).toBeDefined();

      const tokenCall = calls.find(
        ([arg]) => arg.endpoint === `/v1/users/${userId}/tokens/` && arg.method === 'POST',
      );
      expect(tokenCall).toBeDefined();
    });
  });
});
