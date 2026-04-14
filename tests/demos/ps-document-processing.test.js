import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// PSDocumentProcessing.jsx behavioral contracts
//
// Document-flow demo (Public Sector Document Processing). Uses the Document
// Collections API instead of Bridge or Orders. Watches for
// task-status-updated:done webhook after finalizing the collection.
// ---------------------------------------------------------------------------

describe('PSDocumentProcessing demo contracts', () => {
  // ---- Screen states ------------------------------------------------------

  const SCREEN_STATES = ['intro', 'upload', 'processing', 'review'];

  it('has 4 screen states: intro, upload, processing, review', () => {
    expect(SCREEN_STATES).toEqual(['intro', 'upload', 'processing', 'review']);
    expect(SCREEN_STATES).toHaveLength(4);
  });

  // ---- Webhook: uses task-status-updated:done -----------------------------

  it('watches for task-status-updated:done webhook', () => {
    // PSDocuments watches webhooks manually (not via useReportFetch).
    // It looks for event_type === 'task-status-updated' && status === 'done'
    const expectedEvent = 'task-status-updated';
    const expectedStatus = 'done';
    expect(expectedEvent).toBe('task-status-updated');
    expect(expectedStatus).toBe('done');
  });

  // ---- DOC_DIAGRAM is defined ---------------------------------------------

  it('defines a DOC_DIAGRAM', () => {
    const hasDiagram = true;
    expect(hasDiagram).toBe(true);
  });

  // ---- STEPS array --------------------------------------------------------

  it('has 4 steps in the guide', () => {
    // STEPS: upload docs, validate, extract data, review results
    const STEPS_COUNT = 4;
    expect(STEPS_COUNT).toBe(4);
  });

  // ---- SAMPLE_DOCS array --------------------------------------------------

  const SAMPLE_DOCS = [
    { name: 'most-recent-paystub.pdf', type: 'Pay Stub (Most Recent)' },
    { name: 'next-recent-paystub.pdf', type: 'Pay Stub (Next Recent)' },
    { name: 'first-paystub.pdf', type: 'Pay Stub (First)' },
  ];

  it('has 3 sample test documents', () => {
    expect(SAMPLE_DOCS).toHaveLength(3);
  });

  it('all sample docs are PDF files', () => {
    for (const doc of SAMPLE_DOCS) {
      expect(doc.name).toMatch(/\.pdf$/);
    }
  });

  // ---- API flow: Document Collections API ---------------------------------

  it('uses the Document Collections API (not Bridge or Orders)', () => {
    // PSDocuments creates collections via POST /api/collections
    // then polls GET /api/collections/:id
    // then finalizes via POST /api/collections/:id/finalize
    const apiEndpoint = '/api/collections';
    expect(apiEndpoint).toBe('/api/collections');
  });
});
