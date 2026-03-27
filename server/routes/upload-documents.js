// Routes: Upload Documents demo
//
// POST /api/collections              — Create a document collection
// GET  /api/collections/:id          — Get collection status
// POST /api/collections/:id/upload   — Upload documents to collection
// POST /api/collections/:id/finalize — Finalize collection for processing
// GET  /api/collections/:id/results  — Get finalization results

import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function safeParse(str) { try { return JSON.parse(str); } catch { return {}; } }

// Test documents stored locally (downloaded from Truv S3)
const TEST_DOCS_DIR = path.resolve(__dirname, '..', 'test-docs');
const TEST_DOC_FILES = [
  { filename: 'most-recent-paystub.pdf', file: 'most.recent.paystub.pdf' },
  { filename: 'next-recent-paystub.pdf', file: 'next.recent.paystub.pdf' },
  { filename: 'first-paystub.pdf', file: 'first.paystub.pdf' },
];

function loadTestDocs() {
  return TEST_DOC_FILES.map(({ filename, file }) => ({
    filename,
    mime_type: 'application/pdf',
    content: readFileSync(path.join(TEST_DOCS_DIR, file)).toString('base64'),
  }));
}

export default function uploadDocumentsRoutes({ truv, db, apiLogger }) {
  const router = Router();

  router.post('/api/collections', async (req, res) => {
    try {
      const { user_id, use_test_docs } = req.body;
      let { documents } = req.body;

      // If use_test_docs flag, load from local files
      if (use_test_docs) {
        documents = loadTestDocs();
      }
      if (!documents?.length) return res.status(400).json({ error: 'documents array is required' });

      // If user_id provided, attach to existing user; otherwise create a new one
      let users;
      if (user_id) {
        users = [{ id: user_id }];
      } else {
        const userResult = await truv.createUser();
        if (userResult.statusCode >= 400 || !userResult.data?.id) return res.status(userResult.statusCode || 500).json({ error: 'Failed to create user', details: userResult.data });
        users = [{ id: userResult.data.id }];
      }

      // Add user_id to each document as per Truv API spec
      const userId = users[0].id;
      const docsWithUser = documents.map(d => ({ ...d, user_id: userId }));

      const collectionId = db.generateId();
      const result = await truv.createDocumentCollection(docsWithUser);
      const truvData = result.data;
      if (result.statusCode >= 400) {
        console.error('Document collection creation failed:', JSON.stringify({ request: result.requestBody, response: truvData }));
        return res.status(result.statusCode).json({ error: 'Truv API error', details: truvData });
      }

      db.createDocCollection({ collectionId, truvCollectionId: truvData.collection_id || truvData.id, demoId: 'upload-documents', status: truvData.status || 'created', rawResponse: truvData });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/documents/collections/', requestBody: { documents: docsWithUser.map(d => ({ filename: d.filename, mime_type: d.mime_type, user_id: d.user_id })) }, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });
      res.json({ collection_id: collectionId, truv_collection_id: truvData.collection_id || truvData.id, user_id: userId, status: truvData.status });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/api/collections/:id', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      if (collection.truv_collection_id) {
        const result = await truv.getDocumentCollection(collection.truv_collection_id);
        if (result.statusCode < 400) db.updateDocCollection(collection.id, { status: result.data.status || collection.status, raw_response: result.data });
      }
      const updated = db.getDocCollection(req.params.id);
      const raw = updated.raw_response ? safeParse(updated.raw_response) : {};
      res.json({ collection_id: updated.id, truv_collection_id: updated.truv_collection_id, status: updated.status, raw_response: raw });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.post('/api/collections/:id/upload', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      const { documents } = req.body;
      if (!documents?.length) return res.status(400).json({ error: 'documents array is required' });
      const result = await truv.uploadToCollection(collection.truv_collection_id, documents);
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.post('/api/collections/:id/finalize', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      const raw = collection.raw_response ? safeParse(collection.raw_response) : {};
      const uid = raw.uploaded_files?.[0]?.user_id || null;
      const result = await truv.finalizeCollection(collection.truv_collection_id);
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: result.data });
      db.updateDocCollection(collection.id, { status: 'finalizing' });
      apiLogger.logApiCall({ userId: uid, method: 'POST', endpoint: `/v1/documents/collections/${collection.truv_collection_id}/finalize/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/api/collections/:id/results', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      const result = await truv.getFinalizationResults(collection.truv_collection_id);
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: result.data });
      if (result.data.status) db.updateDocCollection(collection.id, { status: result.data.status, raw_response: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // Fetch income report via link_id (after finalize + webhook done)
  router.get('/api/collections/:id/report', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      const linkId = req.query.link_id;
      if (!linkId) return res.status(400).json({ error: 'link_id required' });

      const raw = collection.raw_response ? safeParse(collection.raw_response) : {};
      const uid = raw.uploaded_files?.[0]?.user_id || null;

      const result = await truv.getLinkIncomeReport(linkId);
      apiLogger.logApiCall({ userId: uid, method: 'GET', endpoint: `/v1/links/${linkId}/income/report/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });

      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Report error', details: result.data });
      res.json({ voie_report: result.data, product_type: 'income', status: 'completed' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
