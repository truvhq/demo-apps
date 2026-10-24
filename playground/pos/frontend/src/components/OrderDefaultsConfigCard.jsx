import React, { useEffect, useState } from 'react';

import { Button, Card, Input } from '@truv-demo/design-system';

import { api } from '../api.js';

/** Account-level default applied to every new order this project creates —
 * confirmed real Truv field: `cc_emails` on the order (docs.truv.com/
 * api-reference/orders/object#attributes), CC'd on order status updates.
 * Plays the same role Truv's dashboard "Order Manager" concept plays for
 * dashboard-created orders. Own row per project, same pattern as
 * credentials/AIM Check config. */
export function OrderDefaultsConfigCard() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  function refresh() {
    api.getOrderDefaultsConfig().then(setConfig);
  }

  useEffect(refresh, []);

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    try {
      const updated = await api.patchOrderDefaultsConfig(config);
      setConfig(updated);
      setSaveMessage('Saved.');
    } catch (e) {
      setSaveMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <Card title="Order Defaults"><p>Loading…</p></Card>;

  return (
    <Card title="Order Defaults" actions={<Button onClick={handleSave} loading={saving}>Save</Button>}>
      <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, marginTop: -8 }}>
        When set, this address is CC'd on status updates for every new order this project creates
        (Truv's real <code>cc_emails</code> field) — the same role Truv's dashboard "Order Manager" plays.
      </p>
      <Input
        label="Order Manager Email"
        type="email"
        value={config.order_manager_email || ''}
        onChange={(e) => setConfig((c) => ({ ...c, order_manager_email: e.target.value }))}
        placeholder="e.g. ops@truvlending.com"
      />
      {saveMessage && (
        <p style={{ fontSize: 13, color: saveMessage === 'Saved.' ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>{saveMessage}</p>
      )}
    </Card>
  );
}
