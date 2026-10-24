import React, { useEffect, useState } from 'react';

import { Button, Card, Chip } from '@truv-demo/design-system';

import { FieldRow, fillStateFor } from './FieldRow.jsx';

/** Generic borrower-scoped list step (Employment, Assets, Liabilities, REO) —
 * these four sections all follow the same add/edit/remove-record shape.
 * When `onVerifyWithTruv` is provided (Employment, Assets — the two sections
 * Truv actually covers), an empty section leads with an explicit choice
 * between running a verification and typing the data in by hand. Each
 * caller supplies its own `verifyLabel`/`verifyDescription`/`verifyBadge` so
 * the copy is specific to what's being verified (e.g. "Verify Assets with
 * Truv"), rather than one generic "Verify with Truv" for every section.
 *
 * `onVerifyCombined` (Employment step only) adds a "best" option to knock
 * out both Income and Assets in a single Truv session — Truv allows
 * requesting both products together in one order, so this applies to both
 * sections at once. When the borrower reaches Assets afterward, Truv's
 * response already populated Asset records server-side (apply_truv_data
 * calls _apply_assets unconditionally off financial_accounts, independent of
 * which step triggered the order), so `records.length > 0` there and this
 * choice screen never shows — no separate handling needed. */
export function RecordListStep({
  title, emptyLabel, sectionApi, fields, fieldKeyPrefix,
  application, borrower, fillStates, onNext, onBack, showBackButton = true,
  onVerifyWithTruv, onVerifyCombined,
  verifyLabel = 'Verify with Truv', verifyDescription = "Connect the borrower's account and auto-fill this section from direct-source data.",
  verifyBadge,
}) {
  const [records, setRecords] = useState(null);
  // A record being edited has a draft copy here, keyed by id — Cancel just
  // discards the draft and reverts to `records` (the last-saved state) rather
  // than needing a second round-trip to the server.
  const [drafts, setDrafts] = useState({});
  const [editingIds, setEditingIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [manualEntryStarted, setManualEntryStarted] = useState(false);

  useEffect(() => {
    sectionApi.list(application.id, borrower.id).then(setRecords);
  }, [application.id, borrower.id]);

  function startEditing(recordId) {
    const record = records.find((r) => r.id === recordId);
    setDrafts((prev) => ({ ...prev, [recordId]: { ...record } }));
    setEditingIds((prev) => new Set(prev).add(recordId));
  }

  function stopEditing(recordId) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  }

  async function handleAdd() {
    const created = await sectionApi.create(application.id, borrower.id, {});
    setRecords((prev) => [...(prev || []), created]);
    setDrafts((prev) => ({ ...prev, [created.id]: { ...created } }));
    setEditingIds((prev) => new Set(prev).add(created.id));
  }

  function handleFieldChange(recordId, field, value) {
    setDrafts((prev) => ({ ...prev, [recordId]: { ...prev[recordId], [field]: value } }));
  }

  async function handleSaveRecord(recordId) {
    setBusyId(recordId);
    try {
      const updated = await sectionApi.patch(application.id, borrower.id, recordId, drafts[recordId]);
      setRecords((prev) => prev.map((r) => (r.id === recordId ? updated : r)));
      stopEditing(recordId);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(recordId) {
    await sectionApi.remove(application.id, borrower.id, recordId);
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    stopEditing(recordId);
  }

  if (records === null) return <Card title={title}><p>Loading…</p></Card>;

  const showChoice = onVerifyWithTruv && records.length === 0 && !manualEntryStarted;

  if (showChoice) {
    return (
      <Card title={title}>
        <p style={{ color: 'var(--truv-grey-50)', fontSize: 14 }}>
          How would you like to complete this section?
          {onVerifyCombined && ' If you\'re willing, the best option below covers Income and Assets together in the fewest steps.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: onVerifyCombined ? '1fr 1fr 1fr' : '1fr 1fr', gap: 16 }}>
          {onVerifyCombined && (
            <div style={{ border: '2px solid var(--truv-accent)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--truv-accent-disabled)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Verify Income & Assets Together</div>
                <Chip tone="success">Best</Chip>
              </div>
              <p style={{ fontSize: 13, color: 'var(--truv-grey-60)', flex: 1 }}>
                One Truv session covers Income (VOIE) and Assets (VOA) together — knock out both sections in a
                single pass instead of doing this twice.
              </p>
              <Button onClick={onVerifyCombined}>Verify Both</Button>
            </div>
          )}
          <div style={{ border: '1px solid var(--truv-accent)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{verifyLabel}</div>
              {verifyBadge && <Chip tone="accent">{verifyBadge}</Chip>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--truv-grey-60)', flex: 1 }}>
              {verifyDescription}
              {onVerifyCombined && " You'll still need to verify Assets separately afterward."}
            </p>
            <Button onClick={onVerifyWithTruv}>{verifyLabel}</Button>
          </div>
          <div style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Enter Manually</div>
            <p style={{ fontSize: 13, color: 'var(--truv-grey-60)', flex: 1 }}>
              Type the details in yourself — useful when the borrower can't verify right now.
            </p>
            <Button variant="secondary" onClick={() => setManualEntryStarted(true)}>Enter Manually</Button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {showBackButton && <Button variant="secondary" onClick={onBack}>← Back</Button>}
        </div>
      </Card>
    );
  }

  return (
    <Card title={title} actions={
      <div style={{ display: 'flex', gap: 8 }}>
        {onVerifyWithTruv && <Button variant="secondary" onClick={onVerifyWithTruv}>{verifyLabel}</Button>}
        <Button variant="secondary" onClick={handleAdd}>+ Add</Button>
      </div>
    }>
      {records.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>{emptyLabel}</p>}
      {records.map((record) => {
        const isEditing = editingIds.has(record.id);
        const displayed = isEditing ? drafts[record.id] : record;
        return (
          <div key={record.id} style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {fields.map((f) => (
                <FieldRow
                  key={f.name}
                  fieldKey={`${fieldKeyPrefix}.${f.name}`}
                  fillState={fillStateFor(fillStates, `${fieldKeyPrefix}.${f.name}`, borrower.id)}
                  label={f.label}
                  type={f.type}
                  options={f.options}
                  value={displayed[f.name]}
                  onChange={(value) => handleFieldChange(record.id, f.name, value)}
                  readOnly={!isEditing}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {isEditing ? (
                <>
                  <Button variant="secondary" onClick={() => stopEditing(record.id)}>Cancel</Button>
                  <Button onClick={() => handleSaveRecord(record.id)} loading={busyId === record.id}>Save</Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => handleRemove(record.id)}>Remove</Button>
                  <Button variant="secondary" onClick={() => startEditing(record.id)}>Edit</Button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {editingIds.size > 0 ? (
        <p style={{ fontSize: 13, color: 'var(--truv-grey-50)', textAlign: 'right' }}>
          Save or cancel your changes above to continue.
        </p>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {showBackButton && <Button variant="secondary" onClick={onBack}>← Back</Button>}
          <Button variant="secondary" onClick={onNext}>Next →</Button>
        </div>
      )}
    </Card>
  );
}
