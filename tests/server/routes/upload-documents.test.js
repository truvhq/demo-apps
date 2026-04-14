import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import http from 'http';
import {
  _setTestDb,
  initDb,
  generateId,
  createDocCollection,
  getDocCollection,
} from '../../../server/db.js';
import uploadDocumentsRoutes from '../../../server/routes/upload-documents.js';
import { createMockTruv } from '../../helpers/mock-truv.js';
import { createMockApiLogger } from '../../helpers/mock-api-logger.js';

// ---------------------------------------------------------------------------
// Helpers: lightweight HTTP client (no supertest dependency)
// ---------------------------------------------------------------------------
let server;
let baseUrl;
let truv;
let apiLogger;
let memDb;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');
  _setTestDb(memDb);
  initDb();
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  memDb.close();
});

beforeEach(() => {
  // Clean document_collections between tests
  memDb.prepare('DELETE FROM document_collections').run();
});

async function startServer(truvOverrides = {}) {
  truv = createMockTruv(truvOverrides);
  apiLogger = createMockApiLogger();

  // Import the real db functions to pass as the db dependency
  const db = await import('../../../server/db.js');

  const app = express();
  app.use(express.json());
  const router = uploadDocumentsRoutes({ truv, db, apiLogger });
  app.use(router);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
}

// ---------------------------------------------------------------------------
// POST /api/collections - Create a document collection
// ---------------------------------------------------------------------------
describe('POST /api/collections', () => {
  beforeAll(async () => {
    await startServer({
      createUser: {
        statusCode: 201,
        data: { id: 'test-uid' },
        durationMs: 5,
        requestBody: {},
      },
      createDocumentCollection: {
        statusCode: 201,
        data: { id: 'test-col-id', status: 'created', files: [] },
        durationMs: 8,
        requestBody: {},
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
    truv.createUser.mockClear();
    truv.createDocumentCollection.mockClear();
    apiLogger.logApiCall.mockClear();
  });

  it('creates user, uploads docs, and returns collection_id and user_id', async () => {
    const res = await request('POST', '/api/collections', {
      use_test_docs: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('collection_id');
    expect(res.body).toHaveProperty('user_id', 'test-uid');
    expect(res.body).toHaveProperty('truv_collection_id', 'test-col-id');
    expect(res.body).toHaveProperty('status', 'created');

    // Verify createUser was called
    expect(truv.createUser).toHaveBeenCalledTimes(1);
    expect(truv.createUser).toHaveBeenCalledWith({});

    // Verify createDocumentCollection was called with docs that have user_id
    expect(truv.createDocumentCollection).toHaveBeenCalledTimes(1);
    const docsArg = truv.createDocumentCollection.mock.calls[0][0];
    expect(docsArg).toHaveLength(3);
    for (const doc of docsArg) {
      expect(doc.user_id).toBe('test-uid');
      expect(doc.mime_type).toBe('application/pdf');
      expect(doc.content).toBeTruthy(); // base64 content
    }

    // Verify apiLogger was called for both the user and collection creation
    expect(apiLogger.logApiCall).toHaveBeenCalledTimes(2);

    // Verify DB row was created
    const dbRow = getDocCollection(res.body.collection_id);
    expect(dbRow).not.toBeNull();
    expect(dbRow.truv_collection_id).toBe('test-col-id');
    expect(dbRow.status).toBe('created');
  });

  it('passes external_user_id to createUser when provided', async () => {
    const res = await request('POST', '/api/collections', {
      use_test_docs: true,
      external_user_id: 'ext-123',
    });

    expect(res.status).toBe(200);
    expect(truv.createUser).toHaveBeenCalledWith({ external_user_id: 'ext-123' });
  });

  it('returns 400 when no documents are provided', async () => {
    const res = await request('POST', '/api/collections', {});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'documents array is required');
  });

  it('appends extra_documents to test docs', async () => {
    const extra = [{ filename: 'extra.pdf', mime_type: 'application/pdf', content: 'AAAA' }];
    const res = await request('POST', '/api/collections', {
      use_test_docs: true,
      extra_documents: extra,
    });

    expect(res.status).toBe(200);
    const docsArg = truv.createDocumentCollection.mock.calls[0][0];
    expect(docsArg).toHaveLength(4); // 3 test docs + 1 extra
    expect(docsArg[3].filename).toBe('extra.pdf');
  });
});

// ---------------------------------------------------------------------------
// POST /api/collections - Error when createUser fails
// ---------------------------------------------------------------------------
describe('POST /api/collections - createUser failure', () => {
  beforeAll(async () => {
    await startServer({
      createUser: {
        statusCode: 500,
        data: { message: 'Internal error' },
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  it('returns error status when Truv createUser fails', async () => {
    const res = await request('POST', '/api/collections', {
      use_test_docs: true,
    });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Failed to create user');
  });
});

// ---------------------------------------------------------------------------
// GET /api/collections/:id - Get collection status
// ---------------------------------------------------------------------------
describe('GET /api/collections/:id', () => {
  beforeAll(async () => {
    await startServer({
      getDocumentCollection: {
        statusCode: 200,
        data: {
          status: 'processing',
          collection_id: 'truv-col-456',
          uploaded_files: [{ user_id: 'u1' }],
        },
        durationMs: 3,
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
    truv.getDocumentCollection.mockClear();
    apiLogger.logApiCall.mockClear();
  });

  it('returns collection status from Truv', async () => {
    // Seed a collection in the DB
    createDocCollection({
      collectionId: 'col-abc',
      truvCollectionId: 'truv-col-456',
      demoId: 'upload-documents',
      status: 'created',
      rawResponse: { uploaded_files: [{ user_id: 'u1' }] },
    });

    const res = await request('GET', '/api/collections/col-abc');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('collection_id', 'col-abc');
    expect(res.body).toHaveProperty('truv_collection_id', 'truv-col-456');
    expect(res.body).toHaveProperty('status', 'processing');

    // Verify Truv API was called with the truv_collection_id
    expect(truv.getDocumentCollection).toHaveBeenCalledWith('truv-col-456');

    // Verify apiLogger was called
    expect(apiLogger.logApiCall).toHaveBeenCalledTimes(1);
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/v1/documents/collections/truv-col-456/',
      }),
    );
  });

  it('returns 404 for non-existent collection', async () => {
    const res = await request('GET', '/api/collections/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Collection not found');
  });

  it('updates the DB status after fetching from Truv', async () => {
    createDocCollection({
      collectionId: 'col-upd',
      truvCollectionId: 'truv-col-789',
      demoId: 'upload-documents',
      status: 'created',
    });

    await request('GET', '/api/collections/col-upd');

    const updated = getDocCollection('col-upd');
    expect(updated.status).toBe('processing');
  });
});

// ---------------------------------------------------------------------------
// POST /api/collections/:id/finalize
// ---------------------------------------------------------------------------
describe('POST /api/collections/:id/finalize', () => {
  beforeAll(async () => {
    await startServer({
      finalizeCollection: {
        statusCode: 200,
        data: { status: 'finalizing', message: 'Collection finalization started' },
        durationMs: 12,
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
    truv.finalizeCollection.mockClear();
    apiLogger.logApiCall.mockClear();
  });

  it('calls Truv finalize and returns the result', async () => {
    createDocCollection({
      collectionId: 'col-fin',
      truvCollectionId: 'truv-col-fin',
      demoId: 'upload-documents',
      status: 'created',
      rawResponse: { uploaded_files: [{ user_id: 'u-fin' }] },
    });

    const res = await request('POST', '/api/collections/col-fin/finalize');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'finalizing');

    // Verify Truv API was called
    expect(truv.finalizeCollection).toHaveBeenCalledWith('truv-col-fin');

    // Verify DB status was updated
    const dbRow = getDocCollection('col-fin');
    expect(dbRow.status).toBe('finalizing');

    // Verify apiLogger was called
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        endpoint: '/v1/documents/collections/truv-col-fin/finalize/',
      }),
    );
  });

  it('returns 404 for non-existent collection', async () => {
    const res = await request('POST', '/api/collections/ghost/finalize');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Collection not found');
  });
});

// ---------------------------------------------------------------------------
// GET /api/collections/:id/report?link_id=X
// ---------------------------------------------------------------------------
describe('GET /api/collections/:id/report', () => {
  const mockIncomeReport = {
    id: 'report-1',
    income: { amount: 75000 },
    employer: { name: 'Acme Corp' },
  };

  beforeAll(async () => {
    await startServer({
      getLinkIncomeReport: {
        statusCode: 200,
        data: mockIncomeReport,
        durationMs: 15,
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
    truv.getLinkIncomeReport.mockClear();
    apiLogger.logApiCall.mockClear();
  });

  it('fetches income report via getLinkIncomeReport and wraps in voie_report format', async () => {
    createDocCollection({
      collectionId: 'col-rpt',
      truvCollectionId: 'truv-col-rpt',
      demoId: 'upload-documents',
      status: 'completed',
      rawResponse: { uploaded_files: [{ user_id: 'u-rpt' }] },
    });

    const res = await request('GET', '/api/collections/col-rpt/report?link_id=link-abc');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('voie_report');
    expect(res.body.voie_report).toEqual({ links: [mockIncomeReport] });
    expect(res.body).toHaveProperty('product_type', 'income');
    expect(res.body).toHaveProperty('status', 'completed');

    // Verify Truv API call
    expect(truv.getLinkIncomeReport).toHaveBeenCalledWith('link-abc');

    // Verify apiLogger was called
    expect(apiLogger.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/v1/links/link-abc/income/report/',
      }),
    );
  });

  it('returns 400 when link_id query param is missing', async () => {
    createDocCollection({
      collectionId: 'col-nolnk',
      truvCollectionId: 'truv-col-nolnk',
      demoId: 'upload-documents',
      status: 'completed',
    });

    const res = await request('GET', '/api/collections/col-nolnk/report');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'link_id required');
  });

  it('returns 404 for non-existent collection', async () => {
    const res = await request('GET', '/api/collections/no-such/report?link_id=x');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Collection not found');
  });
});

// ---------------------------------------------------------------------------
// GET /api/collections/:id/results
// ---------------------------------------------------------------------------
describe('GET /api/collections/:id/results', () => {
  beforeAll(async () => {
    await startServer({
      getFinalizationResults: {
        statusCode: 200,
        data: { status: 'completed', links: [{ id: 'link-1' }] },
        durationMs: 7,
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
  });

  it('returns finalization results from Truv', async () => {
    createDocCollection({
      collectionId: 'col-res',
      truvCollectionId: 'truv-col-res',
      demoId: 'upload-documents',
      status: 'finalizing',
    });

    const res = await request('GET', '/api/collections/col-res/results');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'completed');
    expect(res.body.links).toHaveLength(1);

    // Verify DB was updated with new status
    const dbRow = getDocCollection('col-res');
    expect(dbRow.status).toBe('completed');
  });

  it('returns 404 for non-existent collection', async () => {
    const res = await request('GET', '/api/collections/nope/results');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Collection not found');
  });
});

// ---------------------------------------------------------------------------
// POST /api/collections/:id/upload
// ---------------------------------------------------------------------------
describe('POST /api/collections/:id/upload', () => {
  beforeAll(async () => {
    await startServer({
      uploadToCollection: {
        statusCode: 200,
        data: { uploaded: true, count: 1 },
        durationMs: 6,
      },
    });
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(() => {
    memDb.prepare('DELETE FROM document_collections').run();
  });

  it('uploads documents to an existing collection', async () => {
    createDocCollection({
      collectionId: 'col-upl',
      truvCollectionId: 'truv-col-upl',
      demoId: 'upload-documents',
      status: 'created',
    });

    const docs = [{ filename: 'w2.pdf', mime_type: 'application/pdf', content: 'QUFB' }];
    const res = await request('POST', '/api/collections/col-upl/upload', { documents: docs });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uploaded', true);
    expect(truv.uploadToCollection).toHaveBeenCalledWith('truv-col-upl', docs);
  });

  it('returns 400 when documents array is empty', async () => {
    createDocCollection({
      collectionId: 'col-upl2',
      truvCollectionId: 'truv-col-upl2',
      demoId: 'upload-documents',
      status: 'created',
    });

    const res = await request('POST', '/api/collections/col-upl2/upload', { documents: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'documents array is required');
  });

  it('returns 404 for non-existent collection', async () => {
    const res = await request('POST', '/api/collections/missing/upload', {
      documents: [{ filename: 'x.pdf' }],
    });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Collection not found');
  });
});
