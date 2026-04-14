import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';
import userReportsRoutes from '../../../server/routes/user-reports.js';

/**
 * Helper: mount the route on a minimal Express app and make a request.
 * Returns { status, body } from the JSON response.
 */
function buildApp(truv, apiLogger) {
  const app = express();
  app.use(userReportsRoutes({ truv, apiLogger }));
  return app;
}

async function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('GET /api/users/:userId/reports/:reportType', () => {
  let truv;
  let apiLogger;
  const userId = 'user-abc-123';

  beforeEach(() => {
    truv = createMockTruv();
    apiLogger = createMockApiLogger();
  });

  // -------------------------------------------------------------------
  // Happy path: income
  // -------------------------------------------------------------------
  describe('income (two-step: create + retrieve)', () => {
    it('calls createVoieReport(userId, false), then getVoieReport, and returns the report', async () => {
      const createData = { report_id: 'rpt-1', status: 'created' };
      const reportData = { report_id: 'rpt-1', full: 'income-report' };

      truv.createVoieReport.mockResolvedValue({
        statusCode: 201,
        data: createData,
        durationMs: 15,
        requestBody: { is_voe: false },
      });
      truv.getVoieReport.mockResolvedValue({
        statusCode: 200,
        data: reportData,
        durationMs: 20,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/income`);

      expect(status).toBe(200);
      expect(body).toEqual(reportData);

      // Verify correct SDK calls
      expect(truv.createVoieReport).toHaveBeenCalledWith(userId, false);
      expect(truv.getVoieReport).toHaveBeenCalledWith(userId, 'rpt-1');
    });
  });

  // -------------------------------------------------------------------
  // Happy path: employment
  // -------------------------------------------------------------------
  describe('employment (two-step, is_voe = true)', () => {
    it('calls createVoieReport(userId, true) for employment', async () => {
      truv.createVoieReport.mockResolvedValue({
        statusCode: 201,
        data: { report_id: 'rpt-emp-1' },
        durationMs: 10,
        requestBody: { is_voe: true },
      });
      truv.getVoieReport.mockResolvedValue({
        statusCode: 200,
        data: { report_id: 'rpt-emp-1', type: 'employment' },
        durationMs: 10,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/employment`);

      expect(status).toBe(200);
      expect(body).toEqual({ report_id: 'rpt-emp-1', type: 'employment' });
      expect(truv.createVoieReport).toHaveBeenCalledWith(userId, true);
    });
  });

  // -------------------------------------------------------------------
  // Happy path: assets
  // -------------------------------------------------------------------
  describe('assets (two-step)', () => {
    it('calls createAssetsReport then getAssetsReport', async () => {
      truv.createAssetsReport.mockResolvedValue({
        statusCode: 201,
        data: { report_id: 'rpt-asset-1' },
        durationMs: 10,
        requestBody: null,
      });
      truv.getAssetsReport.mockResolvedValue({
        statusCode: 200,
        data: { report_id: 'rpt-asset-1', assets: [] },
        durationMs: 10,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/assets`);

      expect(status).toBe(200);
      expect(body).toEqual({ report_id: 'rpt-asset-1', assets: [] });
      expect(truv.createAssetsReport).toHaveBeenCalledWith(userId);
      expect(truv.getAssetsReport).toHaveBeenCalledWith(userId, 'rpt-asset-1');
    });
  });

  // -------------------------------------------------------------------
  // Happy path: income_insights
  // -------------------------------------------------------------------
  describe('income_insights (two-step)', () => {
    it('calls createIncomeInsightsReport then getIncomeInsightsReport', async () => {
      truv.createIncomeInsightsReport.mockResolvedValue({
        statusCode: 201,
        data: { report_id: 'rpt-ii-1' },
        durationMs: 10,
        requestBody: null,
      });
      truv.getIncomeInsightsReport.mockResolvedValue({
        statusCode: 200,
        data: { report_id: 'rpt-ii-1', insights: {} },
        durationMs: 10,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/income_insights`);

      expect(status).toBe(200);
      expect(body).toEqual({ report_id: 'rpt-ii-1', insights: {} });
      expect(truv.createIncomeInsightsReport).toHaveBeenCalledWith(userId);
      expect(truv.getIncomeInsightsReport).toHaveBeenCalledWith(userId, 'rpt-ii-1');
    });
  });

  // -------------------------------------------------------------------
  // Happy path: deposit_switch (single GET, no create step)
  // -------------------------------------------------------------------
  describe('deposit_switch (single GET)', () => {
    it('calls only getDepositSwitchReport with no create step', async () => {
      truv.getDepositSwitchReport.mockResolvedValue({
        statusCode: 200,
        data: { deposit_switch: 'done' },
        durationMs: 10,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/deposit_switch`);

      expect(status).toBe(200);
      expect(body).toEqual({ deposit_switch: 'done' });
      expect(truv.getDepositSwitchReport).toHaveBeenCalledWith(userId);

      // No create methods should have been called
      expect(truv.createVoieReport).not.toHaveBeenCalled();
      expect(truv.createAssetsReport).not.toHaveBeenCalled();
      expect(truv.createIncomeInsightsReport).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Logging: both POST and GET are logged for two-step reports
  // -------------------------------------------------------------------
  describe('apiLogger integration', () => {
    it('logs POST (create) and GET (retrieve) for a two-step report type', async () => {
      truv.createVoieReport.mockResolvedValue({
        statusCode: 201,
        data: { report_id: 'rpt-log-1' },
        durationMs: 12,
        requestBody: { is_voe: false },
      });
      truv.getVoieReport.mockResolvedValue({
        statusCode: 200,
        data: { report_id: 'rpt-log-1', detail: 'ok' },
        durationMs: 8,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      await request(app, `/api/users/${userId}/reports/income`);

      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(2);

      // First call: POST create
      const postCall = apiLogger.logApiCall.mock.calls[0][0];
      expect(postCall.userId).toBe(userId);
      expect(postCall.method).toBe('POST');
      expect(postCall.endpoint).toBe(`/v1/users/${userId}/reports/`);
      expect(postCall.statusCode).toBe(201);
      expect(postCall.requestBody).toEqual({ is_voe: false });
      expect(postCall.responseBody).toEqual({ report_id: 'rpt-log-1' });

      // Second call: GET retrieve
      const getCall = apiLogger.logApiCall.mock.calls[1][0];
      expect(getCall.userId).toBe(userId);
      expect(getCall.method).toBe('GET');
      expect(getCall.endpoint).toBe(`/v1/users/${userId}/reports/rpt-log-1/`);
      expect(getCall.statusCode).toBe(200);
      expect(getCall.responseBody).toEqual({ report_id: 'rpt-log-1', detail: 'ok' });
    });

    it('logs only GET for deposit_switch (single-step)', async () => {
      truv.getDepositSwitchReport.mockResolvedValue({
        statusCode: 200,
        data: { deposit_switch: 'done' },
        durationMs: 5,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      await request(app, `/api/users/${userId}/reports/deposit_switch`);

      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);

      const call = apiLogger.logApiCall.mock.calls[0][0];
      expect(call.userId).toBe(userId);
      expect(call.method).toBe('GET');
      expect(call.endpoint).toBe(`/v1/users/${userId}/deposit_switch/report/`);
      expect(call.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------
  // Error: unknown report type -> 400
  // -------------------------------------------------------------------
  describe('unknown report type', () => {
    it('returns 400 with descriptive error message', async () => {
      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/banana`);

      expect(status).toBe(400);
      expect(body).toEqual({ error: 'Unknown report type: banana' });

      // No SDK calls should be made
      expect(truv.createVoieReport).not.toHaveBeenCalled();
      expect(truv.getVoieReport).not.toHaveBeenCalled();
      expect(apiLogger.logApiCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Error: POST create returns 400 -> returns error, no GET attempted
  // -------------------------------------------------------------------
  describe('create step fails (status >= 400)', () => {
    it('returns the error status, logs only POST, does not call GET', async () => {
      truv.createVoieReport.mockResolvedValue({
        statusCode: 400,
        data: { message: 'bad request from API' },
        durationMs: 5,
        requestBody: { is_voe: false },
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/income`);

      expect(status).toBe(400);
      expect(body).toEqual({
        error: 'Failed to create report',
        details: { message: 'bad request from API' },
      });

      // POST was logged
      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);
      expect(apiLogger.logApiCall.mock.calls[0][0].method).toBe('POST');

      // GET was never called
      expect(truv.getVoieReport).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Error: POST create returns no report_id -> 500
  // -------------------------------------------------------------------
  describe('create returns no report_id', () => {
    it('returns 500 with descriptive error', async () => {
      truv.createVoieReport.mockResolvedValue({
        statusCode: 201,
        data: { status: 'created' }, // no report_id
        durationMs: 5,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/income`);

      expect(status).toBe(500);
      expect(body).toEqual({ error: 'No report_id in create response' });

      // POST was logged, but GET was never called
      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);
      expect(truv.getVoieReport).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Error: GET retrieve returns 400 -> logs both POST and GET, returns error
  // -------------------------------------------------------------------
  describe('retrieve step fails (status >= 400)', () => {
    it('returns error status after retries, logs POST and all GET attempts', async () => {
      truv.createVoieReport.mockResolvedValue({
        statusCode: 201,
        data: { report_id: 'rpt-fail-get' },
        durationMs: 5,
        requestBody: null,
      });
      truv.getVoieReport.mockResolvedValue({
        statusCode: 404,
        data: { message: 'report not found' },
        durationMs: 5,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/income`);

      expect(status).toBe(404);
      expect(body).toEqual({
        error: 'Failed to retrieve report',
        details: { message: 'report not found' },
      });

      // POST + 3 GET retry attempts were logged
      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(4);
      expect(apiLogger.logApiCall.mock.calls[0][0].method).toBe('POST');
      expect(apiLogger.logApiCall.mock.calls[1][0].method).toBe('GET');
      expect(apiLogger.logApiCall.mock.calls[2][0].method).toBe('GET');
      expect(apiLogger.logApiCall.mock.calls[3][0].method).toBe('GET');
    }, 15000);
  });

  // -------------------------------------------------------------------
  // Error: deposit_switch GET fails -> returns error
  // -------------------------------------------------------------------
  describe('deposit_switch GET fails', () => {
    it('returns error status and logs the GET call', async () => {
      truv.getDepositSwitchReport.mockResolvedValue({
        statusCode: 500,
        data: { message: 'internal error' },
        durationMs: 3,
        requestBody: null,
      });

      const app = buildApp(truv, apiLogger);
      const { status, body } = await request(app, `/api/users/${userId}/reports/deposit_switch`);

      expect(status).toBe(500);
      expect(body).toEqual({
        error: 'Failed to fetch report',
        details: { message: 'internal error' },
      });

      expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);
      expect(apiLogger.logApiCall.mock.calls[0][0].method).toBe('GET');
    });
  });
});
