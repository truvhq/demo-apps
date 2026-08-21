import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DevPanel, Switch, captureDemoAppsReturn, getDemoAppsReturnUrl } from '@truv-demo/design-system';

import { api } from '../api.js';

const DEV_MODE_KEY = 'truv-demo-dev-mode';

// A loan's UUID is always echoed back as `loan.external_id` on every order
// request/response (see urla/truv_loan.py), so it alone catches most
// application-specific Truv traffic; loan_number/application_number/
// last_truv_order_id cover the rest (order_number, webhook truv_order_id).
function loadDevPanelContexts() {
  return api.listApplications().then((apps) => apps.map((a) => ({
    id: a.id,
    label: `${a.loan_number} — ${a.status.replace(/_/g, ' ')}`,
    identifiers: [a.loan_number, a.loan_uuid, a.application_number, a.last_truv_order_id].filter(Boolean),
  })));
}

/** nCino-inspired shell: a slim left rail (brand + nav) and a top loan header
 * bar (loan #, status, borrower name) above the page content. A "Dev" toggle
 * in the top-right corner reveals a right-side pane of live Truv API traffic
 * (replaces the old floating ActivityLogPanel) without touching the rest of
 * the layout when off. */
export function Layout({ loanHeader, children }) {
  const [devMode, setDevMode] = useState(() => localStorage.getItem(DEV_MODE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(DEV_MODE_KEY, devMode ? '1' : '0');
  }, [devMode]);

  // Only the initial landing (via a demo-apps "Dev Playground" button, which
  // appends ?from=<hash-route>) ever has the param; capture is a no-op on
  // every later navigation once it's stripped from the URL.
  useEffect(() => {
    captureDemoAppsReturn();
  }, []);
  const demoAppsUrl = getDemoAppsReturnUrl(import.meta.env.VITE_DEMO_APPS_URL || 'http://localhost:5173');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--truv-primary-black)', color: 'var(--truv-white)',
        padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 32,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10, background: 'var(--truv-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--truv-font-display)', fontWeight: 700, color: 'var(--truv-white)',
          }}>t</span>
          <span style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--truv-white)' }}>
            Truv POS
          </span>
        </Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link to="/" style={navLinkStyle}>Applications</Link>
          <Link to="/configure-truv" style={navLinkStyle}>Configure Truv</Link>
          <Link to="/settings" style={navLinkStyle}>Settings</Link>
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Same-tab navigation: returns to the demo the "Dev Playground"
              button was clicked from, or the demo-apps home page if this tab
              wasn't opened from one. */}
          <a
            href={demoAppsUrl}
            style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}
          >
            ← Back to Demo Apps
          </a>
          <a
            href={import.meta.env.VITE_LOS_URL || 'http://localhost:5184'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, color: 'var(--truv-white)', textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 100, padding: '10px 14px',
            }}
          >
            Switch to LOS →
          </a>
        </div>
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
