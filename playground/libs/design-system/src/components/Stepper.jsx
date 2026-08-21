import React from 'react';

/** Horizontal step indicator for wizard-style flows (POS ApplicationWizard, Bridge flow screens).
 *
 * `completedIndices` (optional Set/array of step indices) drives the "done"
 * checkmark from actual saved data rather than pure position — a step with
 * real data shows done even if the wizard hasn't been navigated past it yet
 * (e.g. reopening an already-submitted application). Omit it to fall back to
 * the old positional behavior (steps before currentIndex read as done).
 *
 * `onStepClick` (optional) makes every step directly navigable, not just
 * reachable via Back/Next — needed so a returning user can jump straight to
 * any section instead of stepping through sequentially. */
export function Stepper({ steps, currentIndex, completedIndices, onStepClick }) {
  const completed = completedIndices instanceof Set ? completedIndices : new Set(completedIndices || []);
  const hasCompletionData = completedIndices !== undefined;

  return (
    <ol style={{ display: 'flex', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const state = hasCompletionData
          ? (completed.has(i) ? 'done' : i === currentIndex ? 'current' : 'upcoming')
          : (i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming');
        const color =
          state === 'current' ? 'var(--truv-accent)' :
          state === 'done' ? 'var(--truv-green)' : 'var(--truv-grey-30)';
        const textColor = state === 'upcoming' ? 'var(--truv-grey-60)' : 'var(--truv-pure-black)';
        const clickable = !!onStepClick;
        return (
          <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <button
              type="button"
              onClick={clickable ? () => onStepClick(i) : undefined}
              disabled={!clickable}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0,
                cursor: clickable ? 'pointer' : 'default', font: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: state === 'upcoming' ? 'var(--truv-white)' : color,
                border: `2px solid ${color}`,
                color: state === 'upcoming' ? color : 'var(--truv-white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--truv-font-text)',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: textColor, whiteSpace: 'nowrap' }}>{step}</span>
            </button>
            {i < steps.length - 1 && <span style={{ flex: 1, height: 1, background: 'var(--truv-grey-30)' }} />}
          </li>
        );
      })}
    </ol>
  );
}
