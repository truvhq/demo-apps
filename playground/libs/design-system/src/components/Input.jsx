import React, { useState } from 'react';

export function Input({ label, error, warning, hint, value, onChange, placeholder, type = 'text', disabled = false, required = false, ...rest }) {
  const [focused, setFocused] = useState(false);

  let background = 'var(--truv-grey-20)';
  let border = '1px solid transparent';
  if (error) background = 'var(--truv-red-bright)';
  else if (warning) background = 'var(--truv-orange-bright)';
  else if (focused) background = 'var(--truv-white)';

  if (focused && !error) border = '2px solid var(--truv-accent-disabled)';

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--truv-input-label-gap)', fontFamily: 'var(--truv-font-text)' }}>
      {label && (
        <span style={{ fontSize: 'var(--truv-label-size)', lineHeight: 'var(--truv-label-line)', fontWeight: 'var(--truv-label-weight)', letterSpacing: 'var(--truv-label-tracking)', color: 'var(--truv-pure-black)' }}>
          {label}{required && <span style={{ color: 'var(--truv-text-red)' }}> *</span>}
        </span>
      )}
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={{
          fontFamily: 'var(--truv-font-text)',
          fontSize: 'var(--truv-body-size)',
          lineHeight: 'var(--truv-body-line)',
          letterSpacing: 'var(--truv-body-tracking)',
          color: 'var(--truv-primary-black)',
          background,
          border,
          borderRadius: 'var(--truv-radius-input)',
          padding: `var(--truv-input-padding-y) var(--truv-input-padding-x)`,
          outline: 'none',
        }}
        {...rest}
      />
      {error && <span style={{ fontSize: 'var(--truv-body-size)', color: 'var(--truv-text-red)' }}>{error}</span>}
      {!error && hint && <span style={{ fontSize: 'var(--truv-body-size)', color: 'var(--truv-grey-50)' }}>{hint}</span>}
    </label>
  );
}
