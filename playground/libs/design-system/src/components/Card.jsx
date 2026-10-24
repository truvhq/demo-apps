import React from 'react';

export function Card({ title, actions, children, style }) {
  return (
    <div
      style={{
        background: 'var(--truv-white)',
        border: '1px solid var(--truv-grey-30)',
        borderRadius: 'var(--truv-radius-card)',
        padding: 'var(--truv-card-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--truv-card-gap)',
        // A Card is frequently a CSS grid/flex item (e.g. two-column layouts).
        // Grid/flex items default to min-width: auto, which lets intrinsic
        // content (a long unbroken string, a tight button row) blow out past
        // the item's allotted track instead of wrapping/scrolling internally
        // — this is what fixes that class of overflow at the source.
        minWidth: 0,
        ...style,
      }}
    >
      {(title || actions) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {title && (
            <h2 style={{
              fontSize: 'var(--truv-h2-size)',
              lineHeight: 'var(--truv-h2-line)',
              fontWeight: 'var(--truv-h2-weight)',
              letterSpacing: 'var(--truv-h2-tracking)',
              color: 'var(--truv-pure-black)',
            }}>
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
