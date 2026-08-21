import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DevPanel, Switch } from '@truv-demo/design-system';

import { api } from '../api.js';

const DEV_MODE_KEY = 'truv-demo-dev-mode';

// A loan's UUID is always echoed back as `loan.external_id` on every order
// request/response (see urla/truv_loan.py), so it alone catches most
// loan-specific Truv traffic; loan_number/application_number/
// last_truv_order_id cover the rest (order_number, webhook truv_order_id).
function loadDevPanelContexts() {
  return api.listLoanFiles().then((files) => files.map((f) => ({
    id: f.id,
    label: `${f.loan_number} — ${f.status.replace(/_/g, ' ')}`,
    identifiers: [f.loan_number, f.loan_uuid, f.application_number, f.last_truv_order_id].filter(Boolean),
  })));
}

/** Back-office shell — denser than POS's, since this is an internal
 * underwriting tool rather than a borrower-facing wizard. A "Dev" toggle in
 * the top-right corner reveals a right-side pane of live Truv API traffic,
 * without touching the rest of the layout when off. */
export function Layout({ loanHeader, children }) {
  const [devMode, setDevMode] = useState(() => localStorage.getItem(DEV_MODE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(DEV_MODE_KEY, devMode ? '1' : '0');
  }, [devMode]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--truv-primary-black)', color: 'var(--truv-white)',
        padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 32,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10, background: 'var(--truv-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--truv-font-display)', fontWeight: 700, color: 'var(--truv-white)',
          }}>t</span>
          <span style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--truv-white)' }}>
            Truv LOS
          </span>
        </Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link to="/" style={navLinkStyle}>Loan Files</Link>
          <Link to="/configure-truv" style={navLinkStyle}>Configure Truv</Link>
          <Link to="/settings" style={navLinkStyle}>Settings</Link>
        </nav>

        <a
          href={import.meta.env.VITE_POS_URL || 'http://localhost:5183'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 500, color: 'var(--truv-white)', textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 100, padding: '10px 14px',
          }}
        >
          Switch to POS →
        </a>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 20px', background: 'var(--truv-grey-20)', borderBottom: '1px solid var(--truv-grey-30)',
        }}>
          <Switch label="Dev" checked={devMode} onChange={setDevMode} />
        </div>
        {loanHeader && (
          <header style={{
            background: 'var(--truv-white)', borderBottom: '1px solid var(--truv-grey-30)',
            padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {loanHeader}
          </header>
        )}
        <main style={{ flex: 1, padding: 32 }}>
          {children}
        </main>
      </div>
      {devMode && <DevPanel api={api} loadContexts={loadDevPanelContexts} />}
    </div>
  );
}

const navLinkStyle = {
  color: 'rgba(255,255,255,0.75)',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
  padding: '8px 10px',
  borderRadius: 8,
};
