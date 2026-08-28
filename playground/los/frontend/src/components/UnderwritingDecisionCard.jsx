import React, { useEffect, useState } from 'react';

import { Button, Card, Chip, Input } from '@truv-demo/design-system';

import { api } from '../api.js';

const DECISION_TONE = { approved: 'success', rejected: 'error' };

export function UnderwritingDecisionCard({ applicationId }) {
  const [decision, setDecision] = useState(undefined);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function refresh() {
    api.getUnderwritingDecision(applicationId).then((d) => {
      setDecision(d);
      setNotes(d?.notes || '');
    });
  }

  useEffect(refresh, [applicationId]);

  async function handleDecide(choice) {
    setBusy(true);
    setError(null);
    try {
      await api.submitUnderwritingDecision(applicationId, { decision: choice, notes });
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (decision === undefined) return <Card title="Underwriting Decision"><p>Loading…</p></Card>;

  return (
    <Card
      title="Underwriting Decision"
      actions={decision && <Chip tone={DECISION_TONE[decision.decision]}>{decision.decision}</Chip>}
    >
      <p style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
        Approving freezes the Truv data below as the verified baseline and unlocks the Closing tab, where a
        pre-close refresh can be diffed against it — the same "still holds at closing" check a real underwriter runs.
      </p>

      {decision && (
        <div style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
          Last decision: {decision.decision} at {new Date(decision.decided_at).toLocaleString()}
          {decision.decided_by && ` by ${decision.decided_by}`}
        </div>
      )}

      <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, comments…" />

      {error && <p style={{ color: 'var(--truv-text-red)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => handleDecide('approved')} loading={busy}>Approve</Button>
        <Button variant="secondary" onClick={() => handleDecide('rejected')} loading={busy}>Reject</Button>
      </div>
    </Card>
  );
}
