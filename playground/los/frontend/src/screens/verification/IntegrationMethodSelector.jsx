import React from 'react';

const METHODS = [
  { value: 'embedded_order', label: 'Embedded Orders', desc: 'In-app Bridge widget, employer search included. Truv\'s recommended default.' },
  { value: 'hosted_order', label: 'Hosted Orders', desc: 'No widget — Truv emails/texts the borrower a verification link.' },
  { value: 'bridge_token', label: 'Bridge Token', desc: 'In-app widget for a known employer/account (Deposit Switch, PLL).' },
  { value: 'document_upload', label: 'Document Processing', desc: 'AIM Check — upload paystubs/W-2s for OCR-based verification.' },
];

export function IntegrationMethodSelector({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {METHODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            style={{
              textAlign: 'left',
              border: `1px solid ${active ? 'var(--truv-accent)' : 'var(--truv-grey-30)'}`,
              background: active ? 'var(--truv-accent-disabled)' : 'var(--truv-white)',
              borderRadius: 12,
              padding: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--truv-accent-hover)' : 'var(--truv-pure-black)' }}>{m.label}</div>
            <div style={{ fontSize: 12, color: 'var(--truv-grey-60)', marginTop: 4 }}>{m.desc}</div>
          </button>
        );
      })}
    </div>
  );
}
