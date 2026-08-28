import React from 'react';

const TONES = {
  accent: { border: 'var(--truv-accent)', color: 'var(--truv-text-accent)', background: 'transparent' },
  success: { border: 'var(--truv-green)', color: 'var(--truv-green)', background: 'transparent' },
  warning: { border: 'var(--truv-orange)', color: 'var(--truv-orange)', background: 'transparent' },
  error: { border: 'var(--truv-red)', color: 'var(--truv-text-red)', background: 'transparent' },
  neutral: { border: 'var(--truv-grey-30)', color: 'var(--truv-grey-60)', background: 'transparent' },
};

/** Standard chip. Use tone="accent" for the "Auto-filled by Truv" badge on wizard fields. */
export function Chip({ tone = 'accent', children, onClear }) {
  const t = TONES[tone] ?? TONES.accent;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--truv-font-text)',
        fontSize: 'var(--truv-body-size)',
        lineHeight: 'var(--truv-body-line)',
        letterSpacing: 'var(--truv-body-tracking)',
        color: t.color,
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--truv-radius-chip)',
        padding: `var(--truv-chip-padding-y) var(--truv-chip-padding-x)`,
      }}
    >
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear and edit"
          style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
