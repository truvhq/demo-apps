// Routes: Upload Documents demo
//
// POST /api/collections              — Create a document collection
// GET  /api/collections/:id          — Get collection status
// POST /api/collections/:id/upload   — Upload documents to collection
// POST /api/collections/:id/finalize — Finalize collection for processing
// GET  /api/collections/:id/results  — Get finalization results

import { Router } from 'express';

export default function uploadDocumentsRoutes({ truv, db }) {
  const router = Router();

  router.post('/api/collections', async (req, res) => {
    try {
      const { documents, users } = req.body;
      if (!documents?.length) return res.status(400).json({ error: 'documents array is required' });

      const collectionId = db.generateId();
      const result = await truv.createDocumentCollection(documents, users);
      const truvData = result.data;
      if (result.statusCode >= 400) return res.status(result.statusCode).json({ error: 'Truv API error', details: truvData });

      db.createDocCollection({ collectionId, truvCollectionId: truvData.id, demoId: 'upload-documents', status: truvData.status || 'created', rawResponse: truvData });
      res.json({ collection_id: collectionId, truv_collection_id: truvData.id, status: truvData.status });
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
      const raw = updated.raw_response ? JSON.parse(updated.raw_response) : {};
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
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.post('/api/collections/:id/finalize', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      const result = await truv.finalizeCollection(collection.truv_collection_id);
      db.updateDocCollection(collection.id, { status: 'finalizing' });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/api/collections/:id/results', async (req, res) => {
    try {
      const collection = db.getDocCollection(req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      const result = await truv.getFinalizationResults(collection.truv_collection_id);
      if (result.data.status) db.updateDocCollection(collection.id, { status: result.data.status, raw_response: result.data });
      res.json(result.data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

  return router;
}
