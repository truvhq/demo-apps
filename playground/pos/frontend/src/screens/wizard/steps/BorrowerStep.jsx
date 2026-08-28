import React, { useState } from 'react';

import { Button, Card } from '@truv-demo/design-system';

import { api } from '../../../api.js';
import { hasBorrowerData } from '../completion.js';
import { FieldRow, fillStateFor } from '../FieldRow.jsx';

const MARITAL_OPTIONS = [
  { value: 'married', label: 'Married' },
  { value: 'separated', label: 'Separated' },
  { value: 'unmarried', label: 'Unmarried' },
];

const CITIZENSHIP_OPTIONS = [
  { value: 'us_citizen', label: 'U.S. Citizen' },
  { value: 'permanent_resident_alien', label: 'Permanent Resident Alien' },
  { value: 'non_permanent_resident_alien', label: 'Non-Permanent Resident Alien' },
];

export function BorrowerStep({ application, borrower, fillStates, onSaved, onNext, onBack }) {
  const [form, setForm] = useState(borrower);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!hasBorrowerData(borrower));

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.patchBorrower(application.id, borrower.id, form);
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit() {
    setForm(borrower);
    setEditing(true);
  }

  function handleCancel() {
    setForm(borrower);
    setEditing(false);
  }

  return (
    <Card title="Borrower Information" actions={
      editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={handleEdit}>Edit</Button>
      )
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FieldRow fieldKey="borrower.first_name" fillState={fillStateFor(fillStates, 'borrower.first_name', borrower.id)}
          label="First Name" value={form.first_name} onChange={set('first_name')} required readOnly={!editing} />
        <FieldRow fieldKey="borrower.last_name" fillState={fillStateFor(fillStates, 'borrower.last_name', borrower.id)}
          label="Last Name" value={form.last_name} onChange={set('last_name')} required readOnly={!editing} />
        <FieldRow fieldKey="borrower.ssn" fillState={fillStateFor(fillStates, 'borrower.ssn', borrower.id)}
          label="Social Security Number" value={form.ssn} onChange={set('ssn')} required readOnly={!editing} />
        <FieldRow fieldKey="borrower.date_of_birth" fillState={fillStateFor(fillStates, 'borrower.date_of_birth', borrower.id)}
          label="Date of Birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} required readOnly={!editing} />
        <FieldRow fieldKey="borrower.marital_status" fillState={fillStateFor(fillStates, 'borrower.marital_status', borrower.id)}
          label="Marital Status" value={form.marital_status} onChange={set('marital_status')} options={MARITAL_OPTIONS} readOnly={!editing} />
        <FieldRow fieldKey="borrower.citizenship_type" fillState={fillStateFor(fillStates, 'borrower.citizenship_type', borrower.id)}
          label="Citizenship" value={form.citizenship_type} onChange={set('citizenship_type')} options={CITIZENSHIP_OPTIONS} readOnly={!editing} />
        <FieldRow fieldKey="borrower.email" fillState={fillStateFor(fillStates, 'borrower.email', borrower.id)}
          label="Email" type="email" value={form.email} onChange={set('email')} required readOnly={!editing} />
        <FieldRow fieldKey="borrower.phone" fillState={fillStateFor(fillStates, 'borrower.phone', borrower.id)}
          label="Phone" value={form.phone} onChange={set('phone')} required readOnly={!editing} />
      </div>
      {editing ? (
        <p style={{ fontSize: 13, color: 'var(--truv-grey-50)', textAlign: 'right' }}>
          Save or cancel your changes above to continue.
        </p>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onBack} disabled>← Back</Button>
          <Button variant="secondary" onClick={onNext}>Next →</Button>
        </div>
      )}
    </Card>
  );
}
