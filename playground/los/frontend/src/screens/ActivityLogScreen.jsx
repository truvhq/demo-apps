import React, { useEffect, useState } from 'react';

import { Card, Chip } from '@truv-demo/design-system';

import { api } from '../api.js';

const ACTOR_TONE = { system: 'neutral', truv: 'accent', user: 'success' };

export function ActivityLogScreen({ applicationId }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => { api.getActivityLog(applicationId).then(setEntries); }, [applicationId]);

  return (
    <Card title="Activity Log">
      {entries === null && <p>Loading…</p>}
      {entries && entries.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>No activity yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries && entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, borderBottom: '1px solid var(--truv-grey-20)', padding: '8px 0' }}>
            <Chip tone={ACTOR_TONE[e.actor] || 'neutral'}>{e.actor}</Chip>
            <span style={{ flex: 1 }}>{e.message}</span>
            <span style={{ color: 'var(--truv-grey-60)', fontSize: 12 }}>{new Date(e.timestamp).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
