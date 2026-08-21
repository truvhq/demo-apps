import React, { useEffect, useState } from 'react';

import { Button, Card, Input, Select } from '@truv-demo/design-system';

import { api } from '../api.js';

const LOAN_PROGRAM_OPTIONS = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'fha', label: 'FHA' },
  { value: 'va', label: 'VA' },
  { value: 'usda', label: 'USDA' },
  { value: 'jumbo', label: 'Jumbo' },
  { value: 'other', label: 'Other' },
];

function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(2)}%`;
}

export function LoanCalculatorCard({ applicationId }) {
  const [calc, setCalc] = useState(null);
  const [form, setForm] = useState({ loan_amount: '', estimated_property_value: '', note_rate: '', loan_term_months: '360', loan_program: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function refresh() {
    api.getUnderwritingCalc(applicationId).then((c) => {
      setCalc(c);
      setForm({
        loan_amount: c.loan_amount ?? '',
        estimated_property_value: c.estimated_property_value ?? '',
        note_rate: c.note_rate ?? '',
        loan_term_months: c.loan_term_months ?? '360',
        loan_program: c.loan_program ?? '',
      });
    });
  }

  useEffect(refresh, [applicationId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patchLoanProperty(applicationId, {
        loan_amount: form.loan_amount || null,
        estimated_property_value: form.estimated_property_value || null,
        note_rate: form.note_rate || null,
        loan_term_months: form.loan_term_months || null,
        loan_program: form.loan_program || '',
      });
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!calc) return <Card title="Underwriting Calculator"><p>Loading…</p></Card>;

  return (
    <Card title="Underwriting Calculator" actions={<Button onClick={handleSave} loading={saving}>Save</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Input label="Loan Amount" type="number" value={form.loan_amount} onChange={(e) => setForm({ ...form, loan_amount: e.target.value })} />
        <Input label="Est. Property Value" type="number" value={form.estimated_property_value} onChange={(e) => setForm({ ...form, estimated_property_value: e.target.value })} />
        <Select label="Program" value={form.loan_program} onChange={(e) => setForm({ ...form, loan_program: e.target.value })} options={LOAN_PROGRAM_OPTIONS} />
        <Input label="Note Rate (%)" type="number" step="0.001" value={form.note_rate} onChange={(e) => setForm({ ...form, note_rate: e.target.value })} />
        <Input label="Term (months)" type="number" value={form.loan_term_months} onChange={(e) => setForm({ ...form, loan_term_months: e.target.value })} />
      </div>

      {error && <p style={{ color: 'var(--truv-text-red)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 8, borderTop: '1px solid var(--truv-grey-30)' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>Monthly P&I Payment</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtMoney(calc.monthly_pi_payment)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>LTV</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtPct(calc.ltv_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>Gross Monthly Income (Truv)</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtMoney(calc.gross_monthly_income)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>Front-End DTI (P&I only)</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtPct(calc.front_end_dti_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>Back-End DTI</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtPct(calc.back_end_dti_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-60)' }}>Total Monthly Debt (Truv)</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--truv-font-display)' }}>{fmtMoney(calc.total_monthly_debt)}</div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--truv-grey-50)' }}>{calc.note}</p>
    </Card>
  );
}
