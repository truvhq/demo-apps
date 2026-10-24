import React from 'react';

import { Chip, Input, Select } from '@truv-demo/design-system';

/** A single URLA field: an Input/Select plus, when Truv auto-filled it, an
 * "Auto-filled by Truv" chip. Clearing the chip just lets the user type over
 * the value — the next save flips FieldFillState to MANUAL server-side.
 *
 * `readOnly` swaps the input for a plain label/value display — used once a
 * record has been saved, so it reads as a settled summary instead of looking
 * like an still-editable, unsaved form. */
export function FieldRow({ fieldKey, fillState, label, value, onChange, type = 'text', options, required, readOnly = false }) {
  const isAutoFilled = fillState?.fill_source === 'truv_auto';
  const isOverride = fillState?.fill_source === 'los_override';

  return (
    <div>
      {readOnly ? (
        <div>
          <div style={{
            fontSize: 'var(--truv-label-size)', lineHeight: 'var(--truv-label-line)', fontWeight: 'var(--truv-label-weight)',
            letterSpacing: 'var(--truv-label-tracking)', color: 'var(--truv-pure-black)', marginBottom: 4,
          }}>
            {label}
          </div>
          <div style={{ fontSize: 'var(--truv-body-size)', color: value ? 'var(--truv-primary-black)' : 'var(--truv-grey-50)' }}>
            {options ? (options.find((o) => o.value === value)?.label ?? value ?? '—') : (value || '—')}
          </div>
        </div>
      ) : options ? (
        <Select label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} options={options} required={required} />
      ) : (
        <Input label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} type={type} required={required} />
      )}
      {isAutoFilled && (
        <div style={{ marginTop: 4 }}>
          <Chip tone="accent">Auto-filled by Truv</Chip>
        </div>
      )}
      {isOverride && (
        <div style={{ marginTop: 4 }}>
          <Chip tone="warning">Corrected by underwriter</Chip>
        </div>
      )}
    </div>
  );
}

export function fillStateFor(fillStates, fieldKey, borrowerId) {
  return fillStates?.find((fs) => fs.field_key === fieldKey && (fs.borrower === borrowerId || fs.borrower === null));
}
