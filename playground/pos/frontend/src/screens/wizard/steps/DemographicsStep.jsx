import React, { useEffect, useState } from 'react';

import { Button, Card, Select } from '@truv-demo/design-system';

import { api } from '../../../api.js';
import { hasDemographicData } from '../completion.js';

const ETHNICITY_OPTIONS = [
  { value: 'hispanic_or_latino', label: 'Hispanic or Latino' },
  { value: 'not_hispanic_or_latino', label: 'Not Hispanic or Latino' },
  { value: 'not_provided', label: 'I do not wish to provide this information' },
];
const RACE_OPTIONS = [
  { value: 'american_indian_or_alaska_native', label: 'American Indian or Alaska Native' },
  { value: 'asian', label: 'Asian' },
  { value: 'black_or_african_american', label: 'Black or African American' },
  { value: 'native_hawaiian_or_pacific_islander', label: 'Native Hawaiian or Other Pacific Islander' },
  { value: 'white', label: 'White' },
  { value: 'not_provided', label: 'I do not wish to provide this information' },
];
const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'not_provided', label: 'I do not wish to provide this information' },
];
const METHOD_OPTIONS = [
  { value: 'face_to_face', label: 'Face-to-Face' },
  { value: 'telephone', label: 'Telephone' },
  { value: 'fax_or_mail', label: 'Fax or Mail' },
  { value: 'email_or_internet', label: 'Email or Internet' },
];

export function DemographicsStep({ application, borrower, onSaved, onNext, onBack }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getDemographics(application.id, borrower.id).then((d) => {
      setSaved(d);
      setForm(d);
      setEditing(!hasDemographicData(d));
    });
  }, [application.id, borrower.id]);

  if (!form) return <Card title="Demographic Information"><p>Loading…</p></Card>;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.patchDemographics(application.id, borrower.id, form);
      setSaved(updated);
      setForm(updated);
      setEditing(false);
      onSaved?.(updated);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit() {
    setForm(saved);
    setEditing(true);
  }

  function handleCancel() {
    setForm(saved);
    setEditing(false);
  }

  return (
    <Card title="Demographic Information" actions={
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
        Federal regulation requires this section be self-reported by the borrower — Truv cannot and does not supply it.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Select label="Ethnicity" value={form.ethnicity} onChange={(e) => setForm((f) => ({ ...f, ethnicity: e.target.value }))} options={ETHNICITY_OPTIONS} required disabled={!editing} />
        <Select label="Race" value={form.race} onChange={(e) => setForm((f) => ({ ...f, race: e.target.value }))} options={RACE_OPTIONS} required disabled={!editing} />
        <Select label="Sex" value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))} options={SEX_OPTIONS} required disabled={!editing} />
        <Select label="Application Taken Via" value={form.application_taken_method} onChange={(e) => setForm((f) => ({ ...f, application_taken_method: e.target.value }))} options={METHOD_OPTIONS} disabled={!editing} />
      </div>
      {editing ? (
        <p style={{ fontSize: 13, color: 'var(--truv-grey-50)', textAlign: 'right' }}>
          Save or cancel your changes above to continue.
        </p>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onBack}>← Back</Button>
          <Button variant="secondary" onClick={onNext}>Next →</Button>
        </div>
      )}
    </Card>
  );
}
