import React, { useEffect, useState } from 'react';

import { Card } from '@truv-demo/design-system';

import { api } from '../api.js';
import { LoanCalculatorCard } from '../components/LoanCalculatorCard.jsx';
import { UnderwritingDecisionCard } from '../components/UnderwritingDecisionCard.jsx';

export function UnderwritingSupportView({ applicationId }) {
  const [support, setSupport] = useState(null);

  useEffect(() => { api.getUnderwritingSupport(applicationId).then(setSupport); }, [applicationId]);

  if (!support) return <Card title="Underwriting Support Data"><p>Loading…</p></Card>;

  if (support.note) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <LoanCalculatorCard applicationId={applicationId} />
        <Card title="Underwriting Support Data"><p style={{ color: 'var(--truv-grey-50)' }}>{support.note}</p></Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LoanCalculatorCard applicationId={applicationId} />

      <Card title="Employment">
        {support.employment.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>None reported by Truv.</p>}
        {support.employment.map((e, i) => (
          <div key={i} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
            <strong>{e.employer_name}</strong> — {e.title || 'title n/a'}
            {e.start_date && ` · since ${e.start_date}`}
          </div>
        ))}
      </Card>

      <Card title="Income">
        {support.income.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>None reported by Truv.</p>}
        {support.income.map((inc, i) => (
          <div key={i} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
            <strong>{inc.employer_name}</strong> — base ${inc.base_pay ?? 0}/mo, overtime ${inc.overtime ?? 0},
            bonus ${inc.bonus ?? 0}, commission ${inc.commission ?? 0} ({inc.pay_frequency || 'frequency n/a'})
          </div>
        ))}
      </Card>

      <Card title="Assets">
        {support.assets.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>None reported by Truv.</p>}
        {support.assets.map((a, i) => (
          <div key={i} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
            <strong>{a.financial_institution_name}</strong> — {a.account_type} — ${a.balance ?? 0}
            {a.account_number_masked && ` (••••${a.account_number_masked})`}
          </div>
        ))}
      </Card>

      <Card title="Liabilities">
        {support.liabilities.length === 0 && <p style={{ color: 'var(--truv-grey-50)' }}>None reported by Truv.</p>}
        {support.liabilities.map((l, i) => (
          <div key={i} style={{ fontSize: 13, border: '1px solid var(--truv-grey-30)', borderRadius: 8, padding: 10 }}>
            <strong>{l.creditor_name}</strong> — {l.liability_type} — balance ${l.unpaid_balance ?? 0}
            {l.monthly_payment != null && `, payment $${l.monthly_payment}/mo`}
            {l.credit_limit != null && `, limit $${l.credit_limit}`}
            {l.interest_rate != null && `, ${l.interest_rate}% APR`}
          </div>
        ))}
      </Card>

      <p style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
        Based on Truv order {support.based_on_order_id}, last refreshed {new Date(support.generated_at).toLocaleString()}.
      </p>

      <UnderwritingDecisionCard applicationId={applicationId} />
    </div>
  );
}
