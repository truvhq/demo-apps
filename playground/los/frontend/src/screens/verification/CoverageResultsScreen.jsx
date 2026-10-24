import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Chip } from '@truv-demo/design-system';

export function CoverageResultsScreen({ application, applyResult, returnUrl, onTestAgain }) {
  const navigate = useNavigate();
  const { apply_summary: summary, coverage } = applyResult;
  const pct = coverage.total_fillable_by_truv
    ? Math.round((coverage.auto_filled_count / coverage.total_fillable_by_truv) * 100)
    : 0;

  return (
    <Card title="Truv Verification Applied">
      <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: 'var(--truv-font-display)', fontSize: 48, lineHeight: 1.2, fontWeight: 700, color: 'var(--truv-accent)' }}>
          {pct}%
        </div>
        <div style={{ fontSize: 14, color: 'var(--truv-grey-60)' }}>
          {coverage.auto_filled_count} of {coverage.total_fillable_by_truv} Truv-fillable fields now auto-filled
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Just applied ({summary.applied.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {summary.applied.map((key) => <Chip key={key} tone="success">{key}</Chip>)}
          {summary.applied.length === 0 && <span style={{ color: 'var(--truv-grey-50)', fontSize: 13 }}>Nothing new — order may still be processing.</span>}
        </div>
      </div>

      {summary.skipped_manual.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Skipped (already manually entered)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {summary.skipped_manual.map((key) => <Chip key={key} tone="warning">{key}</Chip>)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {onTestAgain && <Button variant="secondary" onClick={onTestAgain}>← Back to Configuration</Button>}
        <Button onClick={() => navigate(returnUrl || `/loan-files/${application.id}`)}>Back to Loan File</Button>
      </div>
    </Card>
  );
}
