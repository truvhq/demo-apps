import React, { useEffect, useState } from 'react';

import { Button, Card, Switch } from '@truv-demo/design-system';

import { api } from '../../../api.js';
import { hasDeclarationData } from '../completion.js';

const QUESTIONS = [
  { name: 'intent_to_occupy_primary', label: 'Do you intend to occupy this property as your primary residence?' },
  { name: 'ownership_interest_last_3_years', label: 'Have you had ownership interest in another property in the last 3 years?' },
  { name: 'outstanding_judgments', label: 'Are there any outstanding judgments against you?' },
  { name: 'bankruptcy_last_7_years', label: 'Have you declared bankruptcy in the last 7 years?' },
  { name: 'foreclosure_last_7_years', label: 'Have you been party to a foreclosure in the last 7 years?' },
  { name: 'party_to_lawsuit', label: 'Are you a party to a lawsuit?' },
  { name: 'delinquent_federal_debt', label: 'Are you delinquent on any federal debt?' },
];

export function DeclarationsStep({ application, borrower, onSaved, onNext, onBack }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getDeclaration(application.id, borrower.id).then((d) => {
      setSaved(d);
      setForm(d);
      setEditing(!hasDeclarationData(d));
    });
  }, [application.id, borrower.id]);

  if (!form) return <Card title="Declarations"><p>Loading…</p></Card>;

  async function handleSave() {
    setSaving(true);
    try {
      // A switch left untouched (or toggled off) is a real "No" answer, not
      // "unanswered" — without this coercion, an untouched question stays
      // null forever (the PATCH just resends the same null), so the step
      // could never be detected as complete even after the borrower
      // deliberately answered "no" to everything and saved.
      const payload = { ...form };
      QUESTIONS.forEach((q) => { payload[q.name] = !!form[q.name]; });
      const updated = await api.patchDeclaration(application.id, borrower.id, payload);
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
    <Card title="Declarations" actions={
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
        Truv has no product for this section — declarations must always be self-reported by the borrower.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {QUESTIONS.map((q) => (
          <div key={q.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 14 }}>{q.label}</span>
            <Switch checked={!!form[q.name]} onChange={(v) => setForm((f) => ({ ...f, [q.name]: v }))} disabled={!editing} />
          </div>
        ))}
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
