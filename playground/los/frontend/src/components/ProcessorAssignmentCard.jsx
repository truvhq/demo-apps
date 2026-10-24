import React, { useState } from 'react';

import { Button, Card, Input } from '@truv-demo/design-system';

import { api } from '../api.js';

/** Assigns the loan processor — Truv's real Orders API field
 * (loan.loan_processor_name/loan_processor_email, confirmed via
 * docs.truv.com/api-reference/orders/object#loan-object). Saving both
 * persists it locally and, if a Truv order already exists for this loan,
 * pushes the update onto it via PATCH /v1/orders/{id}/ — the backend reports
 * whether that push actually succeeded, since Truv only allows it while the
 * order's employers are pending/sent. */
export function ProcessorAssignmentCard({ applicationId, loanProperty, onSaved }) {
  const hasData = !!(loanProperty.loan_processor_name && loanProperty.loan_processor_email);
  const [form, setForm] = useState({ loan_processor_name: loanProperty.loan_processor_name, loan_processor_email: loanProperty.loan_processor_email });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!hasData);
  const [pushResult, setPushResult] = useState(null);

  async function handleSave() {
    setSaving(true);
    setPushResult(null);
    try {
      const { truv_push, ...updated } = await api.patchLoanProperty(applicationId, form);
      onSaved(updated);
      setEditing(false);
      if (truv_push) setPushResult(truv_push);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit() {
    setForm({ loan_processor_name: loanProperty.loan_processor_name, loan_processor_email: loanProperty.loan_processor_email });
    setEditing(true);
  }

  function handleCancel() {
    setForm({ loan_processor_name: loanProperty.loan_processor_name, loan_processor_email: loanProperty.loan_processor_email });
    setEditing(false);
  }

  return (
    <Card title="Processor" actions={
      editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={handleEdit}>{hasData ? 'Edit' : 'Assign'}</Button>
      )
    }>
      <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
        Maps onto Truv's <code>loan.loan_processor_name</code> / <code>loan.loan_processor_email</code> — sent on
        every new order for this loan, and pushed onto the current order immediately if one already exists.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {editing ? (
          <>
            <Input label="Processor Name" value={form.loan_processor_name || ''} onChange={(e) => setForm((f) => ({ ...f, loan_processor_name: e.target.value }))} />
            <Input label="Processor Email" type="email" value={form.loan_processor_email || ''} onChange={(e) => setForm((f) => ({ ...f, loan_processor_email: e.target.value }))} />
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Processor Name</div>
              <div style={{ fontSize: 14 }}>{loanProperty.loan_processor_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Processor Email</div>
              <div style={{ fontSize: 14 }}>{loanProperty.loan_processor_email || '—'}</div>
            </div>
          </>
        )}
      </div>
      {pushResult && (
        <p style={{ fontSize: 13, color: pushResult.ok ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>
          {pushResult.ok
            ? 'Pushed to the current Truv order.'
            : `Truv did not accept the update (status ${pushResult.status_code}) — this order may have already completed.`}
        </p>
      )}
    </Card>
  );
}
