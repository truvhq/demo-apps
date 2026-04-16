/**
 * FILE SUMMARY: Document collection lifecycle routes for the Upload Documents demo
 * DATA FLOW: Frontend -> /api/collections/* -> TruvClient -> Truv API (/v1/documents/collections/) -> SQLite state tracking
 * INTEGRATION PATTERN: Standalone document upload flow (not Orders or Bridge)
 *
 * Manages the full document collection lifecycle: create a collection with uploaded PDFs,
 * optionally add more documents, finalize for processing, poll for results, and fetch
 * the income report once processing completes. Uses local test documents for demo purposes.
 */

// Express router factory and Node.js file/path utilities
import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules (needed to locate test-docs directory)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Utility: safely parse JSON strings from the DB without throwing
function safeParse(str) { try { return JSON.parse(str); } catch { return {}; } }

// Test document configuration: local PDF files that simulate real paystub uploads.
// These are pre-downloaded from Truv's S3 bucket and stored in server/test-docs/.
const TEST_DOCS_DIR = path.resolve(__dirname, '..', 'test-docs');
const TEST_DOC_FILES = [
  { filename: 'most-recent-paystub.pdf', file: 'most.recent.paystub.pdf' },
  { filename: 'next-recent-paystub.pdf', file: 'next.recent.paystub.pdf' },
  { filename: 'first-paystub.pdf', file: 'first.paystub.pdf' },
];

// Load test documents from disk and base64-encode them for the Truv API
function loadTestDocs() {
  return TEST_DOC_FILES.map(({ filename, file }) => ({
    filename,
    mime_type: 'application/pdf',
    content: readFileSync(path.join(TEST_DOCS_DIR, file)).toString('base64'),
  }));
}

// Factory function: receives shared dependencies (TruvClient, DB, logger) and returns a configured router
export default function uploadDocumentsRoutes({ truv, db, apiLogger }) {
  const router = Router();

  // POST /api/collections: Create a new document collection at Truv.
  // Flow: optionally load test docs -> create a Truv user -> attach user_id to each document ->
  //       POST /v1/documents/collections/ -> store in SQLite -> return collection metadata.
  router.post('/api/collections', async (req, res) => {
    try {
      const { external_user_id, use_test_docs, extra_documents, demo_id } = req.body;
      let { documents } = req.body;

      // Load test docs if flagged, then append any extra user-uploaded documents
      if (use_test_docs) {
        documents = loadTestDocs();
      }
      if (extra_documents?.length) {
        documents = [...(documents || []), ...extra_documents];
      }
      if (!documents?.length) return res.status(400).json({ error: 'documents array is required' });

      // Create a Truv user (with optional external_user_id for tracking)
      let users;
      {
        const userResult = await truv.createUser(external_user_id ? { external_user_id } : {});
        if (userResult.statusCode >= 400 || !userResult.data?.id) return res.status(userResult.statusCode || 500).json({ error: 'Failed to create user', details: userResult.data });
        apiLogger.logApiCall({ userId: userResult.data.id, method: 'POST', endpoint: '/v1/users/', requestBody: userResult.requestBody, responseBody: userResult.data, statusCode: userResult.statusCode, durationMs: userResult.durationMs });
        users = [{ id: userResult.data.id }];
      }

      // Attach user_id to each document as required by the Truv documents API
      const userId = users[0].id;
      const docsWithUser = documents.map(d => ({ ...d, user_id: userId }));

      // Create the document collection at Truv and persist in SQLite
      const collectionId = db.generateId();
      const result = await truv.createDocumentCollection(docsWithUser);
      const truvData = result.data;
      if (result.statusCode >= 400) {
        console.error('Document collection creation failed:', JSON.stringify({ request: result.requestBody, response: truvData }));
        return res.status(result.statusCode).json({ error: 'Truv API error', details: truvData });
      }

      db.createDocCollection({ collectionId, truvCollectionId: truvData.collection_id || truvData.id, userId, demoId: demo_id || 'upload-documents', status: truvData.status || 'created', rawResponse: truvData });
      apiLogger.logApiCall({ userId, method: 'POST', endpoint: '/v1/documents/collections/', requestBody: { documents: docsWithUser.map(d => ({ filename: d.filename, mime_type: d.mime_type, user_id: d.user_id })) }, responseBody: truvData, statusCode: result.statusCode, durationMs: result.durationMs });
      res.json({ collection_id: collectionId, truv_collection_id: truvData.collection_id || truvData.id, user_id: userId, status: truvData.status });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // GET /api/collections/:id: Fetch collection status, refreshing from Truv API.
  // Flow: read from DB -> GET /v1/documents/collections/:truv_id/ -> update DB status -> return to frontend.
  router.get('/api/collections/:id', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      if (collection.truv_collection_id) {
        const result = await truv.getDocumentCollection(collection.truv_collection_id);
        const raw = collection.raw_response ? safeParse(collection.raw_response) : {};
        const uid = raw.uploaded_files?.[0]?.user_id || null;
        apiLogger.logApiCall({ userId: uid, method: 'GET', endpoint: `/v1/documents/collections/${collection.truv_collection_id}/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });
        if (result.statusCode < 400) db.updateDocCollection(collection.id, { status: result.data.status || collection.status, raw_response: result.data });
      }
      const updated = db.getDocCollection(req.params.id);
      const raw = updated.raw_response ? safeParse(updated.raw_response) : {};
      res.json({ collection_id: updated.id, truv_collection_id: updated.truv_collection_id, status: updated.status, raw_response: raw });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // POST /api/collections/:id/upload: Upload additional documents to an existing collection.
  // Proxies the documents array to Truv's upload endpoint for the collection.
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

  // POST /api/collections/:id/finalize: Signal to Truv that all documents have been uploaded.
  // After finalization, Truv begins processing the documents asynchronously.
  // The frontend should poll GET /api/collections/:id/results to check progress.
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

  // GET /api/collections/:id/results: Poll for finalization results after document processing.
  // Updates the collection status in the DB as processing progresses.
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

  // GET /api/collections/:id/report: Fetch the income report after finalization completes.
  // Requires a link_id query param (provided by webhook or finalization results).
  // Wraps the single link report in a { links: [...] } structure for OrderResults component compatibility.
  router.get('/api/collections/:id/report', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      const linkId = req.query.link_id;
      if (!linkId) return res.status(400).json({ error: 'link_id required' });

      const raw = collection.raw_response ? safeParse(collection.raw_response) : {};
      const uid = raw.uploaded_files?.[0]?.user_id || null;

      // Fetch the income report for the specific link produced by document processing
      const result = await truv.getLinkIncomeReport(linkId);
      apiLogger.logApiCall({ userId: uid, method: 'GET', endpoint: `/v1/links/${linkId}/income/report/`, responseBody: result.data, statusCode: result.statusCode, durationMs: result.durationMs });

      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Report error', details: result.data });
      // Wrap single link report in links array for OrderResults component compatibility
      const voieReport = { links: [result.data] };
      res.json({ voie_report: voieReport, product_type: 'income', status: 'completed' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // Export the configured router
  return router;
}
