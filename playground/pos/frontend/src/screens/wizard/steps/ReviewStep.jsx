import React, { useEffect, useState } from 'react';

import { Button, Card } from '@truv-demo/design-system';

import { api } from '../../../api.js';

const SECTION_LABELS = {
  borrower_info: 'Borrower Information',
  employment_income: 'Employment & Income',
  assets: 'Assets',
  liabilities: 'Liabilities',
  reo: 'Real Estate Owned',
  loan_property: 'Loan & Property',
  declarations: 'Declarations',
  demographics: 'Demographic Information',
};

export function ReviewStep({ application, onBack }) {
  const [coverage, setCoverage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    api.getCoverage(application.id).then(setCoverage);
  }, [application.id]);

  async function handleSubmitToLos() {
    setSubmitting(true);
    try {
      const result = await api.submitToLos(application.id);
      setSubmitResult({ ok: true, message: `Submitted as LOS loan file #${result.los_result.los_loan_file_id}` });
    } catch (e) {
      setSubmitResult({ ok: false, message: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!coverage) return <Card title="Review & Coverage"><p>Loading…</p></Card>;

  const pct = coverage.total_fillable_by_truv
    ? Math.round((coverage.auto_filled_count / coverage.total_fillable_by_truv) * 100)
    : 0;

  // Only sections Truv can possibly fill are meaningful here — a section
  // with 0 truv_fillable fields isn't "0% coverage," it's just not something
  // Truv has a product for, so it doesn't belong in a Truv coverage report.
  const fillableSections = Object.entries(coverage.by_section).filter(([, bucket]) => bucket.truv_fillable > 0);

  return (
    <Card title="Review & Coverage">
      <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: 'var(--truv-font-display)', fontSize: 48, lineHeight: 1.2, fontWeight: 700, color: 'var(--truv-accent)' }}>
          {coverage.auto_filled_count} / {coverage.total_fillable_by_truv}
        </div>
        <div style={{ fontSize: 14, color: 'var(--truv-grey-60)' }}>
          Truv-fillable fields auto-populated so far ({pct}%)
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fillableSections.map(([key, bucket]) => (
          <SectionBar key={key} label={SECTION_LABELS[key] || key} bucket={bucket} />
        ))}
      </div>

      <p style={{ fontSize: 13, color: 'var(--truv-grey-50)' }}>
        Only sections Truv has a verification product for are shown above. Borrower Information, Loan & Property,
        Declarations, and Demographic Information are always entered manually — that's a real product limit, not a
        UI choice.
      </p>

      {submitResult && (
        <p style={{ fontSize: 13, color: submitResult.ok ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>
          {submitResult.message}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button onClick={handleSubmitToLos} loading={submitting}>Submit to LOS</Button>
      </div>
    </Card>
  );
}

function SectionBar({ label, bucket }) {
  const pct = bucket.truv_fillable ? Math.round((bucket.auto_filled / bucket.truv_fillable) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--truv-grey-60)' }}>{bucket.auto_filled} / {bucket.truv_fillable} auto-filled</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--truv-grey-20)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--truv-accent)' }} />
      </div>
    </div>
  );
}
