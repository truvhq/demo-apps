import React, { useEffect, useState } from 'react';

import { Button, Card, Chip, Select } from '@truv-demo/design-system';

import { api } from '../api.js';

const CATEGORY_TONE = {
  verification_report: 'accent',
  invoice: 'success',
  ocr_paystub: 'neutral',
  ocr_w2: 'neutral',
  other: 'neutral',
};

const UPLOAD_CATEGORY_OPTIONS = [
  { value: 'ocr_paystub', label: 'Paystub' },
  { value: 'ocr_w2', label: 'W-2' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
];

export function DocumentManagerScreen({ applicationId }) {
  const [documents, setDocuments] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('other');

  function refresh() {
    api.listDocuments(applicationId).then(setDocuments);
  }

  useEffect(refresh, [applicationId]);

  async function handleFetchInvoice() {
    setBusy(true);
    try { await api.fetchInvoice(applicationId); refresh(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleGenerateAimCheck() {
    setBusy(true);
    try { await api.generateAimCheckReport(applicationId, {}); refresh(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await api.uploadDocument(applicationId, file, uploadCategory); refresh(); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start' }}>
      <Card title="Documents" actions={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" onClick={handleFetchInvoice} loading={busy}>Fetch Invoice</Button>
        </div>
      }>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Select label="Upload as" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} options={UPLOAD_CATEGORY_OPTIONS} />
          <label style={{ fontSize: 13 }}>
            <input type="file" onChange={handleUpload} style={{ display: 'none' }} id="doc-upload-input" />
            <Button variant="secondary" onClick={() => document.getElementById('doc-upload-input').click()}>Upload File</Button>
          </label>
          <Button variant="secondary" onClick={handleGenerateAimCheck} loading={busy}>Generate AIM Check Report</Button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--truv-grey-50)', marginTop: -8 }}>
          Generates an AIM Check report from the most recently uploaded document — configure which flow this uses
          (real Truv Document Processing vs. sample/Encompass) in Settings → AIM Check Configuration.
        </p>

        {documents === null && <p>Loading…</p>}
        {documents && documents.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>No documents yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents && documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => setSelected(doc)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: `1px solid ${selected?.id === doc.id ? 'var(--truv-accent)' : 'var(--truv-grey-30)'}`,
                borderRadius: 8, padding: 10, cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.file_name || doc.category.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11, color: 'var(--truv-grey-60)' }}>{new Date(doc.created_at).toLocaleString()}</div>
              </div>
              <Chip tone={CATEGORY_TONE[doc.category] || 'neutral'}>{doc.category.replace(/_/g, ' ')}</Chip>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Preview">
        {!selected && <p style={{ color: 'var(--truv-grey-50)' }}>Select a document to preview it.</p>}
        {/* Every PDF preview — locally-stored (VOA/VOIE reports, uploads) or
            Truv-hosted (invoice, per-entry reports) — routes through the same
            same-origin /api/documents/{id}/pdf/ proxy. Local files' file_url
            is an absolute URL built from Django's own host (port 8001), which
            is genuinely cross-origin from the frontend's dev-server port
            (5174, proxied only for /api) and gets blocked in an iframe; Truv's
            S3 PDFs are served Content-Disposition: attachment with no CORS
            headers, which forces a download instead of previewing. The proxy
            re-serves either as inline, same-origin bytes. */}
        {selected && (selected.file_url || selected.data?.pdf_report_url || selected.data?.file) && (
          <>
            <a href={`/api/documents/${selected.id}/pdf/`} target="_blank" rel="noopener noreferrer">
              Open {selected.file_name || 'PDF'} in a new tab →
            </a>
            <iframe
              src={`/api/documents/${selected.id}/pdf/`}
              title={selected.file_name || 'Document PDF'}
              style={{ width: '100%', maxWidth: '100%', height: 600, border: '1px solid var(--truv-grey-30)', borderRadius: 8 }}
            />
          </>
        )}
        {selected && selected.data && (
          <pre style={{ background: 'var(--truv-primary-black)', color: '#c6f6d5', fontSize: 12, borderRadius: 8, padding: 12, overflow: 'auto', maxWidth: '100%', maxHeight: 500, boxSizing: 'border-box' }}>
            {JSON.stringify(selected.data, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}
