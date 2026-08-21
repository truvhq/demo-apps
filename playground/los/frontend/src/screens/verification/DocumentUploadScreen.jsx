import React, { useState } from 'react';

import { Button, Card } from '@truv-demo/design-system';

import { api } from '../../api.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** AIM Check: upload paystub/W-2 files, Truv OCRs them into an income report.
 * No Bridge widget involved — a pure server-to-server flow. LOS's copy of
 * POS's component. */
export function DocumentUploadScreen({ verificationRequest, onFinalized }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | uploading | finalizing | done | error
  const [error, setError] = useState('');

  async function handleUploadAndFinalize() {
    setStatus('uploading');
    setError('');
    try {
      const documents = await Promise.all(
        files.map(async (file) => ({ file_name: file.name, content_base64: await fileToBase64(file) })),
      );
      const uploadResult = await api.uploadDocuments(verificationRequest.id, documents);
      if (uploadResult?.error) throw new Error(uploadResult.error.message || 'Upload failed');

      setStatus('finalizing');
      const finalizeResult = await api.finalizeDocuments(verificationRequest.id);
      if (finalizeResult?.error) throw new Error(finalizeResult.error.message || 'Finalize failed');

      setStatus('done');
      onFinalized?.();
    } catch (e) {
      setStatus('error');
      setError(e.message);
    }
  }

  return (
    <Card title="Document Processing (AIM Check)">
      <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
        Upload paystubs or W-2s — Truv OCRs them into an income report without a live payroll connection.
        Collection: <code>{verificationRequest.document_collection_id || 'not created'}</code>
      </p>

      <div>
        <input
          type="file"
          id="aim-check-file-input"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          style={{ display: 'none' }}
        />
        <Button variant="secondary" onClick={() => document.getElementById('aim-check-file-input').click()}>
          Choose Files
        </Button>
      </div>

      {files.length > 0 && (
        <ul style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
          {files.map((f) => <li key={f.name}>{f.name} ({Math.round(f.size / 1024)} KB)</li>)}
        </ul>
      )}

      {error && <p style={{ color: 'var(--truv-text-red)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleUploadAndFinalize} loading={status === 'uploading' || status === 'finalizing'} disabled={files.length === 0}>
          {status === 'uploading' ? 'Uploading…' : status === 'finalizing' ? 'Finalizing…' : 'Upload & Finalize'}
        </Button>
      </div>
    </Card>
  );
}
