import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button, Card, Chip } from '@truv-demo/design-system';

import { api } from '../api.js';
import { Layout } from '../components/Layout.jsx';
import { ProcessorAssignmentCard } from '../components/ProcessorAssignmentCard.jsx';
import { ActivityLogScreen } from './ActivityLogScreen.jsx';
import { ClosingScreen } from './ClosingScreen.jsx';
import { DocumentManagerScreen } from './DocumentManagerScreen.jsx';
import { UnderwritingSupportView } from './UnderwritingSupportView.jsx';

const TABS = ['Application', 'Underwriting Support Data', 'Closing', 'Documents', 'Activity Log'];

export function LoanFileDetailScreen() {
  const { id } = useParams();
  const [loanFile, setLoanFile] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [tab, setTab] = useState('Application');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const [lf, cov] = await Promise.all([api.getLoanFile(id), api.getCoverage(id)]);
    setLoanFile(lf);
    setCoverage(cov);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRefreshOrder() {
    setRefreshing(true);
    try {
      await api.refreshOrder(id);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (!loanFile) return <Layout><p>Loading…</p></Layout>;

  const primary = loanFile.borrowers.find((b) => b.borrower_type === 'primary') || loanFile.borrowers[0];
  const pct = coverage?.total_fillable_by_truv
    ? Math.round((coverage.auto_filled_count / coverage.total_fillable_by_truv) * 100)
    : 0;

  return (
    <Layout loanHeader={
      <>
        <div>
          <div style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 18 }}>{loanFile.loan_number}</div>
          <div style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
            {primary ? `${primary.first_name} ${primary.last_name}` : 'Borrower'} · {loanFile.status.replace(/_/g, ' ')}
            {coverage && ` · ${pct}% Truv-filled`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleRefreshOrder} loading={refreshing}>Refresh from Truv</Button>
        </div>
      </>
    }>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--truv-grey-30)' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 13,
                fontWeight: 500, color: tab === t ? 'var(--truv-accent)' : 'var(--truv-grey-60)',
                borderBottom: tab === t ? '2px solid var(--truv-accent)' : '2px solid transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Application' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loanFile.borrowers.map((b) => (
              <Card key={b.id} title={`${b.borrower_type === 'primary' ? 'Primary Borrower' : 'Co-Borrower'}: ${b.first_name} ${b.last_name}`}>
                <div style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>{b.email} · {b.phone}</div>

                <div style={{ fontSize: 13, fontWeight: 600 }}>Employment & Income</div>
                {b.employment_records.length === 0 && <div style={{ color: 'var(--truv-grey-50)', fontSize: 13 }}>None on file</div>}
                {b.employment_records.map((e) => (
                  <div key={e.id} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
                    {e.employer_name} — {e.position_title || 'Position n/a'} — ${e.monthly_income_base || 0}/mo
                  </div>
                ))}

                <div style={{ fontSize: 13, fontWeight: 600 }}>Assets</div>
                {b.assets.length === 0 && <div style={{ color: 'var(--truv-grey-50)', fontSize: 13 }}>None on file</div>}
                {b.assets.map((a) => (
                  <div key={a.id} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
                    {a.financial_institution_name} ({a.account_type}) — ${a.cash_or_market_value || 0}
                  </div>
                ))}

                <div style={{ fontSize: 13, fontWeight: 600 }}>Liabilities</div>
                {b.liabilities.length === 0 && <div style={{ color: 'var(--truv-grey-50)', fontSize: 13 }}>None on file</div>}
                {b.liabilities.map((l) => (
                  <div key={l.id} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
                    {l.creditor_name} ({l.liability_type}) — ${l.monthly_payment || 0}/mo, balance ${l.unpaid_balance || 0}
                    {l.account_number_masked && ` (••••${l.account_number_masked})`}
                    {l.credit_limit && `, limit $${l.credit_limit}`}
                    {l.interest_rate && `, ${l.interest_rate}% APR`}
                  </div>
                ))}

                <div style={{ fontSize: 13, fontWeight: 600 }}>Real Estate Owned</div>
                {b.real_estate_owned.length === 0 && <div style={{ color: 'var(--truv-grey-50)', fontSize: 13 }}>None on file</div>}
                {b.real_estate_owned.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
                    {r.address || 'Address n/a'} ({r.property_type}) — {r.status} — value ${r.market_value || 0}
                    {r.mortgage_balance ? `, mortgage balance $${r.mortgage_balance}` : ''}
                  </div>
                ))}
              </Card>
            ))}

            {loanFile.loan_property && (
              <Card title="Loan & Property">
                <div style={{ fontSize: 13 }}>
                  {loanFile.loan_property.property_address || 'Address n/a'} · {loanFile.loan_property.loan_purpose} ·
                  ${loanFile.loan_property.loan_amount || 0}
                </div>
              </Card>
            )}

            {loanFile.loan_property && (
              <ProcessorAssignmentCard
                applicationId={id}
                loanProperty={loanFile.loan_property}
                onSaved={(lp) => setLoanFile((f) => ({ ...f, loan_property: lp }))}
              />
            )}

            {coverage && (
              <Card title="Truv Coverage">
                <Chip tone={pct > 0 ? 'success' : 'neutral'}>{coverage.auto_filled_count} / {coverage.total_fillable_by_truv} fields auto-filled by Truv</Chip>
              </Card>
            )}
          </div>
        )}

        {tab === 'Underwriting Support Data' && <UnderwritingSupportView applicationId={id} />}
        {tab === 'Closing' && <ClosingScreen applicationId={id} />}
        {tab === 'Documents' && <DocumentManagerScreen applicationId={id} />}
        {tab === 'Activity Log' && <ActivityLogScreen applicationId={id} />}
      </div>
    </Layout>
  );
}
