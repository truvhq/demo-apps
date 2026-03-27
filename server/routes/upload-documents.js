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
      res.json({ collection_id: collectionId, truv_collection_id: truvData.collection_id || truvData.id, status: truvData.status });
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
      const result = await truv.finalizeCollection(collection.truv_collection_id);
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: result.data });
      db.updateDocCollection(collection.id, { status: 'finalizing' });
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

  return router;
}
