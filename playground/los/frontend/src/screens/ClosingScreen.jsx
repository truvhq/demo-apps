import React, { useEffect, useState } from 'react';

import { Button, Card, Chip } from '@truv-demo/design-system';

import { api } from '../api.js';

/** Sets Truv's real `loan.funding_date` (confirmed via docs.truv.com/
 * api-reference/orders/orders_partial_update) via PATCH /v1/orders/{id}/ on
 * the loan's current order — the last real step in this playground's loan
 * lifecycle (assign loan officer in POS -> assign processor in LOS -> fund).
 * Truv only allows order updates while employers are pending/sent, so
 * funding an already-completed order is expected to be rejected — this
 * surfaces whatever Truv actually says rather than assuming success. */
function FundLoanCard({ applicationId }) {
  const [loanProperty, setLoanProperty] = useState(null);
  const [funding, setFunding] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  useEffect(() => { api.getLoanFile(applicationId).then((lf) => setLoanProperty(lf.loan_property)); }, [applicationId]);

  async function handleFund() {
    setFunding(true);
    setPushResult(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { truv_push, ...updated } = await api.patchLoanProperty(applicationId, { funding_date: today });
      setLoanProperty(updated);
      if (truv_push) setPushResult(truv_push);
    } catch (e) {
      setPushResult({ ok: false, status_code: null, error: e.message });
    } finally {
      setFunding(false);
    }
  }

  if (!loanProperty) return null;

  return (
    <Card title="Fund Loan">
      <p style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
        Sets Truv's <code>loan.funding_date</code> on the current order via a real{' '}
        <code>PATCH /v1/orders/{'{'}id{'}'}/</code> call.
      </p>
      {loanProperty.funding_date ? (
        <Chip tone="success">Funded {loanProperty.funding_date}</Chip>
      ) : (
        <Button onClick={handleFund} loading={funding}>Fund Loan (today)</Button>
      )}
      {pushResult && (
        <p style={{ fontSize: 13, color: pushResult.ok ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>
          {pushResult.ok
            ? 'Pushed to the current Truv order.'
            : `Truv did not accept the update${pushResult.status_code ? ` (status ${pushResult.status_code})` : ''} — this order may have already completed, or has no current order yet.`}
        </p>
      )}
    </Card>
  );
}

const CATEGORY_LABELS = { employment: 'Employment', income: 'Income', assets: 'Assets', liabilities: 'Liabilities' };
const STATUS_TONE = { match: 'success', changed: 'warning', new: 'accent', removed: 'error' };
const STATUS_LABEL = { match: 'Match', changed: 'Changed', new: 'New since approval', removed: 'No longer reported' };

function entryLabel(category, entry) {
  const item = entry.current || entry.approved;
  if (category === 'employment' || category === 'income') return item?.employer_name || 'Employer';
  return `${item?.financial_institution_name || item?.creditor_name || 'Account'}${item?.account_number_masked ? ` (••••${item.account_number_masked})` : ''}`;
}

export function ClosingScreen({ applicationId }) {
  const [decision, setDecision] = useState(undefined);
  const [verification, setVerification] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.getUnderwritingDecision(applicationId).then(setDecision); }, [applicationId]);

  function loadVerification() {
    api.getClosingVerification(applicationId).then(setVerification).catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (decision?.decision === 'approved') loadVerification();
  }, [applicationId, decision]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await api.refreshOrder(applicationId);
      loadVerification();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (decision === undefined) return <Card title="Closing"><p>Loading…</p></Card>;

  if (decision?.decision !== 'approved') {
    return (
      <Card title="Closing">
        <p style={{ color: 'var(--truv-grey-50)' }}>
          This loan file must be approved on the Underwriting Support Data tab before moving to closing.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Pre-Close Verification"
        actions={<Button onClick={handleRefresh} loading={refreshing}>Refresh from Truv</Button>}
      >
        <p style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
          Re-pulls the borrower's Truv data and compares it against what was approved during underwriting — the same
          check a lender runs shortly before closing to confirm employment/income/assets/liabilities still hold.
        </p>
        {error && <p style={{ color: 'var(--truv-text-red)', fontSize: 13 }}>{error}</p>}
        {verification && (
          <>
            <Chip tone={verification.overall_status === 'match' ? 'success' : 'warning'}>
              Overall: {verification.overall_status === 'match' ? 'Still holds — no changes detected' : 'Mismatch detected — review before clear-to-close'}
            </Chip>
            <p style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
              Approved {new Date(verification.approved_at).toLocaleString()} · current data based on Truv order{' '}
              {verification.current_based_on_order_id}, pulled {new Date(verification.current_generated_at).toLocaleString()}.
            </p>
          </>
        )}
      </Card>

      <FundLoanCard applicationId={applicationId} />

      {verification && Object.entries(verification.diff).map(([category, entries]) => (
        <Card key={category} title={CATEGORY_LABELS[category]}>
          {entries.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>No data in either the approved or current pull.</p>}
          {entries.map((entry, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{entryLabel(category, entry)}</strong>
                <Chip tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Chip>
              </div>
              {entry.status === 'changed' && entry.changed_fields.map((field) => (
                <div key={field} style={{ color: 'var(--truv-grey-60)' }}>
                  {field}: {String(entry.approved?.[field] ?? '—')} → {String(entry.current?.[field] ?? '—')}
                </div>
              ))}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
