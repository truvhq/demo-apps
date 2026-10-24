import React from 'react';
import { Input } from './Input.jsx';

export function Select({ label, value, onChange, options = [], placeholder = 'Select...', required = false, disabled = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--truv-input-label-gap)', fontFamily: 'var(--truv-font-text)' }}>
      {label && (
        <span style={{ fontSize: 'var(--truv-label-size)', lineHeight: 'var(--truv-label-line)', fontWeight: 'var(--truv-label-weight)', letterSpacing: 'var(--truv-label-tracking)', color: 'var(--truv-pure-black)' }}>
          {label}{required && <span style={{ color: 'var(--truv-text-red)' }}> *</span>}
        </span>
      )}
      <select
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        style={{
          fontFamily: 'var(--truv-font-text)',
          fontSize: 'var(--truv-body-size)',
          lineHeight: 'var(--truv-body-line)',
          color: value ? 'var(--truv-primary-black)' : 'var(--truv-grey-50)',
          background: 'var(--truv-grey-20)',
          border: 'none',
          borderRadius: 'var(--truv-radius-input)',
          padding: `var(--truv-input-padding-y) var(--truv-input-padding-x)`,
          outline: 'none',
        }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

export { Input };
