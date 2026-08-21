import React from 'react';

export function Switch({ label, checked, onChange, disabled = false }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span
        onClick={() => !disabled && onChange?.(!checked)}
        style={{
          width: 'var(--truv-switch-width)',
          height: 'var(--truv-switch-height)',
          borderRadius: 'var(--truv-switch-height)',
          background: checked ? 'var(--truv-accent)' : 'var(--truv-grey-30)',
          position: 'relative',
          transition: 'background-color 120ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 'calc(100% - 22px)' : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--truv-white)',
            transition: 'left 120ms ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        />
      </span>
      {label && (
        <span style={{ fontSize: 'var(--truv-label-size)', fontWeight: 'var(--truv-label-weight)', letterSpacing: 'var(--truv-label-tracking)', color: 'var(--truv-pure-black)' }}>
          {label}
        </span>
      )}
    </label>
  );
}
