import React from 'react';

const VARIANT_STYLES = {
  primary: {
    background: 'var(--truv-accent)',
    color: 'var(--truv-white)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--truv-white)',
    color: 'var(--truv-pure-black)',
    border: '1px solid var(--truv-grey-30)',
  },
};

export function Button({ variant = 'primary', loading = false, disabled = false, icon = null, children, style, ...rest }) {
  const isDisabled = disabled || loading;
  const base = VARIANT_STYLES[variant] ?? VARIANT_STYLES.primary;

  const computedStyle = {
    fontFamily: 'var(--truv-font-text)',
    fontSize: 'var(--truv-button-size)',
    lineHeight: 'var(--truv-button-line)',
    fontWeight: 'var(--truv-button-weight)',
    letterSpacing: 'var(--truv-button-tracking)',
    borderRadius: 'var(--truv-radius-button)',
    height: 'var(--truv-button-height)',
    padding: `0 var(--truv-button-padding-x)`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: isDisabled ? 'default' : 'pointer',
    transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
    ...base,
    ...(isDisabled && variant === 'primary'
      ? { background: 'var(--truv-accent-disabled)', color: 'var(--truv-white)' }
      : {}),
    ...(isDisabled && variant === 'secondary'
      ? { color: 'var(--truv-grey-30)' }
      : {}),
    ...style,
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      style={computedStyle}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        if (variant === 'primary') e.currentTarget.style.background = 'var(--truv-accent-hover)';
        if (variant === 'secondary') { e.currentTarget.style.borderColor = 'var(--truv-accent)'; e.currentTarget.style.color = 'var(--truv-accent)'; }
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return;
        if (variant === 'primary') e.currentTarget.style.background = 'var(--truv-accent)';
        if (variant === 'secondary') { e.currentTarget.style.borderColor = 'var(--truv-grey-30)'; e.currentTarget.style.color = 'var(--truv-pure-black)'; }
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {!loading && children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.35)',
        borderTopColor: '#fff',
        display: 'inline-block',
        animation: 'truv-spin 0.7s linear infinite',
      }}
    />
  );
}
