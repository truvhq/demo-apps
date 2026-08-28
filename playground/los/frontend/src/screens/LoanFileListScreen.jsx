import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@truv-demo/design-system';

import { api } from '../api.js';
import { Layout } from '../components/Layout.jsx';

export function LoanFileListScreen() {
  const [loanFiles, setLoanFiles] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { api.listLoanFiles().then(setLoanFiles); }, []);

  return (
    <Layout>
      <Card title="Loan Files">
        {loanFiles === null && <p>Loading…</p>}
        {loanFiles && loanFiles.length === 0 && (
          <p style={{ color: 'var(--truv-grey-50)' }}>No loan files yet — submit an application from the POS to see it here.</p>
        )}
        {loanFiles && loanFiles.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--truv-grey-60)', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={th}>Loan #</th>
                <th style={th}>Borrower</th>
                <th style={th}>Status</th>
                <th style={th}>Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {loanFiles.map((lf) => (
                <tr key={lf.id} onClick={() => navigate(`/loan-files/${lf.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid var(--truv-grey-30)' }}>
                  <td style={td}>{lf.loan_number}</td>
                  <td style={td}>{lf.borrower_name || '—'}</td>
                  <td style={td}>{lf.status}</td>
                  <td style={td}>{lf.last_synced_at ? new Date(lf.last_synced_at).toLocaleString() : '—'}</td>
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
