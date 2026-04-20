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

  // ─── first_name / last_name forwarding ──────────────────────────────────
  //
  // Regression coverage for the bug where /api/bridge-token was ignoring the
  // form's name fields and every Truv user was created as "John Johnson".

  describe('first_name / last_name forwarding', () => {
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

    it('forwards both first_name and last_name to createUser', async () => {
      await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_type: 'income',
          first_name: 'Ada',
          last_name: 'Lovelace',
        }),
      });

      expect(ctx.truv.createUser).toHaveBeenCalledOnce();
      expect(ctx.truv.createUser).toHaveBeenCalledWith({
        first_name: 'Ada',
        last_name: 'Lovelace',
      });
    });

    it('omits name keys entirely when the request body leaves them out', async () => {
      ctx.truv.createUser.mockClear();
      await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income' }),
      });

      expect(ctx.truv.createUser).toHaveBeenCalledWith({});
    });

    it('drops a blank first_name and forwards only last_name', async () => {
      ctx.truv.createUser.mockClear();
      await fetch(`${ctx.baseUrl}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', first_name: '', last_name: 'Solo' }),
      });

      expect(ctx.truv.createUser).toHaveBeenCalledWith({ last_name: 'Solo' });
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

// ─── GET /api/links/:linkId/pll ─────────────────────────────────────────────
//
// Dedicated PLL report endpoint added for the Paycheck-Linked Loans demo.
// The frontend fetches this after the task-status-updated webhook with status
// "done" arrives, using the link_id from that webhook's payload.

describe('GET /api/links/:linkId/pll', () => {
  const linkId = 'link_pll_42';
  const pllReport = {
    deposit_details: { bank_name: 'Truv Bank', account_type: 'checking' },
    employer: { name: 'Home Depot' },
    status: 'done',
  };

  describe('happy path', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({
        getLinkReport: { statusCode: 200, data: pllReport, durationMs: 20 },
      });

      res = await fetch(
        `${ctx.baseUrl}/api/links/${linkId}/pll?user_id=user_pll`,
      );
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('returns the PLL report body as-is', async () => {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(pllReport);
    });

    it("calls Truv's getLinkReport with the 'pll' report type", () => {
      expect(ctx.truv.getLinkReport).toHaveBeenCalledWith(linkId, 'pll');
    });

    it('logs the canonical /v1/links/{linkId}/pll/report/ endpoint string', () => {
      const call = ctx.apiLogger.logApiCall.mock.calls.find(
        ([arg]) => arg.method === 'GET' && arg.endpoint.includes('/pll/report/'),
      );
      expect(call).toBeDefined();
      expect(call[0].endpoint).toBe(`/v1/links/${linkId}/pll/report/`);
      expect(call[0].userId).toBe('user_pll');
    });
  });

  describe('when user_id query param is omitted', () => {
    let ctx;

    beforeAll(async () => {
      ctx = await startTestServer({
        getLinkReport: { statusCode: 200, data: pllReport, durationMs: 10 },
      });
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('still returns 200 and logs with a null userId', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/links/${linkId}/pll`);
      expect(res.status).toBe(200);

      const call = ctx.apiLogger.logApiCall.mock.calls.find(
        ([arg]) => arg.endpoint === `/v1/links/${linkId}/pll/report/`,
      );
      expect(call[0].userId).toBeNull();
    });
  });

  describe('when Truv returns 404', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({
        getLinkReport: {
          statusCode: 404,
          data: { error: { code: 'not_found', message: 'Requested object not found' } },
          durationMs: 12,
        },
      });

      res = await fetch(`${ctx.baseUrl}/api/links/bogus/pll`);
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('forwards the 404 status and Truv error body to the client', async () => {
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Failed to fetch PLL report');
      expect(body.details.error.code).toBe('not_found');
    });
  });

  describe('when Truv returns 500', () => {
    let ctx;
    let res;

    beforeAll(async () => {
      ctx = await startTestServer({
        getLinkReport: { statusCode: 500, data: { error: 'upstream' }, durationMs: 8 },
      });

      res = await fetch(`${ctx.baseUrl}/api/links/${linkId}/pll`);
    });

    afterAll(async () => {
      await closeServer(ctx.server);
    });

    it('forwards the 500 to the client so the UI can trigger its retry logic', async () => {
      expect(res.status).toBe(500);
    });
  });
});
