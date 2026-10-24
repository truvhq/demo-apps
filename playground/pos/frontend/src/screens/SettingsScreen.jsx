import React, { useEffect, useState } from 'react';

import { Button, Card, Input, Select } from '@truv-demo/design-system';

import { api } from '../api.js';
import { AimCheckConfigCard } from '../components/AimCheckConfigCard.jsx';
import { Layout } from '../components/Layout.jsx';
import { OrderDefaultsConfigCard } from '../components/OrderDefaultsConfigCard.jsx';

const ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Production' },
];

// Sandbox and production use the identical Truv API base URL — which
// environment a request hits is determined by the Access Secret's prefix
// (sandbox-/prod-), not the host. Pre-filled so the common case just works;
// only change it for a custom/mTLS endpoint.
const DEFAULT_BASE_URL = 'https://prod.truv.com/v1/';
const EMPTY_FORM = { name: '', environment: 'sandbox', client_id: '', secret: '', base_url: DEFAULT_BASE_URL };

export function SettingsScreen() {
  const [credentialSets, setCredentialSets] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  function refresh() {
    api.listCredentialSets().then(setCredentialSets);
  }

  useEffect(refresh, []);

  async function handleCreate() {
    if (!form.name || !form.client_id || !form.secret) {
      alert('Name, Client ID, and Secret are required.');
      return;
    }
    await api.createCredentialSet(form);
    setForm(EMPTY_FORM);
    refresh();
  }

  async function handleActivate(id) {
    setBusyId(id);
    try {
      await api.activateCredentialSet(id);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(id) {
    setBusyId(id);
    try {
      const result = await api.testCredentialSet(id);
      setTestResults((r) => ({ ...r, [id]: result }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this credential set?')) return;
    await api.deleteCredentialSet(id);
    refresh();
  }

  function startEdit(cred) {
    setEditingId(cred.id);
    setEditForm({ name: cred.name, environment: cred.environment, client_id: cred.client_id, base_url: cred.base_url, secret: '' });
  }

  async function handleSaveEdit(id) {
    setBusyId(id);
    try {
      const body = { ...editForm };
      if (!body.secret) delete body.secret; // blank = leave the stored secret unchanged
      await api.patchCredentialSet(id, body);
      setEditingId(null);
      refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
        <Card title="Truv Credentials">
          <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
            Store both a Sandbox and a Production credential set, then use "Activate" to switch which one every
            Truv API call in this app uses — no restart required.
          </p>
          {credentialSets === null && <p>Loading…</p>}
          {credentialSets && credentialSets.length === 0 && (
            <p style={{ color: 'var(--truv-grey-50)' }}>No credential sets yet — add one below.</p>
          )}
          {credentialSets && credentialSets.map((cred) => (
            editingId === cred.id ? (
              <div key={cred.id} style={{ border: '1px solid var(--truv-accent)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Input label="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <Select label="Environment" value={editForm.environment} onChange={(e) => setEditForm((f) => ({ ...f, environment: e.target.value }))} options={ENV_OPTIONS} />
                  <Input label="Client ID" value={editForm.client_id} onChange={(e) => setEditForm((f) => ({ ...f, client_id: e.target.value }))} />
                  <Input label="New Secret (leave blank to keep current)" type="password" value={editForm.secret} onChange={(e) => setEditForm((f) => ({ ...f, secret: e.target.value }))} />
                  <Input label="Base URL" value={editForm.base_url} onChange={(e) => setEditForm((f) => ({ ...f, base_url: e.target.value }))} hint="Same for sandbox and production — only change for a custom endpoint." />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button onClick={() => handleSaveEdit(cred.id)} loading={busyId === cred.id}>Save</Button>
                </div>
              </div>
            ) : (
              <div key={cred.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: '1px solid var(--truv-grey-30)', borderRadius: 12, padding: 16,
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {cred.name} <span style={{ color: 'var(--truv-grey-60)', fontWeight: 400 }}>({cred.environment})</span>
                    {cred.is_active && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--truv-green)', fontWeight: 600 }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--truv-grey-60)', fontFamily: 'monospace' }}>{cred.client_id} · {cred.base_url}</div>
                  {testResults[cred.id] && (
                    <div style={{ fontSize: 12, marginTop: 4, color: testResults[cred.id].ok ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>
                      {testResults[cred.id].ok ? 'Connection OK' : `Failed (${testResults[cred.id].status_code})`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => startEdit(cred)}>Edit</Button>
                  <Button variant="secondary" onClick={() => handleTest(cred.id)} loading={busyId === cred.id}>Test</Button>
                  {!cred.is_active && <Button variant="secondary" onClick={() => handleActivate(cred.id)} loading={busyId === cred.id}>Activate</Button>}
                  <Button variant="secondary" onClick={() => handleDelete(cred.id)}>Delete</Button>
                </div>
              </div>
            )
          ))}
        </Card>

        <Card title="Add Credential Set">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sandbox" />
            <Select label="Environment" value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))} options={ENV_OPTIONS} />
            <Input label="Client ID" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} />
            <Input label="Secret" type="password" value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
            <Input
              label="Base URL"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              hint="Same for sandbox and production — the Access Secret's prefix determines the environment. Only change this for a custom/mTLS endpoint."
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleCreate}>Add Credential Set</Button>
          </div>
        </Card>

        <AimCheckConfigCard />
        <OrderDefaultsConfigCard />
      </div>
    </Layout>
  );
}
