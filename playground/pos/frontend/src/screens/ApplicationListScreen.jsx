import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card } from '@truv-demo/design-system';

import { api } from '../api.js';
import { Layout } from '../components/Layout.jsx';

export function ApplicationListScreen() {
  const [applications, setApplications] = useState(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.listApplications().then(setApplications);
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const app = await api.createApplication({ borrower: {} });
      navigate(`/applications/${app.id}`);
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <Card
        title="Loan Applications"
        actions={<Button onClick={handleCreate} loading={creating}>New Application</Button>}
      >
        {applications === null && <p>Loading…</p>}
        {applications && applications.length === 0 && (
          <p style={{ color: 'var(--truv-grey-50)' }}>No applications yet — start one to see how much Truv can auto-fill.</p>
        )}
        {applications && applications.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--truv-grey-60)', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={th}>Loan #</th>
                <th style={th}>Borrower</th>
                <th style={th}>Status</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => navigate(`/applications/${app.id}`)}
                  style={{ cursor: 'pointer', borderTop: '1px solid var(--truv-grey-30)' }}
                >
                  <td style={td}>{app.loan_number}</td>
                  <td style={td}>{app.borrower_name || '—'}</td>
                  <td style={td}>{app.status}</td>
                  <td style={td}>{new Date(app.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  );
}

const th = { padding: '8px 4px' };
const td = { padding: '10px 4px' };
