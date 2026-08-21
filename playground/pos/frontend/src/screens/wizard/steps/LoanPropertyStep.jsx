import React, { useState } from 'react';

import { Button, Card, Input } from '@truv-demo/design-system';

import { api } from '../../../api.js';
import { hasLoanPropertyData } from '../completion.js';
import { FieldRow, fillStateFor } from '../FieldRow.jsx';

const PURPOSE_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'refinance', label: 'Refinance' },
];

const OCCUPANCY_OPTIONS = [
  { value: 'primary', label: 'Primary Residence' },
  { value: 'second_home', label: 'Second Home' },
  { value: 'investment', label: 'Investment' },
];

export function LoanPropertyStep({ application, loanProperty, fillStates, onSaved, onNext, onBack }) {
  const [form, setForm] = useState(loanProperty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!hasLoanPropertyData(loanProperty));

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSave() {
    setSaving(true);
    try {
      const { truv_push, ...updated } = await api.patchLoanProperty(application.id, form);
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit() {
    setForm(loanProperty);
    setEditing(true);
  }

  function handleCancel() {
    setForm(loanProperty);
    setEditing(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Loan & Property" actions={
        editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={handleEdit}>Edit</Button>
        )
      }>
        <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
          Truv has no product that supplies loan terms or property data — this section is always entered manually.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow fieldKey="loan_property.loan_amount" fillState={fillStateFor(fillStates, 'loan_property.loan_amount', null)}
            label="Loan Amount" value={form.loan_amount} onChange={set('loan_amount')} required readOnly={!editing} />
          <FieldRow fieldKey="loan_property.loan_purpose" fillState={fillStateFor(fillStates, 'loan_property.loan_purpose', null)}
            label="Loan Purpose" value={form.loan_purpose} onChange={set('loan_purpose')} options={PURPOSE_OPTIONS} required readOnly={!editing} />
          <FieldRow fieldKey="loan_property.property_address" fillState={fillStateFor(fillStates, 'loan_property.property_address', null)}
            label="Property Address" value={form.property_address} onChange={set('property_address')} required readOnly={!editing} />
          <FieldRow fieldKey="loan_property.property_type" fillState={fillStateFor(fillStates, 'loan_property.property_type', null)}
            label="Property Type" value={form.property_type} onChange={set('property_type')} readOnly={!editing} />
          <FieldRow fieldKey="loan_property.occupancy_type" fillState={fillStateFor(fillStates, 'loan_property.occupancy_type', null)}
            label="Occupancy Type" value={form.occupancy_type} onChange={set('occupancy_type')} options={OCCUPANCY_OPTIONS} required readOnly={!editing} />
          <FieldRow fieldKey="loan_property.estimated_property_value" fillState={fillStateFor(fillStates, 'loan_property.estimated_property_value', null)}
            label="Estimated Property Value" value={form.estimated_property_value} onChange={set('estimated_property_value')} required readOnly={!editing} />
        </div>
        {editing && (
          <p style={{ fontSize: 13, color: 'var(--truv-grey-50)', textAlign: 'right' }}>
            Save or cancel your changes above to continue.
          </p>
        )}
      </Card>

      <LoanOfficerCard application={application} loanProperty={loanProperty} onSaved={onSaved} />

      {!editing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onBack}>← Back</Button>
          <Button variant="secondary" onClick={onNext}>Next →</Button>
        </div>
      )}
    </div>
  );
}

/** Assigns the loan officer — Truv's real Orders API calls this "originator"
 * (loan.originator_name/originator_email, confirmed via docs.truv.com/
 * api-reference/orders/object#loan-object). Saving here both persists it
 * locally and, if a Truv order already exists for this application, pushes
 * the update onto that order via PATCH /v1/orders/{id}/ — the backend
 * reports whether that push actually succeeded, since Truv only allows it
 * while the order's employers are pending/sent. */
function LoanOfficerCard({ application, loanProperty, onSaved }) {
  const hasData = !!(loanProperty.originator_name && loanProperty.originator_email);
  const [form, setForm] = useState({ originator_name: loanProperty.originator_name, originator_email: loanProperty.originator_email });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!hasData);
  const [pushResult, setPushResult] = useState(null);

  async function handleSave() {
    setSaving(true);
    setPushResult(null);
    try {
      const { truv_push, ...updated } = await api.patchLoanProperty(application.id, form);
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
    setForm({ originator_name: loanProperty.originator_name, originator_email: loanProperty.originator_email });
    setEditing(true);
  }

  function handleCancel() {
    setForm({ originator_name: loanProperty.originator_name, originator_email: loanProperty.originator_email });
    setEditing(false);
  }

  return (
    <Card title="Loan Officer" actions={
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
        Maps onto Truv's <code>loan.originator_name</code> / <code>loan.originator_email</code> — sent on every new
        order for this application, and pushed onto the current order immediately if one already exists.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {editing ? (
          <>
            <Input label="Loan Officer Name" value={form.originator_name || ''} onChange={(e) => setForm((f) => ({ ...f, originator_name: e.target.value }))} />
            <Input label="Loan Officer Email" type="email" value={form.originator_email || ''} onChange={(e) => setForm((f) => ({ ...f, originator_email: e.target.value }))} />
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Loan Officer Name</div>
              <div style={{ fontSize: 14 }}>{loanProperty.originator_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Loan Officer Email</div>
              <div style={{ fontSize: 14 }}>{loanProperty.originator_email || '—'}</div>
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
