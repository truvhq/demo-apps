import { describe, it, expect } from 'vitest';
import { createMockTruv } from './mock-truv.js';
import { createMockApiLogger } from './mock-api-logger.js';

describe('mock factories', () => {
  describe('createMockTruv', () => {
    it('returns an object with all expected methods', () => {
      const truv = createMockTruv();

      const expectedMethods = [
        'createUser',
        'createUserBridgeToken',
        'searchCompanies',
        'searchProviders',
        'createOrder',
        'getOrder',
        'createVoieReport',
        'getVoieReport',
        'createAssetsReport',
        'getAssetsReport',
        'createIncomeInsightsReport',
        'getIncomeInsightsReport',
        'getDepositSwitchReport',
        'getAccessToken',
        'getLinkReport',
        'createDocumentCollection',
        'getDocumentCollection',
        'uploadToCollection',
        'finalizeCollection',
        'getLinkIncomeReport',
        'getFinalizationResults',
        'listWebhooks',
        'createWebhook',
        'deleteWebhook',
      ];

      for (const method of expectedMethods) {
        expect(truv[method]).toBeDefined();
        expect(typeof truv[method]).toBe('function');
      }
    });

    it('methods return default response', async () => {
      const truv = createMockTruv();
      const result = await truv.createUser();

      expect(result).toEqual({
        statusCode: 200,
        data: {},
        durationMs: 10,
        requestBody: null,
      });
    });

    it('accepts plain-object overrides merged into default response', async () => {
      const truv = createMockTruv({
        createUser: { data: { id: 'user-123' } },
      });

      const result = await truv.createUser();
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ id: 'user-123' });
    });

    it('accepts function overrides for full control', async () => {
      const customFn = async () => ({ statusCode: 500, data: null, durationMs: 5, requestBody: null });
      const truv = createMockTruv({
        getOrder: customFn,
      });

      const result = await truv.getOrder('order-1');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('createMockApiLogger', () => {
    it('returns an object with logApiCall and pushWebhookEvent', () => {
      const logger = createMockApiLogger();
      expect(typeof logger.logApiCall).toBe('function');
      expect(typeof logger.pushWebhookEvent).toBe('function');
    });

    it('records calls for assertion', () => {
      const logger = createMockApiLogger();
      logger.logApiCall({ method: 'POST', endpoint: '/v1/users/' });
      logger.pushWebhookEvent({ event_type: 'task-status-updated' });

      expect(logger.logApiCall).toHaveBeenCalledTimes(1);
      expect(logger.logApiCall).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST' }),
      );
      expect(logger.pushWebhookEvent).toHaveBeenCalledTimes(1);
    });
  });
});
