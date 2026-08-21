import React, { useEffect, useState } from 'react';

import { Button, Card, Select } from '@truv-demo/design-system';

import { api } from '../api.js';

const FLOW_OPTIONS = [
  { value: 'truv_document_upload', label: 'Truv Document Processing (real, live)' },
  { value: 'aim_check_ocr', label: 'AIM Check via OCR' },
];

const OCR_SOURCE_OPTIONS = [
  { value: 'sample_report', label: 'Sample Report (Truv-published)' },
  { value: 'encompass_edc', label: 'Encompass EDC / ASO (not yet implemented)' },
];

/** Controls what "Generate AIM Check Report" does on the Documents tab. Truv
 * distinguishes two real document-based income paths: calling Truv's own
 * Document Processing API directly, or ordering AIM Check through
 * Encompass's Automated Service Ordering instead. The Encompass path isn't
 * wired up yet — selecting it with "Sample Report" attaches a real
 * Truv-published sample PDF as an honest stand-in rather than fabricating a
 * result; "Encompass EDC" reports "not yet implemented" until that
 * integration exists. Same shared truv_integration config POS's console
 * exposes — each project keeps its own row, same pattern as credentials. */
export function AimCheckConfigCard() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  function refresh() {
    api.getAimCheckConfig().then(setConfig);
  }

  useEffect(refresh, []);

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    try {
      const updated = await api.patchAimCheckConfig(config);
      setConfig(updated);
      setSaveMessage('Saved.');
    } catch (e) {
      setSaveMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <Card title="AIM Check Configuration"><p>Loading…</p></Card>;

  return (
    <Card title="AIM Check Configuration" actions={<Button onClick={handleSave} loading={saving}>Save</Button>}>
      <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
        Controls what "Generate AIM Check Report" (on a loan file's Documents tab) actually does.
      </p>
      <Select
        label="Flow"
        value={config.flow}
        onChange={(e) => setConfig((c) => ({ ...c, flow: e.target.value }))}
        options={FLOW_OPTIONS}
      />
      {config.flow === 'truv_document_upload' && (
        <p style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
          Runs the real Truv Document Processing API (create collection → upload → finalize with
          product_type="income") against the most recently uploaded document on that loan file.
        </p>
      )}
      {config.flow === 'aim_check_ocr' && (
        <>
          <Select
            label="OCR Source"
            value={config.ocr_source}
            onChange={(e) => setConfig((c) => ({ ...c, ocr_source: e.target.value }))}
            options={OCR_SOURCE_OPTIONS}
          />
          <p style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
            {config.ocr_source === 'sample_report'
              ? 'Attaches a real Truv-published sample AIM/Freddie report PDF — a stand-in for the Encompass ASO path, never a fabricated document.'
              : 'Encompass EDC integration is not yet built — selecting this returns a clear "not yet implemented" error instead of faking a result.'}
          </p>
        </>
      )}
      {saveMessage && (
        <p style={{ fontSize: 13, color: saveMessage === 'Saved.' ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>{saveMessage}</p>
      )}
    </Card>
  );
}
